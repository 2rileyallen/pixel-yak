// designs/sound/synthwave-night/example-song.js — a night-drive loop and a few sound effects in
// this look, as plain data (docs/contracts/SOUND.md). D minor: Dm – Bb – F – C/Am. Section A is
// the groove; B brings in the lead. The city track lays rain and neon hum under everything.

export const SONGS = {
  drive: {
    name: 'Night drive (example)', bpm: 112, loop: true, order: ['A', 'B'],
    sections: {
      A: { tracks: [
        { inst: 'bass', vol: 0.46, notes: 'D2 . D3 . D2 . D3 . D2 . D3 . D2 . D3 . | Bb1 . Bb2 . Bb1 . Bb2 . Bb1 . Bb2 . Bb1 . Bb2 . | F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 . | C2 . C3 . C2 . C3 . A1 . A2 . A1 . A2 .' },
        { inst: 'arp', vol: 0.27, notes: 'D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 | D4 F4 Bb4 D5 Bb4 F4 D4 F4 Bb4 D5 Bb4 F4 D4 F4 Bb4 D5 | C4 F4 A4 C5 A4 F4 C4 F4 A4 C5 A4 F4 C4 F4 A4 C5 | C4 E4 G4 C5 G4 E4 C4 E4 A4 C5 A4 E4 C4 E4 A4 C5' },
        { inst: 'pad', vol: 0.34, notes: 'D3+F3+A3 - - - - - - - - - - - - - - - | Bb2+D3+F3 - - - - - - - - - - - - - - - | F3+A3+C4 - - - - - - - - - - - - - - - | C3+E3+G3 - - - - - - - A2+C3+E3 - - - - - - -' },
        { inst: 'drums', vol: 0.48, notes: 'K . h . S . h . K . h . S . h o | K . h . S . h . K . h . S . h o | K . h . S . h . K . h . S . h o | K . h . S . h . K K h . S . S! P!' },
        { inst: 'city', vol: 0.42, notes: 'R+N . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | R+N . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .' },
      ] },
      B: { tracks: [
        { inst: 'bass', vol: 0.46, notes: 'D2 . D3 . D2 . D3 . D2 . D3 . D2 . D3 . | Bb1 . Bb2 . Bb1 . Bb2 . Bb1 . Bb2 . Bb1 . Bb2 . | F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 . | C2 . C3 . C2 . C3 . A1 . A2 . A1 . A2 .' },
        { inst: 'arp', vol: 0.2, notes: 'D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 | D4 F4 Bb4 D5 Bb4 F4 D4 F4 Bb4 D5 Bb4 F4 D4 F4 Bb4 D5 | C4 F4 A4 C5 A4 F4 C4 F4 A4 C5 A4 F4 C4 F4 A4 C5 | C4 E4 G4 C5 G4 E4 C4 E4 A4 C5 A4 E4 C4 E4 A4 C5' },
        { inst: 'pad', vol: 0.3, notes: 'D3+F3+A3 - - - - - - - - - - - - - - - | Bb2+D3+F3 - - - - - - - - - - - - - - - | F3+A3+C4 - - - - - - - - - - - - - - - | C3+E3+G3 - - - - - - - A2+C3+E3 - - - - - - -' },
        { inst: 'lead', vol: 0.42, notes: 'A4 - - - - - - - G4 - F4 - E4 - D4 - | F4 - - - - - - - D4 - - - . . . . | C5 - - - A4 - - - G4 - A4 - C5 - - - | E5 - - - - - - - D5 - C5 - A4 - - -' },
        { inst: 'drums', vol: 0.48, notes: 'K . h . S . h . K . h . S . h o | K . h . S . h . K . h . S . h o | K . h . S . h . K . h . S . h o | K . h . S . h . K K h . S . S! C' },
        { inst: 'city', vol: 0.42, notes: 'R+N . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | R+N . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .' },
      ] },
    },
  },
};

export const SFX = {
  // a door chime: a soft glassy bell and a breath of street noise
  door: { vol: 1, layers: [{ note: ['F5', 'C6'], every: 0.12, inst: 'bell', len: 0.3, vel: 0.35 }, { noise: 'bandpass', from: 1800, to: 900, q: 0.9, len: 0.25, vol: 0.12 }] },
  // a menu blip through the arp voice
  blip: { vol: 1, layers: [{ note: 'A5', inst: 'arp', len: 0.06, vel: 0.6 }] },
  // a footstep on wet asphalt
  step: { vol: 1, layers: [{ tone: 'sine', from: 320, to: 80, len: 0.08, vol: 0.3 }, { noise: 'bandpass', from: 1200, q: 1.2, len: 0.06, vol: 0.25 }] },
  // a neon sign flickering on: two buzzes and a hum
  neon: { vol: 1, layers: [{ tone: 'saw', from: 120, len: 0.06, vol: 0.2, lp: 900 }, { tone: 'saw', from: 120, len: 0.06, vol: 0.2, lp: 900, at: 0.1 }, { tone: 'saw', from: 60, len: 0.7, vol: 0.18, lp: 400, at: 0.2, attack: 0.05 }] },
};
