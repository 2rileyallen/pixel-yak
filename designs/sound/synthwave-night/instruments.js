// designs/sound/synthwave-night/instruments.js — the synthwave-night sound as parameter sets
// (engine/sound/song.js lists every knob). A rainy city after dark: pumping saw bass with a
// filter pluck, a square arpeggio, wide detuned-saw pads, a soft electric-piano, a gated snare in
// a big room — and a "city" kit of long ambience pieces (rain, the hum of neon) for its own track.
// The six roles (lead, keys, bass, pad, bell, drums with K S h o C) are what every song may name.

export const INSTRUMENTS = {
  // roles
  lead: { type: 'synth', wave: 'saw', wave2: 'saw', detune2: 12, level2: 0.8, cutoff: 2600, q: 1.5, attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.35, vibrato: 14, vrate: 5, vdelay: 0.35, scoop: 40, stime: 0.08, level: 0.34, echo: 0.42 },
  keys: { type: 'fm', ratio: 1, index: 1.4, indexEnd: 0.3, itime: 0.4, attack: 0.004, decay: 0.7, level: 0.36, echo: 0.35 },
  bass: { type: 'synth', wave: 'saw', sub: 0.6, cutoff: 180, fenv: 4.4, ftime: 0.18, q: 3, attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.05, level: 0.72, echo: 0.04 },
  pad: { type: 'synth', wave: 'saw', wave2: 'saw', detune2: 14, cutoff: 2400, q: 1.5, attack: 0.6, decay: 0.4, sustain: 0.85, release: 1.2, level: 0.13, echo: 0.55 },
  bell: { type: 'fm', ratio: 3.5, index: 2.2, indexEnd: 0.05, itime: 0.5, decay: 1.2, level: 0.32, echo: 0.55 },
  drums: {
    type: 'drums', echo: 0.2,
    kit: {
      K: [{ tone: 'sine', from: 120, to: 42, sweep: 0.12, len: 0.32, vol: 1 }, { noise: 'lowpass', from: 1200, len: 0.02, vol: 0.3 }],
      S: [{ noise: 'bandpass', from: 1500, q: 0.8, len: 0.22, vol: 0.6, echo: 0.6 }, { tone: 'triangle', from: 220, to: 160, sweep: 0.05, len: 0.08, vol: 0.3 }], // snare in a big room
      h: [{ noise: 'highpass', from: 8000, len: 0.03, vol: 0.2, pan: 0.25 }],
      o: [{ noise: 'highpass', from: 7000, len: 0.2, vol: 0.2, pan: 0.25 }],
      C: [{ noise: 'highpass', from: 4200, q: 0.5, len: 1.4, vol: 0.28, echo: 0.5 }],
      P: [{ noise: 'bandpass', from: 1100, q: 1.5, len: 0.09, vol: 0.4, echo: 0.4 }], // hand clap
    },
  },
  // this sound's own voices
  arp: { type: 'synth', wave: 'square', cutoff: 3000, q: 2, attack: 0.002, decay: 0.14, sustain: 0, release: 0.05, level: 0.32, echo: 0.35, pan: 0.2 },
  // the city: long noise beds for an ambience track (R rain, N neon hum, W wind)
  city: {
    type: 'drums', echo: 0.1,
    kit: {
      R: [{ noise: 'lowpass', from: 1400, q: 0.5, attack: 0.6, len: 4.5, vol: 0.32 }],
      N: [{ tone: 'saw', from: 60, attack: 0.3, len: 4.5, vol: 0.1, lp: 180 }],
      W: [{ noise: 'bandpass', from: 500, to: 900, q: 0.7, attack: 1.2, len: 4, vol: 0.25 }],
    },
  },
};
