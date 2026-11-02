// designs/sound/tactical-chiptune/instruments.js — the tactical-chiptune sound as parameter sets
// (engine/sound/song.js lists every knob). Handheld-console battle music: a wide detuned square
// lead, a slapping filtered bass, crisp 8-bit drums. The *_hot voices are the low-health mode
// (brighter, an octave on top); the H/J kit pieces are its heartbeat.
// The six roles (lead, keys, bass, pad, bell, drums with K S h o C) are what every song may name.

const lead = {
  type: 'synth', wave: 'square', wave2: 'square', detune2: 7, level2: 1, cutoff: 2500, q: 1.4,
  attack: 0.006, decay: 0.12, sustain: 0.72, release: 0.05, level: 0.42, echo: 0.12,
};
const bass = {
  type: 'synth', wave: 'saw', wave2: 'triangle', oct2: -1, level2: 0.8, cutoff: 280, fenv: 4.6, ftime: 0.06, q: 1.2,
  attack: 0.002, decay: 0.12, sustain: 0.25, release: 0.04, level: 0.9, echo: 0.02,
};

export const INSTRUMENTS = {
  // roles
  lead,
  keys: { type: 'synth', wave: 'square', wave2: 'square', detune2: 7, level2: 1, cutoff: 2200, q: 1.2, attack: 0.004, decay: 0.08, sustain: 0.3, release: 0.04, level: 0.3, echo: 0.1 },
  bass,
  pad: { type: 'synth', wave: 'pulse', wave2: 'triangle', oct2: 1, level2: 0.4, cutoff: 1600, attack: 0.25, decay: 0.3, sustain: 0.7, release: 0.5, vibrato: 6, vdelay: 0.5, level: 0.16, echo: 0.3 },
  bell: { type: 'fm', ratio: 3, index: 1.6, indexEnd: 0.1, itime: 0.3, decay: 0.5, level: 0.38, echo: 0.2 },
  drums: {
    type: 'drums', echo: 0.06,
    kit: {
      K: [{ tone: 'triangle', from: 125, to: 32, sweep: 0.09, len: 0.12, vol: 1 }],
      B: [{ tone: 'triangle', from: 140, to: 32, sweep: 0.09, len: 0.14, vol: 1.25 }], // boss kick
      S: [{ noise: 'bandpass', from: 1900, q: 2, len: 0.12, vol: 0.85 }],
      s: { like: 'S', vol: 0.55, tune: 0.75 }, // a darker snare
      h: [{ noise: 'highpass', from: 6500, len: 0.025, vol: 0.32 }],
      o: [{ noise: 'highpass', from: 5500, len: 0.14, vol: 0.45 }],
      C: [{ noise: 'highpass', from: 4500, q: 0.6, len: 0.7, vol: 0.4 }],
      t: [{ tone: 'sine', from: 920, len: 0.05, vol: 0.35 }], // a shrine tick for calm tracks
      H: [{ tone: 'sine', from: 70, to: 26, sweep: 0.1, len: 0.1, vol: 0.8 }], // heartbeat, first thump
      J: [{ tone: 'sine', from: 85, to: 26, sweep: 0.1, len: 0.1, vol: 1.1 }], // heartbeat, second thump
    },
  },
  // the low-health mode: the same parts, more urgent
  lead_hot: { ...lead, cutoff: 3600, q: 2.2, wave3: 'triangle', oct3: 1, level3: 0.5, level: 0.44 },
  bass_hot: { ...bass, cutoff: 400, fenv: 3.25, level: 0.85 },
  // a calm-track pair
  flute: { type: 'synth', wave: 'triangle', wave2: 'sine', oct2: 1, level2: 0.5, cutoff: 1400, attack: 0.03, decay: 0.2, sustain: 0.75, release: 0.12, vibrato: 25, vrate: 4.8, vdelay: 0.3, scoop: 26, stime: 0.04, level: 0.5, echo: 0.25 },
  chime: { type: 'fm', ratio: 3, index: 0.8, indexEnd: 0.2, itime: 0.2, decay: 0.4, level: 0.35, echo: 0.25 },
};
