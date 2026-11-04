// engine/sound/player.js — real-time playback in a browser: an AudioContext with the synthesizer
// in an AudioWorklet (worklet.js), or — where worklets aren't available — the same engine on the
// main thread through a ScriptProcessor. Browsers only start audio after a click or key press,
// so create the player from an input handler (defineSound's unlock() does this for games).
//
// const p = await createPlayer();  p.send({ t: 'play', song: compiled });  p.onMessage((m) => …)
import { createEngine } from './synth.js';

const WORKLET_URL = new URL('./worklet.js', import.meta.url).href;
const loaded = new WeakSet(); // contexts that already have the worklet module

export async function createPlayer({ context = null, latencyHint = 'interactive', worklet = true } = {}) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!context && !AC) return null;
  const ctx = context || new AC({ latencyHint });
  const listeners = new Set();
  const emit = (m) => { for (const cb of listeners) { try { cb(m); } catch (err) { console.error('[sound]', err); } } };
  let node = null, send = null, mode = null;
  if (worklet && ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
    try {
      if (!loaded.has(ctx)) { await ctx.audioWorklet.addModule(WORKLET_URL); loaded.add(ctx); }
      node = new AudioWorkletNode(ctx, 'pixel-yak-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => emit(e.data);
      send = (m) => node.port.postMessage(m);
      mode = 'worklet';
    } catch (err) {
      console.warn(`[sound] audio worklet unavailable (${err.message}); playing on the main thread`);
      node = null;
    }
  }
  if (!node) {
    const eng = createEngine(ctx.sampleRate);
    let t0 = 0, f0 = 0;
    eng.onPosition((p) => emit({ t: 'pos', ...p, ctxTime: t0 + (p.frame - f0) / ctx.sampleRate }));
    node = ctx.createScriptProcessor(2048, 0, 2);
    node.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
      t0 = e.playbackTime; f0 = eng.frame();
      eng.process(L, R, L.length);
    };
    send = (m) => eng.handle(m);
    mode = 'script';
  }
  node.connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return {
    ctx,
    mode,
    send,
    onMessage(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    resume: () => (ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()),
    // the audio clock, minus what's still on its way to the speakers
    now: () => ctx.currentTime - (ctx.outputLatency || 0),
    async close() { try { node.disconnect(); } catch { /* gone */ } if (!context) await ctx.close().catch(() => {}); },
  };
}
