// engine/sound/worklet.js — the synthesizer running on the browser's audio thread (an
// AudioWorklet), so music never stutters when the game is busy. player.js loads it; messages are
// the engine's (synth.js). Positions go back as { t: 'pos', order, section, step, ctxTime }.
import { createEngine } from './synth.js';

class PixelYakSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.eng = createEngine(sampleRate);
    this.t0 = 0;
    this.f0 = 0;
    this.eng.onPosition((p) => this.port.postMessage({ t: 'pos', ...p, ctxTime: this.t0 + (p.frame - this.f0) / sampleRate }));
    this.port.onmessage = (e) => this.eng.handle(e.data);
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    this.t0 = currentTime;
    this.f0 = this.eng.frame();
    const L = out[0], R = out[1] || new Float32Array(L.length);
    this.eng.process(L, R, L.length);
    return true;
  }
}

registerProcessor('pixel-yak-synth', PixelYakSynth);
