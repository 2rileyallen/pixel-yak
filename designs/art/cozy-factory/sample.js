// designs/art/cozy-factory/sample.js — two small assets that show this look (the Designs view draws
// them; a game may add SAMPLE_ART to its sprites.js entries to see them in place): a primitive clay
// kiln on a 2×2-tile footprint (cold, and three hot frames whose flames move as whole shapes, with a
// status lantern on its front corner) and a crate that shows the goods it holds. A worked example
// of ¾ top-down boxes, chunky readable silhouettes and few colours per object.
import { Pix } from '../../../engine/art/pix.js';
import { M, FIN } from './palette.js';

// ¾ box: a lit top face (depth rows) over a front face (h rows); left column lit, right darker.
function box(p, x, y, w, depth, h, m, top = 3, front = 2) {
  p.rect(x, y, w, depth, m, top);
  p.rect(x, y + depth, w, h, m, front);
  p.rect(x, y + depth, 1, h, m, Math.min(4, front + 1));
  p.rect(x + w - 1, y + depth, 1, h, m, Math.max(0, front - 1));
  p.rect(x, y + depth, w, 1, m, Math.min(4, front + 1));
}

// Erase material m of the current layer below row y (a ball cut flat where it sits).
function cutBelow(p, y, m) {
  for (let yy = y + 1; yy < p.h; yy++) for (let x = 0; x < p.w; x++) if (p.matAt(x, yy) === m && p.prt[p.idx(x, yy)] === p.part) p.set(x, yy, 0);
}

function kiln(pose) {
  const p = new Pix(32, 32);
  const hot = pose.startsWith('hot');
  const f = hot ? Number(pose.slice(4)) || 0 : 0;
  box(p, 3, 23, 26, 3, 5, M.STONE, 3, 2); // fieldstone plinth
  p.layer();
  p.ball(16, 19, 11, 11, M.CLAY, { flat: 0.2 }); // the clay dome
  cutBelow(p, 25, M.CLAY);
  for (let y = 12; y <= 24; y += 3) for (let x = 0; x < 32; x++) if (p.matAt(x, y) === M.CLAY && p.matAt(x, y - 1) === M.CLAY) p.tint(x, y, -1, M.CLAY); // coil courses
  p.layer();
  box(p, 18, 3, 5, 2, 6, M.CLAY, 3, 2); // chimney
  p.rect(18, 3, 5, 1, M.CLAY, 1);
  p.layer({ cast: false });
  p.oval(16, 24, 4.5, 4, hot ? M.FIRE : M.INK, hot ? 1 : 0); // the fire mouth
  cutBelow(p, 25, hot ? M.FIRE : M.INK);
  if (hot) {
    const tongues = [[[13, 3], [16, 5], [19, 3]], [[14, 4], [17, 3], [19, 4]], [[13, 2], [15, 4], [18, 5]]][f % 3];
    for (const [x, hgt] of tongues) { p.rect(x, 25 - hgt, 2, hgt, M.FIRE, 3); p.set(x, 25 - hgt, M.FIRE, 4); }
  }
  p.layer();
  p.rect(28, 19, 1, 7, M.WOOD, 2); // the status lantern on its post
  p.rect(27, 17, 3, 3, M.ROPE, 2);
  p.set(28, 18, hot ? M.FIRE : M.INK, hot ? 4 : 1);
  return p.finish(FIN);
}

// A 16×16 crate whose top shows what it holds: three gold bars.
function crate() {
  const p = new Pix(16, 16);
  box(p, 1, 5, 14, 4, 6, M.WOOD, 3, 2);
  p.rect(1, 12, 14, 1, M.WOOD, 1); // a plank seam
  p.layer();
  for (const [x, y] of [[3, 5], [8, 5], [5, 3]]) { box(p, x, y, 5, 1, 2, M.GOLD, 4, 3); }
  return p.finish(FIN);
}

const GEN = { style: 'cozy-factory', v: 1, by: 'library', date: '2026-11-02' };

export const SAMPLE_ART = {
  sample_kiln: {
    name: 'Sample kiln (Cozy Factory)', category: 'prop', tags: ['sample', 'building'],
    fw: 32, fh: 32, ax: 16, ay: 31, poses: ['cold', 'hot_0', 'hot_1', 'hot_2'], anims: { work: ['hot_0', 'hot_1', 'hot_2'] }, defaultAnim: 'work',
    description: 'A primitive clay kiln on a 2×2-tile footprint: fieldstone plinth, coiled clay dome, chimney, fire mouth, status lantern.',
    gen: GEN, draw: kiln,
  },
  sample_crate: {
    name: 'Sample crate of goods (Cozy Factory)', category: 'prop', tags: ['sample'],
    fw: 16, fh: 16, ax: 8, ay: 15, poses: ['full'],
    description: 'Storage shows what it holds: gold bars on top of a plank crate.',
    gen: GEN, draw: crate,
  },
};
