// designs/art/8-bit-strict/sample.js — small assets that show this look (the Designs view draws them;
// a game may add SAMPLE_ART to its sprites.js entries to see them in place): a 16×16 armoured knight
// with a two-frame walk and a 16×16 brick tile. Both pass overLimit() — three colours per 8×8 tile,
// black included — which is what "strict" means here.
import { Pix } from '../../../engine/art/pix.js';
import { M, FIN, FIN_FLAT, nes } from './palette.js';

function knight(pose) {
  const p = new Pix(16, 16);
  const step = pose === 'walk_1';
  p.rect(step ? 4 : 5, 12, 2, 3, M.STEEL, 1); // back leg
  p.layer();
  p.rect(step ? 9 : 8, 12, 2, 3, M.STEEL, 2); // front leg
  p.layer();
  p.rect(4, 7, 7, 5, M.STEEL, 2); // body
  p.rect(4, 7, 2, 5, M.STEEL, 3);
  p.layer();
  p.ball(7.5, 4.5, 3.6, 3.6, M.STEEL, { bias: -0.2 }); // helmet: mostly grey, a white glint on top
  p.rect(8, 4, 3, 1, M.STEEL, 0); // the visor slit (the steel's own black: one black per tile)
  p.layer();
  p.line(12, 4, 12, 11, M.STEEL, 4); // sword, held up
  p.rect(11, 10, 3, 1, M.STEEL, 1);
  nes(p);
  return p.finish(FIN);
}

function bricks() {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, M.BRICK, 2);
  for (let y = 0; y < 16; y += 4) {
    p.rect(0, y + 3, 16, 1, M.BRICK, 0); // mortar
    for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) p.rect(x, y, 1, 3, M.BRICK, 0);
    p.rect(0, y, 16, 1, M.BRICK, 1); // each course's shadowed top
  }
  nes(p);
  return p.finish(FIN_FLAT);
}

const GEN = { style: '8-bit-strict', v: 1, by: 'library', date: '2026-11-02' };

export const SAMPLE_ART = {
  sample_knight: {
    name: 'Sample knight (8-Bit Strict)', category: 'character', tags: ['sample'],
    fw: 16, fh: 16, ax: 8, ay: 15, poses: ['walk_0', 'walk_1'], anims: { walk: ['walk_0', 'walk_1'] }, defaultAnim: 'walk',
    description: 'A full-armour knight in three colours: black outline, grey, white highlight. Two walk frames at ~8 fps.',
    gen: GEN, draw: knight,
  },
  sample_bricks: {
    name: 'Sample brick tile (8-Bit Strict)', category: 'tileset', tags: ['sample'],
    fw: 16, fh: 16, ax: 0, ay: 0, poses: ['tile'],
    description: 'A 16×16 wall tile (four 8×8 tiles): two brick tones and black mortar.',
    gen: GEN, draw: bricks,
  },
};
