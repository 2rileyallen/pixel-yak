// game/sound.js — Yak Trail's music and sound effects (docs/contracts/SOUND.md). It's all data the
// engine plays: songs in tracker notation, sound effects as recipes, instruments from
// design/instruments.js. Pixel Yak's Sound view shows every song here as a grid the user can
// edit; their changes live in sound/edits/ and are laid on top at load — never hand-edit those
// files, and never rewrite a song to undo them (skill sound). How it should sound: design/sound.md.
import { defineSound } from '../../../engine/sound/index.js';
import { INSTRUMENTS } from '../design/instruments.js';
import { SOUND_EDITS } from './sound/edits/index.js';

// One step = a sixteenth note (spb: 4), so a bar is 16 steps. '.' rest, '-' hold, '|' bar line,
// '_' a soft hit. D major; the tune keeps to the pentatonic (D E F# A B) and lets the chords
// carry the rest.
export const SONGS = {
  // The climb: a gentle, hopeful walking tune. A states it over D G D A, B lifts to B minor, A
  // again, C comes home to D with a little drum fill into the loop. 16 bars, about 37 s.
  trail: {
    name: 'Trail', bpm: 104, loop: true, order: ['A', 'B', 'A', 'C'],
    sections: {
      A: { tracks: [
        { inst: 'lead', vol: 0.55, notes: 'D5 - - - A4 - F#4 - A4 - - - B4 - A4 - | G4 - - - B4 - D5 - E5 - - - D5 - B4 - | A4 - - - F#4 - E4 - D4 - - - E4 - F#4 - | E4 - - - - - - - . . A4 - B4 - C#5 -' },
        { inst: 'keys', vol: 0.42, notes: 'D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 . | G3 . B3 . D4 . G4 . B4 . G4 . D4 . B3 . | D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 . | A3 . C#4 . E4 . A4 . E4 . C#4 . A3 . E3 .' },
        { inst: 'bass', vol: 0.55, notes: 'D2 - - - . . . . A2 - - - . . . . | G2 - - - . . . . D2 - - - . . . . | D2 - - - . . . . A2 - - - . . . . | A2 - - - . . . . E2 - - - . . . .' },
        { inst: 'drums', vol: 0.5, notes: 'K+B . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . o .' },
      ] },
      B: { tracks: [
        { inst: 'lead', vol: 0.55, notes: 'D5 - - - - - B4 - F#5 - - - E5 - D5 - | B4 - - - - - D5 - E5 - D5 - B4 - A4 - | A4 - - - F#4 - A4 - D5 - - - E5 - F#5 - | E5 - - - - - - - - - - - . . . .' },
        { inst: 'keys', vol: 0.42, notes: 'B3 . D4 . F#4 . B4 . D5 . B4 . F#4 . D4 . | G3 . B3 . D4 . G4 . B4 . G4 . D4 . B3 . | D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 . | A3 . C#4 . E4 . A4 . E4 . C#4 . A3 . E3 .' },
        { inst: 'bass', vol: 0.55, notes: 'B2 - - - . . . . F#2 - - - . . . . | G2 - - - . . . . D2 - - - . . . . | D2 - - - . . . . A2 - - - . . . . | A2 - - - . . . . E2 - - - . . . .' },
        { inst: 'pad', vol: 0.32, notes: 'B3+D4+F#4 - - - - - - - - - - - - - - - | G3+B3+D4 - - - - - - - - - - - - - - - | F#3+A3+D4 - - - - - - - - - - - - - - - | E3+A3+C#4 - - - - - - - - - - - - - - -' },
        { inst: 'drums', vol: 0.45, notes: 'K . . . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . o .' },
      ] },
      C: { tracks: [
        { inst: 'lead', vol: 0.55, notes: 'B4 - - - D5 - - - E5 - D5 - B4 - G4 - | A4 - - - - - F#4 - A4 - B4 - A4 - F#4 - | E4 - - - F#4 - A4 - B4 - - - C#5 - - - | D5 - - - - - - - - - - - . . . .' },
        { inst: 'keys', vol: 0.42, notes: 'G3 . B3 . D4 . G4 . B4 . G4 . D4 . B3 . | D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 . | A3 . C#4 . E4 . A4 . E4 . C#4 . A3 . E3 . | D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 .' },
        { inst: 'bass', vol: 0.55, notes: 'G2 - - - . . . . D2 - - - . . . . | D2 - - - . . . . A2 - - - . . . . | A2 - - - . . . . E2 - - - . . . . | D2 - - - . . . . A2 - - - D2 - . .' },
        { inst: 'pad', vol: 0.32, notes: 'G3+B3+D4 - - - - - - - - - - - - - - - | F#3+A3+D4 - - - - - - - - - - - - - - - | E3+A3+C#4 - - - - - - - - - - - - - - - | F#3+A3+D4 - - - - - - - - - - - - - - -' },
        { inst: 'drums', vol: 0.45, notes: 'K . . . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . h h S_ . h . | K . h . S_ . h . K . S_ S_ S_ . S S' },
      ] },
    },
  },

  // The flags at the top: a short bright fanfare, once. Up the D chord, through G and A, and a
  // long D with the yak bell and a cymbal ringing out.
  summit: {
    name: 'Summit', bpm: 120, loop: false, order: ['A'],
    sections: {
      A: { tracks: [
        { inst: 'lead', vol: 0.48, notes: 'A4 . D5 . F#5 . A5 - - - F#5 - A5 - - - | G5 - - - B5 - - - A5 - - - C#6 - - - | D6 - - - - - - - - - - - - - - -' },
        { inst: 'keys', vol: 0.3, notes: 'D4+F#4+A4 . . . D4+F#4+A4 . . . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . . . | G3+B3+D4 . . . G3+B3+D4 . . . A3+C#4+E4 . . . A3+C#4+E4 . . . | D4+F#4+A4+D5 - - - - - - - - - - - - - - -' },
        { inst: 'bass', vol: 0.5, notes: 'D2 - - - . . . . D2 - - - A2 - - - | G2 - - - - - - - A2 - - - - - - - | D2 - - - - - - - - - - - - - - -' },
        { inst: 'bell', vol: 0.32, notes: '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | D6 - - - A6 - - - D7 - - - - - - -' },
        { inst: 'drums', vol: 0.45, notes: 'K . . . S . . . K . K . S . S S | K . . . S . . . K . . . S S S! S! | K+C+B . . . . . . . . . . . . . . .' },
      ] },
    },
  },
};

// The quiet arrangement of the trail tune (the F8 variant "Trail music", B): the bell takes the
// tune, no drums, a little slower. Built from the trail's own notes, so it follows them.
SONGS['trail-quiet'] = {
  ...SONGS.trail,
  name: 'Trail (quiet bells)', bpm: 92,
  sections: Object.fromEntries(Object.entries(SONGS.trail.sections).map(([id, s]) => [id, {
    tracks: s.tracks.filter((t) => t.inst !== 'drums').map((t) => (t.inst === 'lead' ? { ...t, inst: 'bell', vol: 0.5 } : t)),
  }])),
};

// One effect per thing the sim reports (sim.js run.events): the scenes play the event's name.
export const SFX = {
  // a light spring up off the hooves
  hop: { vol: 1, layers: [{ tone: 'triangle', from: 260, to: 540, sweep: 0.08, len: 0.1, vol: 0.5 }, { noise: 'lowpass', from: 1800, to: 500, len: 0.05, vol: 0.2 }] },
  // a soft hoof thud and a puff of dust
  land: { vol: 1, layers: [{ tone: 'sine', from: 150, to: 60, sweep: 0.08, len: 0.1, vol: 0.6 }, { noise: 'lowpass', from: 1300, to: 300, len: 0.08, vol: 0.3 }] },
  // three crunchy chews (a munch takes 0.4 s)
  munch: { vol: 1, layers: [
    { noise: 'bandpass', from: 2800, to: 1300, q: 1.6, len: 0.06, vol: 0.8 },
    { noise: 'bandpass', from: 2500, to: 1200, q: 1.6, len: 0.06, vol: 0.72, at: 0.13 },
    { noise: 'bandpass', from: 2700, to: 1250, q: 1.6, len: 0.06, vol: 0.64, at: 0.26 },
  ] },
  // a cairn passed: the yak bell and two bright bells going up
  checkpoint: { vol: 1, layers: [{ drum: 'B', inst: 'drums', vel: 0.9 }, { note: ['A5', 'D6'], every: 0.09, inst: 'bell', len: 0.22, vel: 0.5 }] },
  // a fall, back at the cairn: a kind little "whoops" falling away, and a soft puff
  fall: { vol: 1, layers: [{ tone: 'triangle', from: 620, to: 220, sweep: 0.3, len: 0.32, vol: 0.42 }, { noise: 'lowpass', from: 1400, to: 300, len: 0.18, vol: 0.26, at: 0.05 }] },
  // the flags: a quick run of bells up the scale (the summit song follows)
  summit: { vol: 1, layers: [{ note: ['D6', 'E6', 'F#6', 'A6', 'B6', 'D7'], every: 0.05, inst: 'bell', len: 0.3, vel: 0.4 }] },
};

export const SOUND = defineSound({
  game: 'yak-trail',
  instruments: INSTRUMENTS,
  songs: SONGS,
  sfx: SFX,
  edits: SOUND_EDITS,
  editsModule: new URL('./sound/edits/index.js', import.meta.url).href,
});
