// art/critters.js — a mountain bird (black, red beak and legs) that pecks on the trail and flaps off
// when the yak trots near, and the little effects: grass bits, dust puffs, snow puffs, a sparkle.
import { Pix } from '../../../../engine/art/pix.js';
import { M, FIN, FIN_FX } from '../../design/palette.js';

// Bird, facing right. Perched: body + tail + legs; flying: wings up / level / down.
function drawBird(pose) {
  const p = new Pix(14, 12);
  const fly = pose.startsWith('fly'), peck = pose === 'perch_1';
  const by = fly ? 5 : 6;
  if (!fly) { p.set(6, 10, M.TUNIC, 3); p.set(8, 10, M.TUNIC, 3); p.set(6, 9, M.TUNIC, 2); p.set(8, 9, M.TUNIC, 2); }
  p.layer();
  p.ball(7, by + 1, 3.5, 2.5, M.FUR, { bias: -0.1 });
  p.line(3, by + 1, 1, by + (fly ? 1 : 3), M.FUR, 1); // tail
  p.layer();
  const hx = peck ? 10 : 10, hy = peck ? by + 2 : by - 1;
  p.ball(hx, hy, 2, 2, M.FUR, { bias: -0.05 });
  p.set(hx + 2, hy, M.TUNIC, 4); p.set(hx + 3, hy + (peck ? 1 : 0), M.TUNIC, 3); // beak
  p.set(hx, hy - 1, M.WHITE, 4); // eye glint
  if (fly) {
    p.layer();
    const wing = { fly_0: [[5, by - 1], [6, by - 2], [7, by - 3], [8, by - 4]], fly_1: [[4, by], [5, by], [6, by - 1], [8, by - 1], [9, by]], fly_2: [[5, by + 2], [6, by + 3], [7, by + 4], [8, by + 4]] }[pose];
    for (const [x, y] of wing) { p.set(x, y, M.FUR, 2); p.set(x + 1, y, M.FUR, 3); }
  }
  return p.finish(FIN);
}

// Effects, 8×8, centred.
function drawFx(pose) {
  const p = new Pix(8, 8);
  const [kind, f] = pose.split('_');
  const k = Number(f);
  if (kind === 'leaf') {
    const pts = k ? [[2, 2], [5, 1], [4, 5], [6, 4]] : [[3, 3], [4, 2], [2, 5], [5, 5]];
    for (const [x, y] of pts) p.set(x, y, M.GRASS, 3 + ((x + y) % 2));
  } else if (kind === 'dust') {
    const r = 1.5 + k * 1.2;
    p.oval(4, 5, r + 0.5, r * 0.6 + 0.5, M.PAPER, 4 - k);
    if (k === 2) p.oval(4, 5, r - 1, r * 0.6 - 0.3, 0);
  } else if (kind === 'snow') {
    const pts = k ? [[1, 2], [4, 1], [6, 3], [3, 4], [5, 6]] : [[3, 3], [4, 4], [2, 5], [5, 2]];
    for (const [x, y] of pts) p.set(x, y, M.WHITE, 4);
  } else { // sparkle
    const r = k ? 3 : 2;
    for (let i = -r; i <= r; i++) { p.set(4 + i, 4, M.GOLD, Math.abs(i) < 2 ? 4 : 3); p.set(4, 4 + i, M.GOLD, Math.abs(i) < 2 ? 4 : 3); }
  }
  return p.finish(kind === 'dust' ? { ...FIN_FX, outline: null } : FIN_FX);
}

const gen = { style: 'yak-trail', v: 1, by: 'claude-opus-5.5', date: '2026-11-02' };

export const CRITTER_ART = {
  bird: {
    name: 'Mountain bird', category: 'character', tags: ['ambient'],
    fw: 14, fh: 12, ax: 7, ay: 11, poses: ['perch_0', 'perch_1', 'fly_0', 'fly_1', 'fly_2'],
    anims: { perch: ['perch_0', 'perch_0', 'perch_1', 'perch_0'], fly: ['fly_0', 'fly_1', 'fly_2', 'fly_1'] }, defaultAnim: 'fly',
    description: 'Pecks on the trail; flaps off (12 fps) when the yak trots close.',
    gen, draw: drawBird,
  },
  fx: {
    name: 'Effects', category: 'vfx', tags: ['particles'],
    fw: 8, fh: 8, ax: 4, ay: 4, poses: ['leaf_0', 'leaf_1', 'dust_0', 'dust_1', 'dust_2', 'snow_0', 'snow_1', 'sparkle_0', 'sparkle_1'],
    anims: { leaf: ['leaf_0', 'leaf_1'], dust: ['dust_0', 'dust_1', 'dust_2'], snow: ['snow_0', 'snow_1'], sparkle: ['sparkle_0', 'sparkle_1'] },
    defaultAnim: 'dust',
    description: 'Bits of grass from a munch, a dust puff on landing, snow puffs, a sparkle at a cairn.',
    gen, draw: drawFx,
  },
};
