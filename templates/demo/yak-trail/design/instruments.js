// design/instruments.js — Yak Trail's instruments: parameter sets the sound engine plays
// (engine/sound/song.js lists every knob). Songs and sound effects only name these ids, so
// changing an instrument here changes it in every song. A small mountain band: a breathy wooden
// flute, a plucked dulcimer, a soft plucked bass, a reed-organ pad, bells and light hand
// percussion with a yak bell. The user's knob changes in Pixel Yak's Sound view sit on top
// (game/sound/edits/instruments.json).
//
// The roles every set has (so any song works with any design): lead, keys, bass, pad, bell and
// drums (kit letters K kick · S snare · h closed hat · o open hat · C crash). Yak Trail adds the
// kit letter B (the yak bell).

export const INSTRUMENTS = {
  // a breathy wooden flute: soft sine body, an octave of triangle on top, air in the tone, each
  // note scooped up into pitch and a slow vibrato that fades in
  lead: {
    type: 'synth', wave: 'sine', wave2: 'triangle', oct2: 1, level2: 0.14, breath: 0.34, cutoff: 7000,
    attack: 0.04, decay: 0.14, sustain: 0.74, release: 0.16, vibrato: 11, vrate: 5.2, vdelay: 0.4,
    scoop: 22, stime: 0.05, level: 0.55, echo: 0.32,
  },
  // a plucked dulcimer: bright string, rings a little under the next note
  keys: { type: 'pluck', bright: 0.62, sustain: 0.45, ring: 0.8, tone: 1.1, level: 0.85, echo: 0.26 },
  // a soft plucked low string: round, a quick filter drop, short
  bass: { type: 'synth', wave: 'triangle', sub: 0.25, cutoff: 700, fenv: 2.2, ftime: 0.1, attack: 0.004, decay: 0.22, sustain: 0.4, release: 0.08, level: 0.8, echo: 0.05 },
  // a reed organ holding the chord, far back
  pad: { type: 'synth', wave: 'square', wave2: 'saw', detune2: 6, level2: 0.4, cutoff: 1100, q: 0.5, attack: 0.35, decay: 0.2, sustain: 0.8, release: 0.6, level: 0.16, echo: 0.42 },
  // a small bright bell (cairns, the summit, the quiet arrangement's tune)
  bell: { type: 'fm', ratio: 3.5, index: 2.2, indexEnd: 0.05, itime: 0.5, decay: 0.8, level: 0.38, echo: 0.34 },
  drums: {
    type: 'drums', echo: 0.18,
    kit: {
      K: [{ tone: 'sine', from: 120, to: 52, sweep: 0.12, len: 0.28, vol: 0.85 }, { noise: 'lowpass', from: 700, len: 0.05, vol: 0.25 }], // frame drum
      S: [{ noise: 'bandpass', from: 2300, q: 1.4, len: 0.06, vol: 0.4 }, { tone: 'triangle', from: 420, to: 300, sweep: 0.03, len: 0.04, vol: 0.2 }], // hand slap on the rim
      h: [{ noise: 'highpass', from: 7500, len: 0.035, vol: 0.16, pan: 0.25, echo: 0.04 }], // shaker
      o: [{ noise: 'highpass', from: 6000, len: 0.14, attack: 0.03, vol: 0.14, pan: 0.25 }], // long shake
      C: [{ noise: 'highpass', from: 5000, q: 0.5, len: 0.7, vol: 0.22, pan: -0.2, echo: 0.3 }], // small cymbal
      B: [ // the yak bell: two clanky square tones (a cowbell's recipe), lowpassed
        { tone: 'square', from: 587, len: 0.32, vol: 0.13, lp: 2600, pan: -0.15 },
        { tone: 'square', from: 845, len: 0.26, vol: 0.1, lp: 2600, pan: -0.15 },
      ],
    },
  },
};
