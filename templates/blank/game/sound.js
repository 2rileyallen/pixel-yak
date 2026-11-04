// game/sound.js — {{NAME}}'s music and sound effects (docs/contracts/SOUND.md). It's all data the
// engine plays: songs in tracker notation, sound effects as recipes, instruments from
// design/instruments.js. Pixel Yak's Sound view shows every song here as a grid the user can
// edit; their changes live in sound/edits/ and are laid on top at load — never hand-edit those
// files, and never rewrite a song to undo them (skill sound).
import { defineSound } from '../engine/sound/index.js';
import { INSTRUMENTS } from '../design/instruments.js';
import { SOUND_EDITS } from './sound/edits/index.js';

// One step = a sixteenth note (spb: 4), so a bar is 16 steps. '.' rest, '-' hold, '|' bar line.
export const SONGS = {
  theme: {
    name: 'Theme (placeholder)', bpm: 112, loop: true, order: ['A'],
    sections: {
      A: { tracks: [
        { inst: 'lead', vol: 0.5, notes: 'E5 - - - D5 - C5 - D5 - E5 - - - . . | C5 - - - A4 - - - C5 - F5 - E5 - - - | G5 - - - E5 - D5 - C5 - - - D5 - E5 - | D5 - - - - - - - B4 - - - . . . .' },
        { inst: 'keys', vol: 0.35, notes: 'A3 . C4 . E4 . C4 . A3 . C4 . E4 . A4 . | F3 . A3 . C4 . A3 . F3 . A3 . C4 . F4 . | C4 . E4 . G4 . E4 . C4 . E4 . G4 . C5 . | G3 . B3 . D4 . B3 . G3 . B3 . D4 . G4 .' },
        { inst: 'bass', vol: 0.6, notes: 'A2 . . . A2 . E2 . A2 . . . A2 . G2 . | F2 . . . F2 . C3 . F2 . . . F2 . E2 . | C3 . . . C3 . G2 . C3 . . . C3 . B2 . | G2 . . . G2 . D3 . G2 . . . B2 . G2 .' },
        { inst: 'drums', vol: 0.55, notes: 'K . h . S . h . K . K . S . h h | K . h . S . h . K . K . S . h h | K . h . S . h . K . K . S . h h | K . h . S . h . K . S . S S S! S!' },
      ] },
    },
  },
};

export const SFX = {
  select: { vol: 1, layers: [{ note: ['E6', 'B6'], every: 0.06, inst: 'bell', len: 0.08, vel: 0.35 }] },
  hit: { vol: 1, layers: [{ noise: 'lowpass', from: 2400, to: 400, len: 0.1, vol: 0.5 }, { tone: 'sine', from: 160, to: 70, len: 0.1, vol: 0.45 }] },
};

export const SOUND = defineSound({
  game: '{{ID}}',
  instruments: INSTRUMENTS,
  songs: SONGS,
  sfx: SFX,
  edits: SOUND_EDITS,
  editsModule: new URL('./sound/edits/index.js', import.meta.url).href,
});
