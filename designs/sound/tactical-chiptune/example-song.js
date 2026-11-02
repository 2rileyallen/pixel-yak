// designs/sound/tactical-chiptune/example-song.js — a battle loop and its low-health variant, and a
// few sound effects in this look, as plain data (docs/contracts/SOUND.md). Both songs share the
// same notes; the variant swaps in the *_hot instruments, opens the hats and adds the heartbeat.
// A game switches songs at the same step to keep the groove (SOUND.music('battle_low', { at })).

const LEAD = 'E5 . E5 . G5 . A5 - - . G5 . E5 . D5 . | C5 - - . D5 . E5 - - - D5 . C5 . A4 . | F5 . F5 . E5 . D5 - - . C5 . D5 . E5 . | G5 - - - E5 - - - B4 - C5 - D5 - E5 -';
const HARMONY = 'A3 . E4 . A3 . E4 . C4 . E4 . A3 . E4 . | F3 . C4 . F3 . C4 . A3 . C4 . F3 . C4 . | D4 . A4 . D4 . A4 . F4 . A4 . D4 . A4 . | E4 . B4 . E4 . B4 . G#4 . B4 . E4 . B4 .';
const BASS = 'A2 A2 A3 A2 . A2 A3 A2 E2 E2 E3 E2 G2 G2 A2 . | F2 F2 F3 F2 . F2 F3 F2 C3 C3 C4 C3 A2 A2 F2 . | D2 D2 D3 D2 . D2 D3 D2 A2 A2 A3 A2 F2 F2 D2 . | E2 E2 E3 E2 . E2 E3 E2 B2 B2 B3 B2 G#2 G#2 E2 .';
const BEAT = 'K h h h S h h h K h K h S h h h | K h h h S h h h K h K h S h h o | K h h h S h h h K h K h S h h h | K h h h S h h h K K S K S S o o';
const BEAT_HOT = 'K h o h S h o h K h K h S h o h | K h o h S h o h K h K h S h o o | K h o h S h o h K h K h S h o h | K h o h S h o h K K S K S S! o! o!';
const HEART = 'H . J . . . . . . . . . . . . . | H . J . . . . . . . . . . . . . | H . J . . . . . . . . . . . . . | H . J . . . . . . . . . . . . .';

export const SONGS = {
  battle: {
    name: 'Battle (example)', bpm: 144, loop: true, order: ['A'],
    sections: {
      A: { tracks: [
        { inst: 'lead', vol: 0.46, notes: LEAD },
        { inst: 'keys', vol: 0.32, notes: HARMONY },
        { inst: 'bass', vol: 0.48, notes: BASS },
        { inst: 'drums', vol: 0.56, notes: BEAT },
      ] },
    },
  },
  battle_low: {
    name: 'Battle, low health (example)', bpm: 144, loop: true, order: ['A'],
    sections: {
      A: { tracks: [
        { inst: 'lead_hot', vol: 0.44, notes: LEAD },
        { inst: 'keys', vol: 0.26, notes: HARMONY },
        { inst: 'bass_hot', vol: 0.45, notes: BASS },
        { inst: 'drums', vol: 0.56, notes: BEAT_HOT },
        { inst: 'drums', id: 'heart', vol: 0.45, notes: HEART },
      ] },
    },
  },
};

export const SFX = {
  // the cursor moving: one short square blip
  cursor: { vol: 1, layers: [{ tone: 'square', from: 1760, to: 1760, len: 0.03, vol: 0.18, lp: 5000 }] },
  // a confirm: a square jumping up a fifth
  select: { vol: 1, layers: [{ tone: 'square', from: 988, len: 0.05, vol: 0.2, lp: 4000 }, { tone: 'square', from: 1480, len: 0.08, vol: 0.2, lp: 4000, at: 0.05 }] },
  // a hit: a noise crack over a falling square
  hit: { vol: 1, layers: [{ noise: 'lowpass', from: 3000, to: 500, len: 0.12, vol: 0.5 }, { tone: 'square', from: 440, to: 110, len: 0.1, vol: 0.25, lp: 2000 }] },
  // the turn starts: a quick rising bell arpeggio
  turn: { vol: 1, layers: [{ note: ['A5', 'C#6', 'E6', 'A6'], every: 0.045, inst: 'bell', len: 0.12, vel: 0.35 }] },
};
