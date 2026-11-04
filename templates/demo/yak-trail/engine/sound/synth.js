// engine/sound/synth.js — Pixel Yak's synthesizer. Every sound is computed sample by sample in
// plain JavaScript (no audio files, no Web Audio nodes), so the same code plays a game in an
// audio worklet, renders a WAV in Node, and runs in tests — and the same song always makes the
// same samples (all noise is seeded).
//
// Voices (the instrument types of song.js):
//   synth  up to 3 oscillators (+ sub, breath noise) → filter with a sweep → ADSR; vibrato, scoop
//   pluck  Karplus-Strong string (a seeded noise burst circulating in a tuned delay line)
//   fm     two-operator FM bell
//   hit    one tone or noise burst with a pitch/filter sweep — drum pieces and sound effects
// Mix: music and sound effects each have a volume; every voice sends some of itself to one
// shared reverb ("echo"); the master runs through a gentle compressor and a soft limiter, so
// the output never reaches ±1.
//
// createEngine(sampleRate) → { handle(msg), process(left, right, frames), onPosition(cb), … }.
// Messages (player.js sends them; render.js calls handle() directly):
//   { t: 'play', song: <compiled song>, at: { order, step }, range: { section, from, to }, fade }
//   { t: 'update', song }   swap the song's notes, keep playing where it is
//   { t: 'stop', fade }     { t: 'range', range }   { t: 'mute', keys }   { t: 'solo', keys }
//   { t: 'sfx', sfx: <compiled sound effect> }      { t: 'note', type, p, kit, midi, hits, len, vel }
//   { t: 'volume', music, sfx, master }
import { mtof } from './notation.js';

const TAU = Math.PI * 2;
const MAX_VOICES = 128;
const LN_SILENT = Math.log(1e-4); // -80 dB: where an exponential decay counts as gone
const CENT = Math.LN2 / 1200;
const WAVE_CODE = { sine: 0, triangle: 1, saw: 2, square: 3, pulse: 4, off: -1 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- building blocks ---
// RBJ biquad, transposed direct form II.
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(type, freq, q, sr) {
    const f = Math.max(10, Math.min(freq, sr * 0.45));
    const w = (TAU * f) / sr, cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(0.05, q));
    const a0 = 1 + alpha;
    let b0, b1, b2;
    if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
    else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

// Band-limited step correction for saw/square edges (keeps high notes from fizzing).
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function osc(code, ph, dt) {
  switch (code) {
    case 0: return Math.sin(TAU * ph);
    case 1: return 1 - 4 * Math.abs(ph - 0.5);
    case 2: return 2 * ph - 1 - blep(ph, dt);
    case 3: { let v = ph < 0.5 ? 1 : -1; v += blep(ph, dt); const q = ph + 0.5; v -= blep(q >= 1 ? q - 1 : q, dt); return v; }
    case 4: { let v = ph < 0.25 ? 1 : -1; v += blep(ph, dt); const q = ph + 0.75; v -= blep(q >= 1 ? q - 1 : q, dt); return v - 0.5; }
    default: return 0;
  }
}

const panL = (pan) => Math.cos(((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4);
const panR = (pan) => Math.sin(((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4);
const decayCoef = (sec, sr) => Math.exp(LN_SILENT / Math.max(1, sec * sr));

// Freeverb-style reverb: mono in, stereo out.
function createReverb(sr) {
  const scale = sr / 44100;
  const mk = (len) => ({ buf: new Float32Array(Math.max(8, Math.round(len * scale))), i: 0, store: 0 });
  const combs = [1116, 1188, 1277, 1356, 1422, 1491];
  const aps = [556, 441, 341];
  const cl = combs.map(mk), cr = combs.map((t) => mk(t + 23));
  const al = aps.map(mk), ar = aps.map((t) => mk(t + 23));
  const fb = 0.83, damp = 0.3, gain = 0.018;
  const comb = (c, x) => {
    const y = c.buf[c.i];
    let s = y * (1 - damp) + c.store * damp;
    if (s < 1e-18 && s > -1e-18) s = 0; // no denormals in long silences
    c.store = s;
    c.buf[c.i] = x + s * fb;
    if (++c.i >= c.buf.length) c.i = 0;
    return y;
  };
  const ap = (a, x) => {
    const b = a.buf[a.i];
    a.buf[a.i] = x + b * 0.5;
    if (++a.i >= a.buf.length) a.i = 0;
    return b - x;
  };
  const out = { l: 0, r: 0 };
  return {
    out,
    tick(x) {
      const v = x * gain;
      let l = 0, r = 0;
      for (let j = 0; j < cl.length; j++) { l += comb(cl[j], v); r += comb(cr[j], v); }
      for (let j = 0; j < al.length; j++) { l = ap(al[j], l); r = ap(ar[j], r); }
      out.l = l; out.r = r;
    },
  };
}

// ---------------------------------------------------------------------- voices ---
// Every voice: at (first sample, absolute), group (gain ramp: song fades, the sfx bus), gl/gr
// (pan × level), send (reverb), done. render() adds frames i0..n-1 of the current block.

class SynthVoice {
  constructor(eng, p, midi, gate, amp) {
    const sr = eng.sr;
    this.sr = sr;
    this.f = mtof(midi);
    this.amp = amp * p.level;
    this.k = 0;
    this.gateK = Math.max(1, Math.round(gate * sr));
    this.aInc = 1 / Math.max(1, p.attack * sr);
    this.dC = Math.exp(Math.log(0.01) / Math.max(1, p.decay * sr));
    this.sus = p.sustain;
    this.rC = decayCoef(p.release, sr);
    this.lvl = 0; this.stage = 0; // 0 attack, 1 decay/sustain, 2 release
    this.lifeK = this.gateK + Math.round((p.release + 0.05) * sr) + Math.round(p.attack * sr);
    // oscillators
    const waves = [p.wave, p.wave2, p.wave3], levels = [1, p.level2, p.level3];
    const ratios = [1, Math.pow(2, p.oct2 + p.detune2 / 1200), Math.pow(2, p.oct3 + p.detune3 / 1200)];
    this.n = 0;
    this.code = new Int8Array(3); this.rat = new Float64Array(3); this.lev = new Float64Array(3); this.ph = new Float64Array(3);
    for (let j = 0; j < 3; j++) {
      const c = WAVE_CODE[waves[j]] ?? -1;
      if (c < 0 || levels[j] <= 0) continue;
      this.code[this.n] = c; this.rat[this.n] = ratios[j]; this.lev[this.n] = levels[j]; this.ph[this.n] = (midi * 0.137 * (j + 1)) % 1;
      this.n++;
    }
    const norm = 1 / Math.max(1, levels.slice(0, 3).reduce((s, v, j) => s + ((WAVE_CODE[waves[j]] ?? -1) >= 0 ? v : 0), 0) * 0.8);
    this.norm = norm;
    this.sub = p.sub; this.subPh = 0;
    this.breath = p.breath;
    if (this.breath > 0) { this.bp = new Biquad(); this.bp.set('bandpass', Math.min(6000, this.f * 3), 1.4, sr); this.noise = eng.noise; this.nOff = (midi * 7919) & 65535; }
    // pitch: scoop up into the note, vibrato that fades in
    this.scoopF = p.scoop > 0 ? Math.exp(-p.scoop * CENT) : 1;
    this.scoopC = Math.exp(-5 / Math.max(1, p.stime * sr));
    this.vib = p.vibrato; this.vInc = p.vrate / sr; this.vPh = 0; this.vRamp = 1 / Math.max(1, p.vdelay * sr);
    // filter + sweep
    this.filt = new Biquad();
    this.ftype = p.filter; this.cut = p.cutoff; this.q = p.q; this.fenv = p.fenv; this.fK = Math.max(1, p.ftime * sr);
    this.filt.set(this.ftype, this.cut * this.fenv, this.q, sr);
    this.sweeping = this.fenv > 1.001;
  }
  render(L, R, S, i0, n, grp) {
    const sr = this.sr;
    let g = grp.g0 + grp.gs * i0;
    for (let i = i0; i < n; i++, g += grp.gs) {
      const k = this.k++;
      // envelope
      if (this.stage < 2 && k >= this.gateK) this.stage = 2;
      if (this.stage === 0) { this.lvl += this.aInc; if (this.lvl >= 1) { this.lvl = 1; this.stage = 1; } }
      else if (this.stage === 1) this.lvl = this.sus + (this.lvl - this.sus) * this.dC;
      else { this.lvl *= this.rC; if (this.lvl < 1e-4 || k > this.lifeK) { this.done = true; return; } }
      // pitch
      if (this.scoopF < 0.99999) this.scoopF = 1 - (1 - this.scoopF) * this.scoopC;
      let f = this.f * this.scoopF;
      if (this.vib > 0) {
        this.vPh += this.vInc; if (this.vPh >= 1) this.vPh -= 1;
        const depth = this.vib * Math.min(1, k * this.vRamp);
        f *= 1 + depth * CENT * Math.sin(TAU * this.vPh);
      }
      // oscillators
      let x = 0;
      for (let j = 0; j < this.n; j++) {
        const dt = (f * this.rat[j]) / sr;
        let ph = this.ph[j] + dt;
        if (ph >= 1) ph -= Math.floor(ph);
        this.ph[j] = ph;
        x += this.lev[j] * osc(this.code[j], ph, dt);
      }
      x *= this.norm;
      if (this.sub > 0) { this.subPh += (f * 0.5) / sr; if (this.subPh >= 1) this.subPh -= 1; x += this.sub * Math.sin(TAU * this.subPh); }
      if (this.breath > 0) x += this.breath * 2.5 * this.bp.run(this.noise[(this.nOff + k) & 65535]);
      // filter sweep (coefficients every 32 samples)
      if (this.sweeping && (k & 31) === 0) {
        const t = k / this.fK;
        if (t >= 1) { this.filt.set(this.ftype, this.cut, this.q, sr); this.sweeping = false; }
        else this.filt.set(this.ftype, this.cut * Math.pow(this.fenv, 1 - t), this.q, sr);
      }
      const y = this.filt.run(x) * this.lvl * this.amp * g;
      L[i] += y * this.gl; R[i] += y * this.gr; S[i] += y * this.send;
    }
  }
}

class PluckVoice {
  constructor(eng, p, midi, gate, amp) {
    const sr = eng.sr;
    const f = mtof(midi);
    this.D = Math.max(2, sr / f - 0.5); // loop delay (fractional); pitch = sr / (D + 0.5)
    const init = Math.ceil(this.D) + 1;
    this.M = init + 4;
    this.buf = new Float32Array(this.M);
    this.init = init;
    // the pluck: seeded noise, softened by brightness, normalised to a peak of 1
    const rnd = mulberry32(midi * 31 + 3);
    let last = 0, peak = 0;
    for (let i = 0; i < init; i++) { last += (rnd() * 2 - 1 - last) * p.bright; this.buf[i] = last; peak = Math.max(peak, Math.abs(last)); }
    if (peak > 0) for (let i = 0; i < init; i++) this.buf[i] /= peak;
    const base = midi < 55 ? 0.9985 : midi < 70 ? 0.997 : 0.9945;
    this.g = 0.5 * (1 - (1 - base) * Math.pow(4, 1 - 2 * p.sustain));
    this.k = 0;
    this.amp = amp * p.level;
    this.holdK = Math.round((gate + 0.05) * sr);
    this.rC = decayCoef(p.ring, sr);
    this.fade = 1;
    this.lifeK = this.holdK + Math.round((p.ring + 0.05) * sr);
    this.lp = new Biquad();
    this.lp.set('lowpass', (2400 + Math.min(1, amp) * 3200) * p.tone, 0.7, sr);
  }
  read(x) {
    const i = Math.floor(x), fr = x - i, M = this.M;
    return this.buf[i % M] * (1 - fr) + this.buf[(i + 1) % M] * fr;
  }
  render(L, R, S, i0, n, grp) {
    let g = grp.g0 + grp.gs * i0;
    for (let i = i0; i < n; i++, g += grp.gs) {
      const k = this.k++;
      let y;
      if (k < this.init) y = this.buf[k];
      else {
        const r = k - this.D; // ≥ 1 here, so r - 1 never reads before the buffer
        y = this.g * (this.read(r) + this.read(r - 1));
        this.buf[k % this.M] = y;
      }
      if (k > this.holdK) {
        this.fade *= this.rC;
        if (this.fade < 1e-4 || k > this.lifeK) { this.done = true; return; }
      }
      const out = this.lp.run(y) * this.amp * this.fade * g;
      L[i] += out * this.gl; R[i] += out * this.gr; S[i] += out * this.send;
    }
  }
}

class FmVoice {
  constructor(eng, p, midi, gate, amp) {
    const sr = eng.sr;
    this.sr = sr;
    this.f = mtof(midi);
    this.ratio = p.ratio;
    this.b0 = p.index / Math.max(0.01, p.ratio);
    this.b1 = Math.max(1e-3, p.indexEnd) / Math.max(0.01, p.ratio);
    this.iK = Math.max(1, p.itime * sr);
    this.beta = this.b0;
    this.amp = amp * p.level;
    this.aK = Math.max(1, Math.round(p.attack * sr));
    const total = Math.max(0.3, gate) + p.decay;
    this.dC = decayCoef(total, sr);
    this.lvl = 1;
    this.lifeK = this.aK + Math.round(total * sr);
    this.k = 0; this.pc = 0; this.pm = 0;
  }
  render(L, R, S, i0, n, grp) {
    const sr = this.sr, dc = this.f / sr, dm = (this.f * this.ratio) / sr;
    let g = grp.g0 + grp.gs * i0;
    for (let i = i0; i < n; i++, g += grp.gs) {
      const k = this.k++;
      if (k > this.lifeK) { this.done = true; return; }
      if ((k & 31) === 0) this.beta = k >= this.iK ? this.b1 : this.b0 * Math.pow(this.b1 / this.b0, k / this.iK);
      let e;
      if (k < this.aK) e = k / this.aK; else { this.lvl *= this.dC; e = this.lvl; }
      this.pc += dc; if (this.pc >= 1) this.pc -= 1;
      this.pm += dm; if (this.pm >= 1) this.pm -= 1;
      const y = Math.sin(TAU * this.pc + this.beta * Math.sin(TAU * this.pm)) * e * this.amp * g;
      L[i] += y * this.gl; R[i] += y * this.gr; S[i] += y * this.send;
    }
  }
}

// One tone or noise burst (a drum piece's layer, or a sound effect's layer).
class HitVoice {
  constructor(eng, l, amp) {
    const sr = eng.sr;
    this.sr = sr;
    this.l = l;
    this.k = 0;
    this.amp = amp * l.vol;
    this.aK = Math.round(l.attack * sr);
    this.dC = decayCoef(l.len, sr);
    this.lvl = 1;
    this.lifeK = this.aK + Math.round(l.len * sr) + 1;
    this.sK = Math.max(1, l.sweep * sr);
    this.fr = l.to > 0 && l.from > 0 ? l.to / l.from : 1;
    this.f = l.from;
    if (l.kind === 'tone') {
      this.code = WAVE_CODE[l.wave] ?? 0;
      this.parts = l.partials;
      this.ph = new Float64Array(this.parts ? this.parts.length : 1);
      if (l.lp) { this.lp = new Biquad(); this.lp.set('lowpass', l.lp, l.q, sr); }
    } else {
      this.noise = eng.noise;
      this.nOff = eng.nextNoiseOffset();
      if (l.filter !== 'none') { this.flt = new Biquad(); this.flt.set(l.filter, l.from, l.q, sr); }
    }
  }
  render(L, R, S, i0, n, grp) {
    const sr = this.sr, l = this.l;
    let g = grp.g0 + grp.gs * i0;
    for (let i = i0; i < n; i++, g += grp.gs) {
      const k = this.k++;
      if (k > this.lifeK) { this.done = true; return; }
      // frequency sweep (exponential, from → to over sweep seconds)
      if ((k & 15) === 0) {
        this.f = k >= this.sK ? l.from * this.fr : l.from * Math.pow(this.fr, k / this.sK);
        if (this.flt && (k & 31) === 0) this.flt.set(l.filter, this.f, l.q, sr);
      }
      let x;
      if (l.kind === 'tone') {
        if (this.parts) {
          x = 0;
          for (let j = 0; j < this.parts.length; j++) {
            let ph = this.ph[j] + (this.f * this.parts[j][0]) / sr;
            if (ph >= 1) ph -= Math.floor(ph);
            this.ph[j] = ph;
            x += Math.sin(TAU * ph) * this.parts[j][1];
          }
          x *= 0.4;
        } else {
          const dt = this.f / sr;
          let ph = this.ph[0] + dt;
          if (ph >= 1) ph -= Math.floor(ph);
          this.ph[0] = ph;
          x = osc(this.code, ph, dt);
        }
        if (this.lp) x = this.lp.run(x);
      } else {
        x = this.noise[(this.nOff + k) & 65535];
        if (this.flt) x = this.flt.run(x);
      }
      let e;
      if (k < this.aK) e = k / this.aK; else { e = this.lvl; this.lvl *= this.dC; }
      const y = x * e * this.amp * g;
      L[i] += y * this.gl; R[i] += y * this.gr; S[i] += y * this.send;
    }
  }
}

// ----------------------------------------------------------------------- engine ---
export function createEngine(sampleRate = 44100, { seed = 7 } = {}) {
  const sr = sampleRate;
  const rnd = mulberry32(seed);
  const noise = new Float32Array(65536);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd() * 2 - 1;
  let noiseSeq = 0;
  const eng = { sr, noise, nextNoiseOffset: () => (Math.imul(++noiseSeq, 0x9e3779b1) >>> 16) & 65535 };

  const voices = [];
  const groups = new Set();
  const sfxGroup = { g: 1, target: 1, rate: 0, g0: 1, gs: 0, bus: 'sfx' };
  groups.add(sfxGroup);
  const vol = { music: 0.62, sfx: 0.75, master: 0.85 };
  const reverb = createReverb(sr);
  // makeup: the mix is written with headroom (track volumes ~0.3–0.7); the compressor and the
  // soft limiter keep the louder result below full scale
  const comp = { env: 0, atk: Math.exp(-1 / (0.004 * sr)), rel: Math.exp(-1 / (0.25 * sr)), thr: 0.5, ratio: 3, makeup: 2 };
  let now = 0;
  let seq = null; // { song, group, oi, step, nextAt, range, stopped }
  const muted = new Set(), solo = new Set();
  let posCb = null, lastPos = null;
  let mixL = new Float32Array(0), mixR = mixL, send = mixL;

  function prepare(song) {
    for (const sec of Object.values(song.sections || {})) {
      for (const tr of sec.tracks) {
        tr.byStep = new Array(sec.len);
        for (const ev of tr.events) (tr.byStep[ev.step] ||= []).push(ev);
      }
    }
    return song;
  }

  function addVoice(v, at, group, pan, echo, level = 1) {
    v.at = at; v.group = group; v.gl = panL(pan) * level; v.gr = panR(pan) * level; v.send = echo; v.done = false;
    if (voices.length >= MAX_VOICES) { voices.shift(); }
    voices.push(v);
  }

  function spawnNote(type, p, midi, gate, amp, pan, echo, at, group) {
    const v = type === 'pluck' ? new PluckVoice(eng, p, midi, gate, amp) : type === 'fm' ? new FmVoice(eng, p, midi, gate, amp) : new SynthVoice(eng, p, midi, gate, amp);
    addVoice(v, at, group, pan, echo);
  }
  function spawnHit(l, at, amp, pan, echo, group) {
    addVoice(new HitVoice(eng, l, amp), at + Math.round(l.at * sr), group, l.pan ?? pan, l.echo ?? echo);
  }

  function trigger(tr, ev, at, group, stepSec) {
    const amp = tr.vol * ev.vel;
    if (tr.type === 'drums') {
      for (const h of ev.hits) { const piece = tr.kit && tr.kit[h]; if (piece) for (const l of piece) spawnHit(l, at, amp * tr.p.level, tr.pan, tr.echo, group); }
    } else {
      for (const m of ev.midi) spawnNote(tr.type, tr.p, m, ev.len * stepSec, amp, tr.pan, tr.echo, at, group);
    }
  }

  function stepAt(t) {
    const s = seq, c = s.song;
    const secKey = c.order[s.oi];
    const sec = c.sections[secKey];
    if (!sec || sec.len <= 0) { advanceSection(); s.guard = (s.guard || 0) + 1; if (s.guard > c.order.length + 1) stopSong(0.05); return; }
    s.guard = 0;
    for (const tr of sec.tracks) {
      if (tr.mute || muted.has(tr.key) || (solo.size && !solo.has(tr.key))) continue;
      const evs = tr.byStep && tr.byStep[s.step];
      if (evs) for (const ev of evs) trigger(tr, ev, t, s.group, c.stepSec);
    }
    lastPos = { order: s.oi, section: secKey, step: s.step, frame: t, time: t / sr };
    if (posCb) posCb(lastPos);
    s.step++;
    s.nextAt += c.stepSec * sr;
    const end = s.range && s.range.oi === s.oi ? Math.min(sec.len, s.range.to) : sec.len;
    if (s.step >= end) {
      if (s.range && s.range.oi === s.oi) s.step = s.range.from;
      else advanceSection();
    }
  }
  function advanceSection() {
    const s = seq, c = s.song;
    s.step = 0;
    if (++s.oi >= c.order.length) {
      if (c.loop === false) { s.stopped = true; s.ended = true; if (posCb) posCb({ ended: true, frame: Math.round(s.nextAt), time: s.nextAt / sr }); return; }
      s.oi = c.loop === true ? 0 : c.loop;
    }
  }

  function fadeGroup(gr, sec) {
    gr.target = 0;
    gr.rate = sec > 0 ? 1 / (sec * sr) : 1;
  }
  function stopSong(fade = 0.6) {
    if (!seq) return;
    seq.stopped = true;
    fadeGroup(seq.group, fade);
    seq = null;
  }

  function rangeFor(song, range) {
    if (!range || range.section == null) return null;
    const oi = song.order.indexOf(range.section);
    if (oi < 0) return null;
    const len = song.sections[range.section].len;
    const from = Math.max(0, Math.min(len - 1, range.from | 0));
    const to = Math.max(from + 1, Math.min(len, range.to == null ? len : range.to | 0));
    return { oi, from, to };
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'play': {
        const song = prepare(m.song);
        if (seq) stopSong(m.fade ?? 0.5);
        const fade = Math.max(0, m.fade ?? 0);
        const group = { g: fade > 0 ? 0 : 1, target: 1, rate: fade > 0 ? 1 / (fade * sr) : 1, g0: 0, gs: 0, bus: 'music' };
        groups.add(group);
        const range = rangeFor(song, m.range);
        let oi = m.at && Number.isInteger(m.at.order) ? Math.max(0, Math.min(song.order.length - 1, m.at.order)) : range ? range.oi : 0;
        let step = m.at && Number.isInteger(m.at.step) ? Math.max(0, m.at.step) : range ? range.from : 0;
        seq = { song, group, oi, step, nextAt: now + Math.round((m.delay || 0) * sr), range, rangeSpec: m.range || null, stopped: !song.order.length };
        break;
      }
      case 'update': {
        if (!seq) break;
        const song = prepare(m.song);
        seq.song = song;
        if (seq.oi >= song.order.length) seq.oi = 0;
        const sec = song.sections[song.order[seq.oi]];
        if (!sec || seq.step >= sec.len) seq.step = 0;
        if (m.range !== undefined) seq.rangeSpec = m.range;
        seq.range = rangeFor(song, seq.rangeSpec);
        break;
      }
      case 'range': if (seq) { seq.rangeSpec = m.range || null; seq.range = rangeFor(seq.song, seq.rangeSpec); } break;
      case 'stop': stopSong(m.fade ?? 0.6); break;
      case 'mute': muted.clear(); for (const k of m.keys || []) muted.add(k); break;
      case 'solo': solo.clear(); for (const k of m.keys || []) solo.add(k); break;
      case 'volume':
        for (const k of ['music', 'sfx', 'master']) if (Number.isFinite(+m[k])) vol[k] = Math.max(0, Math.min(2, +m[k]));
        break;
      case 'sfx': {
        const fx = m.sfx;
        if (!fx || !Array.isArray(fx.layers)) break;
        const at = now + Math.round((m.delay || 0) * sr);
        const v0 = (fx.vol ?? 1) * (m.vol ?? 1);
        for (const l of fx.layers) {
          const t = at + Math.round(l.at * sr);
          if (l.kind === 'hit') spawnHit(l.layer, t, v0, 0, 0.1, sfxGroup);
          else if (l.kind === 'drum') for (const x of l.layers) spawnHit(x, t, v0 * l.vel * l.p.level, l.pan ?? l.p.pan, l.echo ?? l.p.echo, sfxGroup);
          else for (const md of l.midi) spawnNote(l.type, l.p, md, l.len, v0 * l.vel, l.pan ?? l.p.pan, l.echo ?? l.p.echo, t, sfxGroup);
        }
        break;
      }
      case 'note': { // a single note or drum hit (the studio's preview of a cell)
        const at = now;
        const amp = (m.vol ?? 0.6) * (m.vel ?? 1);
        if (m.type === 'drums') for (const h of m.hits || []) { const piece = m.kit && m.kit[h]; if (piece) for (const l of piece) spawnHit(l, at, amp * m.p.level, m.pan ?? m.p.pan, m.echo ?? m.p.echo, sfxGroup); }
        else for (const md of m.midi || []) spawnNote(m.type, m.p, md, Math.max(0.05, m.len || 0.25), amp, m.pan ?? m.p.pan, m.echo ?? m.p.echo, at, sfxGroup);
        break;
      }
      case 'silence': voices.length = 0; stopSong(0); break;
      default: break;
    }
  }

  function process(outL, outR, n) {
    if (mixL.length < n) { mixL = new Float32Array(n); mixR = new Float32Array(n); send = new Float32Array(n); }
    mixL.fill(0, 0, n); mixR.fill(0, 0, n); send.fill(0, 0, n);
    if (seq && !seq.stopped) {
      const end = now + n;
      while (seq && !seq.stopped && seq.nextAt < end) stepAt(Math.max(now, Math.round(seq.nextAt)));
      if (seq && seq.stopped && seq.ended) { const s = seq; seq = null; fadeGroup(s.group, 3); }
    }
    // group gains for this block (song fades, bus volumes)
    for (const gr of groups) {
      const bus = gr.bus === 'sfx' ? vol.sfx : vol.music;
      const a = gr.g;
      if (gr.g < gr.target) gr.g = Math.min(gr.target, gr.g + gr.rate * n);
      else if (gr.g > gr.target) gr.g = Math.max(gr.target, gr.g - gr.rate * n);
      gr.g0 = a * bus;
      gr.gs = ((gr.g - a) * bus) / n;
    }
    for (let v = voices.length - 1; v >= 0; v--) {
      const vo = voices[v];
      const i0 = vo.at - now;
      if (i0 >= n) continue;
      vo.render(mixL, mixR, send, Math.max(0, i0), n, vo.group);
      if (vo.done || (vo.group.g <= 0 && vo.group.target <= 0)) { voices[v] = voices[voices.length - 1]; voices.pop(); }
    }
    for (const gr of groups) if (gr !== sfxGroup && gr.g <= 0 && gr.target <= 0) groups.delete(gr);
    const m = vol.master * comp.makeup;
    for (let i = 0; i < n; i++) {
      reverb.tick(send[i]);
      let l = (mixL[i] + reverb.out.l) * m, r = (mixR[i] + reverb.out.r) * m;
      // compressor (peak detector) then a soft limiter that never reaches ±1
      const pk = Math.max(Math.abs(l), Math.abs(r));
      comp.env = pk > comp.env ? comp.atk * comp.env + (1 - comp.atk) * pk : comp.rel * comp.env + (1 - comp.rel) * pk;
      if (comp.env > comp.thr) { const gg = (comp.thr + (comp.env - comp.thr) / comp.ratio) / comp.env; l *= gg; r *= gg; }
      outL[i] = soft(l); outR[i] = soft(r);
    }
    now += n;
  }

  return {
    sampleRate: sr,
    handle,
    process,
    onPosition(cb) { posCb = cb; },
    position: () => lastPos,
    playing: () => !!(seq && !seq.stopped),
    voices: () => voices.length,
    frame: () => now,
  };
}

function soft(x) {
  const a = Math.abs(x);
  if (a <= 0.8) return x;
  const y = 0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19);
  return x < 0 ? -y : y;
}
