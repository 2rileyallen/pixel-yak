// design/instruments.js — {{NAME}}'s instruments: parameter sets the sound engine plays
// (engine/sound/song.js lists every knob). Songs and sound effects only name these ids, so
// changing an instrument here changes it in every song. This is the template's neutral set; a
// sound design from the library (designs/sound/) replaces this file with its own look, and the
// user's knob changes in Pixel Yak's Sound view sit on top (game/sound/edits/instruments.json).
//
// The roles every set has (so any song works with any design): lead, keys, bass, pad, bell and
// drums (kit letters K kick · S snare · h closed hat · o open hat · C crash). Add more freely.

export const INSTRUMENTS = {
  lead: { type: 'synth', wave: 'square', wave2: 'square', detune2: 7, level2: 0.6, cutoff: 3200, q: 1, attack: 0.005, decay: 0.15, sustain: 0.7, release: 0.08, vibrato: 10, vdelay: 0.25, level: 0.42, echo: 0.18 },
  keys: { type: 'synth', wave: 'pulse', cutoff: 2600, attack: 0.002, decay: 0.14, sustain: 0.25, release: 0.1, level: 0.36, echo: 0.22 },
  bass: { type: 'synth', wave: 'triangle', sub: 0.35, cutoff: 900, fenv: 2.5, ftime: 0.12, attack: 0.003, decay: 0.15, sustain: 0.7, release: 0.06, level: 0.85, echo: 0.03 },
  pad: { type: 'synth', wave: 'saw', wave2: 'saw', detune2: 9, cutoff: 1400, attack: 0.4, decay: 0.3, sustain: 0.8, release: 0.8, level: 0.2, echo: 0.45 },
  bell: { type: 'fm', ratio: 3.5, index: 2.4, decay: 0.6, level: 0.4, echo: 0.3 },
  drums: {
    type: 'drums', echo: 0.12,
    kit: {
      K: [{ tone: 'triangle', from: 140, to: 40, sweep: 0.09, len: 0.16, vol: 1 }],
      S: [{ noise: 'bandpass', from: 1900, q: 1.2, len: 0.12, vol: 0.6 }, { tone: 'triangle', from: 240, to: 160, sweep: 0.04, len: 0.06, vol: 0.3 }],
      h: [{ noise: 'highpass', from: 6500, len: 0.03, vol: 0.28 }],
      o: [{ noise: 'highpass', from: 5500, len: 0.16, vol: 0.26 }],
      C: [{ noise: 'highpass', from: 4800, q: 0.6, len: 0.8, vol: 0.3 }],
    },
  },
};
