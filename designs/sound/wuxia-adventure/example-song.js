// designs/sound/wuxia-adventure/example-song.js — two songs and a few sound effects in this look,
// as plain data (docs/contracts/SOUND.md). They only name instruments from instruments.js.
// One step = a sixteenth note (spb 4): 16 steps a bar.

export const SONGS = {
  // A slow wander: E minor pentatonic over Em – Am – D – Em, then the fiddle answers.
  wander: {
    name: 'Wander (example)', bpm: 72, loop: true, order: ['A', 'B'],
    sections: {
      A: { tracks: [
        { inst: 'pluck', vol: 0.5, notes: 'E3 . B3 . E4 . G4 . B4 . G4 . E4 . B3 . | A2 . E3 . A3 . C4 . E4 . C4 . A3 . E3 . | D3 . A3 . D4 . F#4 . A4 . F#4 . D4 . A3 . | E3 . B3 . E4 . G4 . B4 - - - . . . .' },
        { inst: 'flute', vol: 0.62, notes: 'B4 - - - - - D5 - E5 - - - D5 - B4 - | A4 - - - - - G4 - E4 - - - G4 - A4 - | D5 - - - E5 - D5 - A4 - - - B4 - D5 - | E5 - - - - - - - - - - - . . . .' },
        { inst: 'pad', vol: 0.36, notes: 'E3 - - - - - - - - - - - - - - - | A2 - - - - - - - - - - - - - - - | D3 - - - - - - - - - - - - - - - | E3 - - - - - - - - - - - - - - -' },
        { inst: 'drums', vol: 0.55, notes: 'G_ . . . . . . . . . . . . . . . | . . . . . . . . w_ . . . . . . . | k_ . . . . . . . k_ . . . . . . . | . . . . . . . . w_ . . . w_ . . .' },
      ] },
      B: { tracks: [
        { inst: 'pluck', vol: 0.5, notes: 'C3 . G3 . C4 . E4 . G4 . E4 . C4 . G3 . | G2 . D3 . G3 . B3 . D4 . B3 . G3 . D3 . | A2 . E3 . A3 . C4 . E4 . C4 . A3 . E3 . | B2 . F#3 . B3 . D#4 . F#4 . D#4 . B3 . F#3 .' },
        { inst: 'erhu', vol: 0.62, notes: 'G4 - - - E4 - G4 - A4 - - - B4 - - - | D5 - - - B4 - A4 - G4 - - - - - . . | E4 - - - G4 - A4 - B4 - - - A4 - G4 - | F#4 - - - - - - - B4 - - - - - . .' },
        { inst: 'pad', vol: 0.36, notes: 'C3 - - - - - - - - - - - - - - - | G2 - - - - - - - - - - - - - - - | A2 - - - - - - - - - - - - - - - | B2 - - - - - - - - - - - - - - -' },
        { inst: 'drums', vol: 0.45, notes: 'k_ . . . . . . . W_ . . . . . . . | . . . . . . . . w_ . . . . . . . | k_ . . . . . . . W_ . . . . . . . | k_ . . . . . . . k_ . . . G_ . . .' },
      ] },
    },
  },

  // A skirmish: A minor, driving hand drums, a tight pluck pattern, the fiddle on top.
  skirmish: {
    name: 'Skirmish (example)', bpm: 144, loop: true, order: ['A'],
    sections: {
      A: { tracks: [
        { inst: 'drums', vol: 0.64, notes: 'K . . k S . k . K . k . S . k k | K . . k S . k . K . k . S . k k | K . . k S . k . K . k . S . k k | K . . k S . k . K . S . S S S! S!' },
        { inst: 'drums', vol: 0.4, notes: 'C . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | . . . . . . . . . . . . C . . .' },
        { inst: 'bass', vol: 0.55, notes: 'A2 . A3 . A2 . A3 . A2 . A3 . A2 . E2 . | C3 . C4 . C3 . C4 . C3 . C4 . C3 . G2 . | D3 . D4 . D3 . D4 . D3 . D4 . D3 . E3 . | E2 . E3 . E2 . E3 . E2 . B2 . E2 . G2 .' },
        { inst: 'pipa', vol: 0.3, notes: 'A4 . E5 . C5 . E5 . A4 . E5 . C5 . E5 . | G4 . E5 . C5 . E5 . G4 . E5 . C5 . E5 . | A4 . D5 . F5 . D5 . A4 . D5 . F5 . D5 . | G#4 . B4 . E5 . B4 . G#4 . B4 . E5 . B4 .' },
        { inst: 'erhu', vol: 0.5, notes: 'A5 - - - G5 - E5 - D5 - - - E5 - G5 - | E5 - - - D5 - C5 - D5 - - - - - . . | D5 - E5 - G5 - A5 - C6 - - - A5 - G5 - | E5 - - - - - - - B4 - - - - - . .' },
      ] },
    },
  },
};

export const SFX = {
  // a menu confirm: two bell tones a fifth apart
  confirm: { vol: 1, layers: [{ note: ['A5', 'E6'], every: 0.07, inst: 'bell', len: 0.14, vel: 0.4 }] },
  // a blade: a falling band of noise over a low thump
  slash: { vol: 1, layers: [{ noise: 'bandpass', from: 4200, to: 900, q: 1.1, len: 0.18, vol: 0.55 }, { tone: 'sine', from: 220, to: 90, len: 0.12, vol: 0.4, at: 0.02 }] },
  // a pickup: a rising pentatonic bell run
  pickup: { vol: 1, layers: [{ note: ['A5', 'C6', 'E6', 'A6'], every: 0.07, inst: 'bell', len: 0.2, vel: 0.32 }] },
  // an encounter: the gong, and a wind that swells in
  encounter: { vol: 1, layers: [{ drum: 'G', inst: 'drums', vel: 0.7 }, { noise: 'bandpass', from: 400, to: 4000, q: 0.8, len: 0.5, attack: 0.3, vol: 0.3 }] },
};
