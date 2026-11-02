// designs/art/gba-bright/sample.js — two small assets that show this look (the Designs view draws
// them; a game may add SAMPLE_ART to its sprites.js entries to see them in place). They are also a
// worked example of a generator in this style: separate layers so creases land where parts overlap,
// volumes as lit balls, clusters for hair, the navy outline and top rim from FIN.
import { Pix } from '../../../engine/art/pix.js';
import { M, FIN } from './palette.js';

// A 16×24 chibi hero facing right: two idle frames (the body breathes one pixel; the head stays).
function hero(pose) {
  const p = new Pix(16, 24);
  const b = pose === 'idle_1' ? 1 : 0;
  p.rect(5, 18, 3, 5, M.BOOT, 1); // back leg
  p.layer();
  p.rect(8, 18, 3, 5, M.BOOT, 2); // front leg
  p.rect(8, 22, 4, 1, M.BOOT, 1); // front foot
  p.layer();
  p.ball(8, 15 + b, 4.5, 4.2, M.TUNIC); // body
  p.rect(4, 17 + b, 9, 1, M.GOLD, 2); // belt
  p.set(9, 17 + b, M.GOLD, 4);
  p.layer();
  p.ball(8.5, 8, 4.8, 4.6, M.SKIN, { bias: 0.08 }); // head
  p.layer();
  // hair: a cap over the head (drawn on a scratch Pix and cut flat above the eyes, so erasing it
  // never leaves holes in the face) plus locks falling at the back (clusters, not noise)
  const cap = new Pix(16, 24);
  cap.ball(8, 6, 5.2, 3.6, M.HAIR, { bias: 0.05 });
  for (let y = 7; y < 24; y++) for (let x = 0; x < 16; x++) cap.set(x, y, 0);
  p.paste(cap);
  p.rect(3, 7, 3, 4, M.HAIR, 2);
  p.rect(4, 11, 2, 1, M.HAIR, 1);
  p.rect(11, 6, 3, 1, M.HAIR, 3); // fringe
  p.layer({ cast: false });
  p.rect(11, 8, 1, 2, M.INK, 1); // eye
  p.set(11, 8, M.WHITE, 4); // catchlight
  p.set(13, 11, M.SKIN, 1); // mouth corner
  return p.finish(FIN);
}

// A 12×12 gem on a gold setting; the second frame adds a glint (a whole shape, never a stray pixel).
function gem(pose) {
  const p = new Pix(12, 12);
  p.ball(6, 8, 5, 3, M.GOLD, { bias: 0.05 });
  p.layer();
  p.poly([[6, 1], [10, 5], [6, 9], [2, 5]], M.ICE, 2);
  p.poly([[6, 1], [10, 5], [6, 5]], M.ICE, 3);
  p.set(5, 3, M.ICE, 4);
  if (pose === 'glint') { p.set(4, 2, M.WHITE, 4); p.set(4, 4, M.WHITE, 4); p.set(3, 3, M.WHITE, 4); p.set(5, 3, M.WHITE, 4); }
  return p.finish(FIN);
}

const GEN = { style: 'gba-bright', v: 1, by: 'library', date: '2026-11-02' };

export const SAMPLE_ART = {
  sample_hero: {
    name: 'Sample hero (GBA Bright)', category: 'character', tags: ['sample'],
    fw: 16, fh: 24, ax: 8, ay: 23, poses: ['idle_0', 'idle_1'], anims: { idle: ['idle_0', 'idle_1'] }, defaultAnim: 'idle',
    description: 'A chibi hero: lit balls for volumes, hair clusters, a catchlight, navy outline and top rim.',
    gen: GEN, draw: hero,
  },
  sample_gem: {
    name: 'Sample gem (GBA Bright)', category: 'prop', tags: ['sample'],
    fw: 12, fh: 12, ax: 6, ay: 11, poses: ['still', 'glint'], anims: { shine: ['still', 'still', 'glint'] }, defaultAnim: 'shine',
    description: 'A gem on a gold setting with a whole-shape glint.',
    gen: GEN, draw: gem,
  },
};
