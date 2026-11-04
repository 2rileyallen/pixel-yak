// art/yak.js — the yak: Yak Trail's hero and Pixel Yak's mascot. Side view, facing right, 32×24,
// feet on the bottom row (anchor 15, 23). One draw function; every pose is a row in the pose table
// (body bob, each leg's step and lift, head dip, hair sway, tail, eyes), so new poses stay on model.
// Shaggy coat that hangs low, a fringe over the eyes, cream horns, little dark hooves.
import { Pix } from '../../engine/art/pix.js';
import { M, FIN } from '../../design/palette.js';

const W = 32, H = 24;

// legs: [back far, back near, front far, front near] as [dx, lift] · bob: body up (-) / down (+)
// head: head dip · sway: hair shift · tail: 0 down, 1 flicked · eye: 'open' | 'shut'
const POSES = {
  idle_0: { bob: 0, head: 0, sway: 0, tail: 0, eye: 'open', legs: [[0, 0], [0, 0], [0, 0], [0, 0]] },
  idle_1: { bob: 0, head: 0, sway: 0, tail: 0, eye: 'open', legs: [[0, 0], [0, 0], [0, 0], [0, 0]], breathe: 1 },
  idle_2: { bob: 0, head: 0, sway: 1, tail: 1, eye: 'open', legs: [[0, 0], [0, 0], [0, 0], [0, 0]], breathe: 1 },
  idle_3: { bob: 0, head: 0, sway: 0, tail: 0, eye: 'shut', legs: [[0, 0], [0, 0], [0, 0], [0, 0]] },
  walk_0: { bob: 0, head: 0, sway: 0, tail: 0, eye: 'open', legs: [[2, 0], [-2, 0], [-2, 0], [2, 0]] },
  walk_1: { bob: -1, head: 0, sway: 1, tail: 1, eye: 'open', legs: [[1, 1], [-1, 0], [-1, 0], [1, 1]] },
  walk_2: { bob: 0, head: 1, sway: 1, tail: 1, eye: 'open', legs: [[0, 1], [0, 0], [0, 0], [0, 1]] },
  walk_3: { bob: 0, head: 0, sway: 0, tail: 0, eye: 'open', legs: [[-2, 0], [2, 0], [2, 0], [-2, 0]] },
  walk_4: { bob: -1, head: 0, sway: 1, tail: 1, eye: 'open', legs: [[-1, 0], [1, 1], [1, 1], [-1, 0]] },
  walk_5: { bob: 0, head: 1, sway: 1, tail: 0, eye: 'open', legs: [[0, 0], [0, 1], [0, 1], [0, 0]] },
  hop: { bob: -1, head: -1, sway: -1, tail: 1, eye: 'open', legs: [[2, 2], [1, 2], [1, 1], [2, 1]] },
  fall: { bob: 0, head: 0, sway: 1, tail: 1, eye: 'open', legs: [[-1, 1], [-1, 1], [1, 0], [0, 1]] },
  munch_0: { bob: 0, head: 3, sway: 0, tail: 0, eye: 'shut', legs: [[0, 0], [0, 0], [0, 0], [0, 0]] },
  munch_1: { bob: 0, head: 2, sway: 0, tail: 1, eye: 'shut', legs: [[0, 0], [0, 0], [0, 0], [0, 0]], chew: 1 },
  happy: { bob: -1, head: -1, sway: 1, tail: 1, eye: 'happy', legs: [[0, 0], [0, 0], [0, 1], [0, 1]] },
};

// Bottom edge of the coat, per column: a shaggy, uneven hem (deterministic).
const HEM = [1, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2, 1, 0, 1, 2, 1, 2, 0, 1, 2, 1];

// A leg: hidden under the coat at the top, a little dark hoof at the bottom.
function leg(p, x, [dx, lift], near) {
  const foot = 22 - lift;
  p.rect(x + dx, 16, 2, foot - 16, M.YAK, near ? 2 : 1);
  p.rect(x + dx, foot, 2, 1, M.INK, near ? 3 : 2);
}

function drawYak(pose) {
  const P = POSES[pose] || POSES.idle_0;
  const p = new Pix(W, H);
  const by = P.bob, br = P.breathe ? -1 : 0;
  const [bf, bn, ff, fn] = P.legs;

  // far legs, behind everything
  p.layer();
  leg(p, 7, bf, false);
  leg(p, 18, ff, false);

  // tail: a rope with a tuft, off the rump
  p.layer();
  const tx = 3, ty = 9 + by;
  if (P.tail) { p.line(tx, ty, tx - 2, ty + 2, M.YAK, 2); p.oval(tx - 2, ty + 4, 1.5, 2.5, M.YAK, 2); }
  else { p.line(tx, ty, tx - 1, ty + 4, M.YAK, 2); p.oval(tx - 1, ty + 6.5, 1.5, 2.5, M.YAK, 2); }

  // body: rump, barrel and the big hump over the shoulders
  p.layer();
  p.ball(8, 12 + by, 6, 5.5, M.YAK, { bias: -0.08 });
  p.ball(13, 12.5 + by, 9, 6, M.YAK, { bias: -0.06 });
  p.ball(17, 8.5 + by + br, 6, 5, M.YAK, { bias: 0 });
  // shaggy streaks down the flank
  p.map((x, y, m, sh) => (m === M.YAK && (x * 7) % 5 < 2 && y > 11 + by + (x % 3) ? [m, sh - 1] : null));

  // near legs, then the long coat hanging over the tops of all four
  p.layer();
  leg(p, 9, bn, true);
  leg(p, 20, fn, true);
  p.layer();
  for (let x = 3; x <= 24; x++) {
    const hem = 17 + HEM[(x + (P.sway > 0 ? 1 : 0)) % HEM.length] + (P.sway < 0 ? -1 : 0) + by;
    for (let y = 12 + by; y <= hem; y++) {
      const edge = x === 3 || x === 24;
      if (edge && y < 15 + by) continue;
      p.set(x, y, M.YAK, y >= hem ? 0 : y >= hem - 2 ? 1 : (x * 7) % 5 < 2 ? 1 : 2);
    }
  }

  // head: low and forward, darker, with a pale muzzle
  p.layer();
  const hx = 25, hy = 14.5 + by + P.head;
  p.ball(hx, hy, 4.5, 4, M.YAK, { bias: -0.22 });
  p.ball(hx + 3, hy + 2, 2.5, 2, M.STONE2, { bias: 0.2 });
  p.set(hx + 4.5, hy + 1.5, M.INK, 2); // nostril
  if (P.chew) p.set(hx + 3, hy + 4, M.STONE2, 2);

  // eye, just under the fringe
  p.layer({ cast: false });
  const ex = Math.floor(hx) + 1, ey = Math.floor(hy);
  if (P.eye === 'open') { p.set(ex, ey, M.INK, 0); p.set(ex + 1, ey, M.WHITE, 4); }
  else if (P.eye === 'happy') { p.set(ex, ey, M.INK, 0); p.set(ex + 1, ey - 1, M.INK, 0); p.set(ex + 2, ey, M.INK, 0); }
  else p.set(ex, ey + 1, M.INK, 0), p.set(ex + 1, ey + 1, M.INK, 0);

  // fringe: a tawny mop over the brow, strands falling to the eye
  p.layer({ cast: false });
  const fx = Math.floor(hx) - 1, fy = Math.floor(hy) - 3;
  p.oval(fx + 0.5, fy + 0.5, 4, 2.2, M.EARTH, 2);
  for (const [x, y, sh] of [[-3, 2, 1], [-2, 2, 2], [-2, 3, 1], [-1, 3, 2], [0, 2, 2], [1, 3, 2], [2, 2, 2], [3, 2, 1], [4, 1, 2],
    [-2, -1, 3], [-1, -1, 3], [0, -1, 4], [1, -1, 3], [-1, 0, 3], [0, 0, 4], [2, 0, 3], [1, 1, 3],
    [-1, 1, 1], [2, 1, 1], [0, 1, 2]]) p.set(fx + x, fy + y, M.EARTH, sh);

  // horns: the far one peeks out behind, the near one hooks up and back
  p.layer({ cast: false });
  for (const [x, y, sh] of [[-3, -1, 1], [-4, -2, 1], [-4, -3, 2], [-3, -4, 2]]) p.set(fx + x, fy + y, M.BONE, sh);
  p.layer();
  for (const [x, y, sh] of [[2, -2, 2], [3, -2, 2], [3, -3, 3], [4, -3, 3], [4, -4, 4], [5, -4, 3], [5, -5, 4], [4, -6, 4]]) p.set(fx + x, fy + y, M.BONE, sh);
  return p.finish(FIN);
}

export const YAK_ART = {
  yak: {
    name: 'Yak',
    category: 'character',
    tags: ['hero', 'mascot'],
    fw: W, fh: H, ax: 15, ay: 23,
    poses: Object.keys(POSES),
    anims: {
      idle: ['idle_0', 'idle_0', 'idle_1', 'idle_2', 'idle_0', 'idle_3'],
      walk: ['walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5'],
      hop: ['hop'], fall: ['fall'],
      munch: ['munch_0', 'munch_1'],
      happy: ['happy', 'idle_0'],
    },
    defaultAnim: 'walk',
    description: 'The hero and the Pixel Yak mascot: a shaggy little yak. Walk is a 6-frame trot at 10 fps.',
    gen: { style: 'yak-trail', v: 1, by: 'claude-opus-5.5', date: '2026-11-02' },
    draw: drawYak,
  },
};
