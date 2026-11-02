// designs/sound/wuxia-adventure/instruments.js — the wuxia-adventure sound as parameter sets
// (engine/sound/song.js lists every knob). Plucked zither strings, a breathy bamboo flute, a
// bowed two-string fiddle, a reed-organ pad, temple bells and big hand drums, all in a long hall.
// The six roles (lead, keys, bass, pad, bell, drums with K S h o C) are what every song may name;
// pluck, flute, erhu and the extra kit letters (k W w G) are this sound's own.

const pluck = { type: 'pluck', bright: 0.45, sustain: 0.5, ring: 1.1, tone: 1, level: 0.9, echo: 0.3 };
const flute = {
  type: 'synth', wave: 'sine', wave2: 'triangle', oct2: 1, level2: 0.12, breath: 0.3, cutoff: 8000,
  attack: 0.05, decay: 0.12, sustain: 0.76, release: 0.14, vibrato: 12, vrate: 5.3, vdelay: 0.45,
  scoop: 26, stime: 0.06, level: 0.55, echo: 0.38,
};
const erhu = {
  type: 'synth', wave: 'saw', wave2: 'saw', detune2: 7, level2: 0.5, cutoff: 2900, q: 1.2,
  attack: 0.07, decay: 0.1, sustain: 0.8, release: 0.16, vibrato: 22, vrate: 5.8, vdelay: 0.35,
  scoop: 17, stime: 0.05, level: 0.32, echo: 0.28,
};

export const INSTRUMENTS = {
  // roles
  lead: flute,
  keys: pluck,
  bass: { type: 'synth', wave: 'triangle', wave2: 'saw', level2: 0.25, cutoff: 380, fenv: 3.7, ftime: 0.18, q: 1.5, attack: 0.005, decay: 0.12, sustain: 0.6, release: 0.06, level: 0.7, echo: 0.05 },
  pad: { type: 'synth', wave: 'saw', wave2: 'saw', detune2: 10, wave3: 'triangle', oct3: 1, level3: 0.5, cutoff: 1300, q: 0.5, attack: 0.5, decay: 0.2, sustain: 0.83, release: 0.7, level: 0.18, echo: 0.45 },
  bell: { type: 'fm', ratio: 3.5, index: 2.4, indexEnd: 0.05, itime: 0.6, decay: 0.9, level: 0.4, echo: 0.4 },
  drums: {
    type: 'drums', echo: 0.25,
    kit: {
      K: [{ tone: 'sine', from: 150, to: 46, sweep: 0.2, len: 0.55, vol: 1 }, { noise: 'lowpass', from: 900, len: 0.08, vol: 0.5 }], // big hand drum
      k: { like: 'K', vol: 0.55 },
      S: [{ noise: 'bandpass', from: 1900, q: 0.9, len: 0.16, vol: 0.55 }, { tone: 'sine', from: 320, to: 190, sweep: 0.06, len: 0.08, vol: 0.35 }], // small barrel drum
      h: [{ noise: 'highpass', from: 7000, q: 0.7, len: 0.035, vol: 0.18, pan: 0.3, echo: 0.05 }], // clapper tick
      o: [{ noise: 'highpass', from: 6000, q: 0.7, len: 0.18, vol: 0.16, pan: 0.3 }],
      C: [{ noise: 'highpass', from: 5200, q: 0.5, len: 0.7, vol: 0.32, pan: -0.2, echo: 0.3 }], // cymbal
      W: [{ tone: 'triangle', from: 1050, to: 861, sweep: 0.05, len: 0.09, vol: 0.5, pan: 0.2 }], // woodblock
      w: [{ tone: 'triangle', from: 1500, to: 1230, sweep: 0.05, len: 0.09, vol: 0.3, pan: 0.2 }], // small woodblock
      G: [ // gong with the opera bend
        { tone: 'sine', from: 101, to: 98, sweep: 0.6, len: 3.2, vol: 0.5, partials: [[1, 1], [1.42, 0.6], [2.14, 0.45], [2.83, 0.3], [3.71, 0.2]], echo: 0.5 },
        { noise: 'bandpass', from: 3200, q: 1.2, len: 1.1, vol: 0.25, echo: 0.5 },
      ],
    },
  },
  // this sound's own voices
  pluck,
  // a tighter pluck for fast patterns (battles): brighter, short ring, little hall
  pipa: { ...pluck, bright: 0.75, ring: 0.25, echo: 0.12 },
  flute,
  erhu,
};
