// designs/art/16-bit-fx/sample.js — small assets that show this look (the Designs view draws them; a
// game may add SAMPLE_ART to its sprites.js entries to see them in place): a cloaked wanderer, a
// brazier whose flames move as whole shapes, and a little scene that puts both in a dark hall under
// the pixel-FX light pass (fx.js) — warm light from the fire, cool from a crystal, the floor edge
// sinking into shadow, everything on the same 16-bit pixel grid.
import { Pix, blank } from '../../../engine/art/pix.js';
import { M, FIN, FIN_FLAT, HEXRAMPS, GLOW, C } from './palette.js';
import { pixelFx, glowKeys } from './fx.js';

function wanderer() {
  const p = new Pix(16, 30);
  p.rect(5, 22, 2, 7, M.LEATHER, 1); // back leg
  p.layer();
  p.rect(8, 22, 3, 7, M.LEATHER, 2);
  p.rect(8, 28, 4, 1, M.LEATHER, 1);
  p.layer();
  p.poly([[4, 10], [12, 10], [13, 25], [3, 25]], M.CLOTH, 2); // the cloak
  p.rect(4, 11, 2, 13, M.CLOTH, 3);
  p.rect(11, 12, 2, 13, M.CLOTH, 1);
  p.layer();
  p.rect(5, 10, 7, 2, M.RED, 3); // scarf
  p.rect(4, 12, 2, 4, M.RED, 2);
  p.layer();
  p.ball(8.5, 6, 4.2, 4.6, M.DARK, { bias: 0.05 }); // the hood
  p.rect(9, 5, 3, 4, M.SKIN, 2); // face in the hood's shadow
  p.set(11, 6, M.SKIN, 3);
  p.set(10, 6, M.INK, 1);
  p.layer();
  p.line(13, 14, 13, 26, M.STEEL, 3); // a sword held low
  p.rect(12, 14, 3, 1, M.GOLD, 3);
  return p.finish(FIN);
}

function brazier(pose) {
  const p = new Pix(16, 24);
  const f = Number(pose.slice(-1)) || 0;
  p.line(5, 23, 7, 15, M.STEEL, 1); // legs
  p.line(10, 23, 8, 15, M.STEEL, 2);
  p.layer();
  p.ball(8, 14, 6, 3, M.STEEL, { bias: -0.05 }); // the bowl
  for (let x = 0; x < 16; x++) for (let y = 0; y < 12; y++) if (p.matAt(x, y) === M.STEEL) p.set(x, y, 0);
  p.layer({ cast: false });
  const tongues = [[[5, 5], [8, 8], [11, 4]], [[6, 6], [8, 6], [10, 7]], [[5, 4], [7, 7], [10, 6]]][f % 3];
  p.rect(4, 11, 9, 2, M.EMBER, 2);
  for (const [x, hgt] of tongues) { p.rect(x, 12 - hgt, 2, hgt, M.EMBER, 3); p.set(x, 12 - hgt, M.EMBER, 4); p.set(x, 11, M.EMBER, 4); }
  return p.finish(FIN);
}

function crystal() {
  const p = new Pix(8, 12);
  p.poly([[4, 0], [7, 5], [4, 11], [1, 5]], M.CRYSTAL, 2);
  p.poly([[4, 0], [7, 5], [4, 5]], M.CRYSTAL, 3);
  p.set(3, 3, M.CRYSTAL, 4);
  return p.finish(FIN);
}

const KEEP = glowKeys(HEXRAMPS, GLOW);

// A 96×56 corner of a hall: stone wall over a flagstone floor, then the light pass.
function scene(pose) {
  const t = (Number(pose.slice(-1)) || 0) * 0.9;
  const p = new Pix(96, 56);
  p.rect(0, 0, 96, 34, M.WALL, 2);
  for (let y = 0; y < 34; y += 6) { p.rect(0, y, 96, 1, M.WALL, 1); for (let x = (y / 6) % 2 ? 6 : 0; x < 96; x += 12) p.rect(x, y, 1, 6, M.WALL, 1); }
  p.rect(0, 34, 96, 22, M.FLOOR, 2);
  for (let x = 0; x < 96; x += 16) p.line(x, 34, x - 8, 56, M.FLOOR, 1);
  p.rect(0, 40, 96, 1, M.FLOOR, 1); p.rect(0, 48, 96, 1, M.FLOOR, 1);
  const [c, g] = blank(96, 56);
  g.drawImage(p.finish(FIN_FLAT), 0, 0);
  g.drawImage(brazier(`f_${Math.round(t / 0.9) % 3}`), 22, 26);
  g.drawImage(wanderer(), 48, 22);
  g.drawImage(crystal(), 80, 38);
  pixelFx(g, 96, 56, {
    t, keep: KEEP, ambient: 0.35, floor: 0.45, vignette: 0.25,
    haze: { color: C(M.FOG, 4), amount: 0.12 },
    lights: [{ x: 30, y: 36, r: 46, color: C(M.LWARM, 4), power: 1.1 }, { x: 84, y: 44, r: 30, color: C(M.LCOOL, 4), power: 0.8, phase: 1.3 }],
  });
  return c;
}

const GEN = { style: '16-bit-fx', v: 1, by: 'library', date: '2026-11-02' };

export const SAMPLE_ART = {
  sample_wanderer: {
    name: 'Sample wanderer (16-Bit FX)', category: 'character', tags: ['sample'],
    fw: 16, fh: 30, ax: 8, ay: 29, poses: ['idle'],
    description: 'A cloaked figure: selective outline, top rim, dark ramps with warm accents.',
    gen: GEN, draw: wanderer,
  },
  sample_brazier: {
    name: 'Sample brazier (16-Bit FX)', category: 'prop', tags: ['sample'],
    fw: 16, fh: 24, ax: 8, ay: 23, poses: ['f_0', 'f_1', 'f_2'], anims: { burn: ['f_0', 'f_1', 'f_2'] }, defaultAnim: 'burn',
    description: 'An iron brazier; its emissive flames move as whole shapes at ~8 fps.',
    gen: GEN, draw: brazier,
  },
  sample_scene: {
    name: 'Sample hall with pixel FX (16-Bit FX)', category: 'vfx', tags: ['sample', 'not-paintable'],
    fw: 96, fh: 56, ax: 0, ay: 0, poses: ['t_0', 't_1', 't_2'], anims: { breathe: ['t_0', 't_1', 't_2'] }, defaultAnim: 'breathe',
    description: 'The light pass at work: ambient dark, a warm pool from the fire, a cool one from the crystal, bloom, haze, a darker floor edge — all at the sprites’ pixel size. Lit colours are not palette colours, so this picture is for looking, not painting.',
    gen: GEN, draw: scene,
  },
};
