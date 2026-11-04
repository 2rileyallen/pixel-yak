// engine/sound/pitch.js — listening, in plain JavaScript: pitch detection (the YIN method), a
// hummed melody turned into notation at a song's tempo, and a rough reading of a reference
// recording (length, loudness, tempo, key, its tune) so an AI can "hear" a WAV/MP3 the user
// attaches. Works on Float32Array samples in Node and browsers.
import { midiToNote } from './notation.js';

// Average down to about 22 kHz: plenty for voices and melodies, and 4× less work.
export function downsample(samples, sr, target = 22050) {
  const k = Math.max(1, Math.floor(sr / target));
  if (k === 1) return { samples, sr };
  const out = new Float32Array(Math.floor(samples.length / k));
  for (let i = 0; i < out.length; i++) { let s = 0; for (let j = 0; j < k; j++) s += samples[i * k + j]; out[i] = s / k; }
  return { samples: out, sr: sr / k };
}

// YIN pitch of one frame → { hz, clarity (0–1), rms } (hz 0 when nothing clear is heard).
export function detectPitch(frame, sr, { minHz = 70, maxHz = 1100, threshold = 0.15 } = {}) {
  const n = frame.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / n);
  const maxTau = Math.min(Math.floor(sr / minHz), Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sr / maxHz));
  if (maxTau <= minTau + 2) return { hz: 0, clarity: 0, rms };
  const W = n - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) { const x = frame[j] - frame[j + tau]; s += x * x; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float32Array(maxTau + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; c[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (c[t] < threshold) { while (t + 1 <= maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
  }
  if (tau < 0) {
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.35) return { hz: 0, clarity: Math.max(0, 1 - c[best]), rms };
    tau = best;
  }
  // parabolic interpolation for a finer period
  let t0 = tau;
  if (tau > 1 && tau < maxTau) {
    const a = c[tau - 1], b = c[tau], e = c[tau + 1];
    const den = a + e - 2 * b;
    if (den !== 0) t0 = tau + (a - e) / (2 * den);
  }
  return { hz: sr / t0, clarity: Math.max(0, Math.min(1, 1 - c[tau])), rms };
}

// Pitch every `hop` seconds → [{ t, hz, midi (fractional), clarity, rms }].
export function pitchTrack(samples, sampleRate, { hop = 0.01, frame = 0.046, minHz = 70, maxHz = 1100 } = {}) {
  const { samples: x, sr } = downsample(samples, sampleRate);
  const fl = Math.max(256, Math.round(frame * sr)), hl = Math.max(1, Math.round(hop * sr));
  const out = [];
  for (let at = 0; at + fl <= x.length; at += hl) {
    const p = detectPitch(x.subarray(at, at + fl), sr, { minHz, maxHz });
    out.push({ t: at / sr, hz: p.hz, midi: p.hz > 0 ? 69 + 12 * Math.log2(p.hz / 440) : null, clarity: p.clarity, rms: p.rms });
  }
  return out;
}

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

// Snap a midi number to the nearest note of a scale ({ root: 0–11, mode: 'major'|'minor' }).
export function snapToScale(m, scale) {
  if (!scale) return Math.round(m);
  const steps = scale.mode === 'minor' ? MINOR : MAJOR;
  let best = Math.round(m), bd = Infinity;
  for (let c = Math.floor(m) - 2; c <= Math.ceil(m) + 2; c++) {
    if (!steps.includes((((c - scale.root) % 12) + 12) % 12)) continue;
    const dd = Math.abs(c - m);
    if (dd < bd) { bd = dd; best = c; }
  }
  return best;
}

// A pitch track (a hummed or sung melody) → tracker tokens at a tempo.
// { bpm, spb, start: seconds where step 0 begins, steps: how many (default: to the end),
//   scale: { root, mode } to snap to, minClarity, octave: shift by whole octaves }
// → { tokens, voiced: share of steps with a note, notes: count }
export function melodyToTokens(track, { bpm = 120, spb = 4, start = 0, steps = null, scale = null, minClarity = 0.7, octave = 0 } = {}) {
  const stepSec = 60 / bpm / spb;
  const end = track.length ? track[track.length - 1].t : 0;
  const n = steps != null ? steps : Math.max(1, Math.ceil((end - start) / stepSec));
  const peak = Math.max(1e-6, ...track.map((f) => f.rms));
  const gate = peak * 0.12;
  const voiced = track.map((f) => (f.midi != null && f.clarity >= minClarity && f.rms >= gate ? f.midi : null));
  // smooth octave jumps: a 5-frame median over voiced neighbours
  const smooth = voiced.map((m, i) => {
    if (m == null) return null;
    const win = voiced.slice(Math.max(0, i - 2), i + 3).filter((v) => v != null);
    return median(win);
  });
  const tokens = [];
  let prev = null, prevEndVoiced = false, count = 0, sounding = 0;
  for (let s = 0; s < n; s++) {
    const t0 = start + s * stepSec, t1 = t0 + stepSec;
    const idx = [];
    for (let i = 0; i < track.length; i++) if (track[i].t >= t0 && track[i].t < t1) idx.push(i);
    const vals = idx.map((i) => smooth[i]).filter((v) => v != null);
    if (!idx.length || vals.length < idx.length * 0.4) { tokens.push('.'); prev = null; prevEndVoiced = false; continue; }
    const m = snapToScale(median(vals) + 12 * octave, scale);
    const startsVoiced = smooth[idx[0]] != null;
    const dip = idx.slice(0, Math.max(1, Math.ceil(idx.length / 3))).some((i) => track[i].rms < peak * 0.25);
    if (prev === m && prevEndVoiced && startsVoiced && !dip) tokens.push('-');
    else { tokens.push(midiToNote(m)); count++; }
    sounding++;
    prev = m;
    prevEndVoiced = smooth[idx[idx.length - 1]] != null;
  }
  return { tokens, voiced: n ? sounding / n : 0, notes: count };
}

// ---------------------------------------------------------- reference analysis ---
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

// The key of a pitch track: the major/minor key whose profile matches its pitch classes best.
export function guessKey(track) {
  const chroma = new Array(12).fill(0);
  for (const f of track) if (f.midi != null && f.clarity > 0.6) chroma[((Math.round(f.midi) % 12) + 12) % 12] += f.rms;
  if (!chroma.some((v) => v > 0)) return null;
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [mode, prof] of [['major', KS_MAJOR], ['minor', KS_MINOR]]) {
      const rot = prof.map((_, i) => prof[(i - r + 12) % 12]);
      const c = corr(chroma, rot);
      if (!best || c > best.score) best = { root: r, mode, name: `${NAMES[r]} ${mode}`, score: Math.round(c * 100) / 100 };
    }
  }
  return best;
}

// Tempo from the loudness rises (onsets): autocorrelation of an onset curve over 60–180 bpm.
export function guessTempo(samples, sampleRate) {
  const { samples: x, sr } = downsample(samples, sampleRate, 11025);
  const hop = Math.round(sr * 0.01), win = hop * 2;
  const env = [];
  for (let at = 0; at + win <= x.length; at += hop) { let e = 0; for (let i = at; i < at + win; i++) e += x[i] * x[i]; env.push(Math.log(1e-9 + e)); }
  const flux = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
  if (flux.length < 300) return null;
  const mean = flux.reduce((s, v) => s + v, 0) / flux.length;
  const f = flux.map((v) => v - mean);
  let best = null;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = 6000 / bpm; // frames of 10 ms per beat
    let s = 0;
    for (let i = 0; i + lag * 2 < f.length; i++) {
      const a = f[i], b = f[Math.round(i + lag)], c = f[Math.round(i + lag * 2)];
      s += a * b + 0.5 * a * c;
    }
    if (!best || s > best.s) best = { bpm, s };
  }
  return best ? Math.round(best.bpm) : null;
}

// A recording → what an AI needs to work from it without listening.
// → { seconds, peakDb, rmsDb, tempo, key, brightness, loudness: [dB per second…], melody: tokens, lines: [text] }
export function analyseAudio(samples, sampleRate, { melodySteps = 64 } = {}) {
  let peak = 0, sum = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; sum += samples[i] * samples[i]; }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  const db = (v) => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -120);
  const seconds = samples.length / sampleRate;
  const loudness = [];
  for (let s = 0; s < Math.min(600, Math.floor(seconds)); s++) {
    let e = 0; const a = s * sampleRate, b = Math.min(samples.length, a + sampleRate);
    for (let i = a; i < b; i++) e += samples[i] * samples[i];
    loudness.push(db(Math.sqrt(e / Math.max(1, b - a))));
  }
  let zc = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) zc++;
  const zcr = zc / Math.max(1, seconds); // crossings per second ≈ how bright it is
  const brightness = zcr > 6000 ? 'bright (lots of highs)' : zcr > 2500 ? 'balanced' : 'dark / mellow';
  const clip = samples.subarray(0, Math.min(samples.length, Math.round(sampleRate * 60)));
  const track = pitchTrack(clip, sampleRate, { hop: 0.02 });
  const key = guessKey(track);
  const tempo = guessTempo(clip, sampleRate);
  const melody = tempo ? melodyToTokens(track, { bpm: tempo, spb: 4, steps: melodySteps, scale: key, minClarity: 0.75 }).tokens : [];
  const lines = [
    `length ${seconds.toFixed(1)} s · peak ${db(peak)} dB · average loudness ${db(rms)} dB · ${brightness}`,
    `tempo (a guess from the beats): ${tempo ? `${tempo} bpm (or ${Math.round(tempo / 2)} / ${tempo * 2})` : 'unclear'}`,
    `key (a guess from the pitches): ${key ? `${key.name} (match ${key.score})` : 'unclear'}`,
    `loudness per second (dB): ${loudness.slice(0, 60).join(' ')}${loudness.length > 60 ? ' …' : ''}`,
    melody.length ? `the clearest tune, first ${melodySteps / 16} bars at that tempo (rough; the strongest pitch only): ${melody.join(' ')}` : 'no clear tune found',
  ];
  return { seconds, peakDb: db(peak), rmsDb: db(rms), tempo, key, brightness, loudness, melody, lines };
}
