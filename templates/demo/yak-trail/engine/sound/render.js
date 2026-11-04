// engine/sound/render.js — offline rendering: a song or sound effect → samples, samples → a WAV
// file, and the numbers that tell an AI a render is healthy without listening (length, peak,
// loudness, NaN, clipping). Pure JavaScript: Node (the CLI's render-song, tests) and browsers.
import { createEngine } from './synth.js';
import { songSeconds, sfxSeconds } from './song.js';

const BLOCK = 512;

// Render with a fresh engine. setup(engine) sends the messages; returns { left, right, sampleRate }.
export function renderWith(seconds, setup, { sampleRate = 44100, seed } = {}) {
  const frames = Math.max(1, Math.ceil(seconds * sampleRate));
  const eng = createEngine(sampleRate, seed != null ? { seed } : undefined);
  setup(eng);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const bl = new Float32Array(BLOCK), br = new Float32Array(BLOCK);
  for (let i = 0; i < frames; i += BLOCK) {
    const n = Math.min(BLOCK, frames - i);
    eng.process(bl, br, n);
    left.set(bl.subarray(0, n), i);
    right.set(br.subarray(0, n), i);
  }
  return { left, right, sampleRate };
}

// A compiled song (song.js compileSong). seconds: default one pass through its order plus a
// tail for the last notes to ring out (looping songs: one loop, no tail).
export function renderSong(compiled, { seconds = null, sampleRate = 44100, tail = 1.5, range = null } = {}) {
  const pass = songSeconds(compiled);
  const len = seconds != null ? seconds : pass + (compiled.loop === false ? tail : 0);
  return renderWith(len, (eng) => eng.handle({ t: 'play', song: structuredCloneSafe(compiled), range }), { sampleRate });
}

export function renderSfx(compiled, { sampleRate = 44100, seconds = null } = {}) {
  return renderWith(seconds != null ? seconds : sfxSeconds(compiled) + 0.3, (eng) => eng.handle({ t: 'sfx', sfx: compiled }), { sampleRate });
}

// The engine indexes the song in place; a copy keeps the caller's object as it was.
function structuredCloneSafe(o) {
  return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

// --------------------------------------------------------------------- numbers ---
const db = (v) => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -Infinity);

// { seconds, peak, peakDb, rms, rmsDb, nan, clipped, silent, loudest: [s, s] }
export function audioStats({ left, right, sampleRate }) {
  let peak = 0, sum = 0, nan = 0, clipped = 0, at = 0, n = 0;
  const win = Math.max(1, Math.round(sampleRate * 0.4));
  let best = 0, bestAt = 0, acc = 0;
  const chans = right ? [left, right] : [left];
  for (let i = 0; i < left.length; i++) {
    let e = 0;
    for (const ch of chans) {
      const v = ch[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) { peak = a; at = i; }
      if (a >= 0.999) clipped++;
      sum += v * v; n++; e += v * v;
    }
    acc += e;
    if (i >= win) { for (const ch of chans) { const v = ch[i - win]; if (Number.isFinite(v)) acc -= v * v; } }
    if (acc > best) { best = acc; bestAt = i; }
  }
  const rms = n ? Math.sqrt(sum / n) : 0;
  return {
    seconds: Math.round((left.length / sampleRate) * 1000) / 1000,
    peak: Math.round(peak * 10000) / 10000, peakDb: db(peak), peakAt: Math.round((at / sampleRate) * 100) / 100,
    rms: Math.round(rms * 10000) / 10000, rmsDb: db(rms),
    nan, clipped, silent: peak < 1e-4,
    loudest: [Math.max(0, Math.round(((bestAt - win) / sampleRate) * 100) / 100), Math.round((bestAt / sampleRate) * 100) / 100],
  };
}

// ------------------------------------------------------------------------- WAV ---
// 16-bit PCM (or 32-bit float with bits: 32), stereo when right is given. → Uint8Array
export function encodeWav({ left, right, sampleRate }, { bits = 16 } = {}) {
  const ch = right ? 2 : 1, frames = left.length, bps = bits === 32 ? 4 : 2;
  const data = frames * ch * bps;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits === 32 ? 32 : 16, true);
  str(36, 'data'); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      let s = (c ? right : left)[i];
      if (!Number.isFinite(s)) s = 0;
      s = Math.max(-1, Math.min(1, s));
      if (bits === 32) { v.setFloat32(o, s, true); o += 4; }
      else { v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true); o += 2; }
    }
  }
  return new Uint8Array(buf);
}

// A WAV file (PCM 8/16/24/32-bit or 32-bit float) → { channels: [Float32Array…], sampleRate }.
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let o = 12, fmt = null;
  while (o + 8 <= u8.length) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      fmt = { format: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
      if (fmt.format === 0xfffe && size >= 26) fmt.format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE: the real format code
    }
    if (id === 'data') {
      if (!fmt) throw new Error('WAV data before its format');
      const bps = fmt.bits / 8, frames = Math.floor(Math.min(size, u8.length - body) / (bps * fmt.ch));
      const float = fmt.format === 3;
      const chans = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.ch; c++) {
          const p = body + (i * fmt.ch + c) * bps;
          let s;
          if (float) s = v.getFloat32(p, true);
          else if (fmt.bits === 16) s = v.getInt16(p, true) / 32768;
          else if (fmt.bits === 24) { const x = u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16); s = (x & 0x800000 ? x - 0x1000000 : x) / 8388608; }
          else if (fmt.bits === 32) s = v.getInt32(p, true) / 2147483648;
          else s = (u8[p] - 128) / 128;
          chans[c][i] = s;
        }
      }
      return { channels: chans, sampleRate: fmt.sr, bits: fmt.bits };
    }
    o = body + size + (size & 1);
  }
  throw new Error('WAV file has no data');
}

// Mono mix of any number of channels.
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}
