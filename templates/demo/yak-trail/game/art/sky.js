// art/sky.js — the backdrop: a banded sky (ordered dither between ramp stops, never a smooth
// gradient), two ranges of mountains that scroll slower than the trail (parallax), and clouds.
// Mountains tile left to right: their outlines repeat exactly every frame width.
import { Pix, bayer } from '../../engine/art/pix.js';
import { M, FIN_FLAT } from '../../design/palette.js';

// Sky: five bands of the DAY ramp, dark at the top, dithered into each other.
function drawSky() {
  const p = new Pix(32, 180);
  for (let y = 0; y < 180; y++) {
    const t = Math.min(3.999, (y / 150) * 4); // 0..4 across the top 150 rows
    const s = Math.floor(t), f = t - s;
    for (let x = 0; x < 32; x++) p.set(x, y, M.DAY, f > 0.55 && bayer(x, y) < (f - 0.55) / 0.45 ? s + 1 : s);
  }
  for (let y = 150; y < 180; y++) for (let x = 0; x < 32; x++) p.set(x, y, M.DAY, 4);
  return p.finish(FIN_FLAT);
}

// A periodic ridge line: a few waves whose periods divide the width, so the strip tiles.
function ridge(w, x, waves) {
  let h = 0;
  for (const [amp, cycles, phase] of waves) h += amp * Math.sin(((x / w) * cycles + phase) * Math.PI * 2);
  return h;
}

// Far peaks: hazy blue triangles, light from the left (left faces lit, right faces in shade), snow
// caps with a ragged edge. Taller peaks are drawn first, so nearer, shorter ones overlap them.
const PEAKS = [[18, 22, 1.1], [58, 8, 1.0], [96, 30, 1.2], [132, 14, 0.9], [176, 4, 1.05], [214, 24, 1.15], [244, 16, 1.0]];
function drawFar() {
  const W = 256, H = 80;
  const p = new Pix(W, H);
  const order = [...PEAKS].sort((a, b) => a[1] - b[1]);
  for (const [px, py, slope] of order) {
    p.layer();
    for (const off of [-W, 0, W]) {
      for (let x = Math.floor(px + off - H / slope); x <= px + off + H / slope; x++) {
        if (x < 0 || x >= W) continue;
        const dx = x - (px + off), y0 = Math.round(py + Math.abs(dx) * slope);
        const snowTo = py + 10 + Math.abs(dx) * slope * 0.55 + Math.floor(bayer(x, 0) * 4) + (Math.abs(dx) % 5 === 2 ? 3 : 0);
        for (let y = Math.max(0, y0); y < H; y++) {
          const lit = dx < 0;
          if (y < snowTo) p.set(x, y, M.WHITE, lit ? 4 : 3);
          else p.set(x, y, M.PEAKS, y - y0 < 2 && lit ? 4 : lit ? 3 : 2);
        }
      }
    }
  }
  // the haze at the foot of the range
  for (let y = 56; y < H; y++) for (let x = 0; x < W; x++) if (p.matAt(x, y) && bayer(x, y) < (y - 56) / 24) p.set(x, y, M.PEAKS, 3);
  return p.finish(FIN_FLAT);
}

// The nearer ridge: rounder, darker, with little pines along the top.
function drawNear() {
  const W = 256, H = 64;
  const p = new Pix(W, H);
  const waves = [[8, 2, 0.35], [5, 5, 0.1], [2, 11, 0.7]];
  const top = (x) => Math.round(30 - ridge(W, x, waves));
  for (let x = 0; x < W; x++) {
    const y0 = top(x), slope = top((x + 1) % W) - top((x - 1 + W) % W);
    for (let y = y0; y < H; y++) {
      const depth = y - y0;
      p.set(x, y, M.RIDGE, depth < 2 ? (slope > 0 ? 3 : 2) : depth < 10 ? 2 : depth < 14 && bayer(x, y) < (14 - depth) / 4 ? 2 : 1);
    }
  }
  for (let x = 5; x < W; x += 11 + ((x * 7) % 9)) { // pines
    const y0 = top(x), hgt = 7 + ((x * 13) % 5);
    for (let j = 0; j < hgt; j++) {
      const half = Math.floor((j + 1) / 3);
      for (let k = -half; k <= half; k++) p.set(x + k, y0 - hgt + j + 1, M.RIDGE, k < 0 ? 1 : 0);
    }
  }
  return p.finish(FIN_FLAT);
}

// Clouds: puffy tops, flat bottoms.
function drawCloud(pose) {
  const p = new Pix(48, 16);
  const puffs = pose === 'b' ? [[12, 10, 8, 5], [24, 8, 9, 7], [36, 10, 7, 5]] : [[10, 11, 7, 4], [20, 8, 8, 6], [30, 9, 7, 5], [39, 11, 6, 3]];
  for (const [x, y, rx, ry] of puffs) p.ball(x, y, rx, ry, M.CLOUD, { bias: 0.25, min: 3, max: 4 });
  for (let x = 0; x < 48; x++) for (let y = 13; y < 16; y++) p.set(x, y, 0);
  for (let x = 0; x < 48; x++) if (p.matAt(x, 12)) p.set(x, 12, M.CLOUD, 3);
  return p.finish(FIN_FLAT);
}

const gen = { style: 'yak-trail', v: 1, by: 'claude-opus-5.5', date: '2026-11-02' };

export const SKY_ART = {
  sky: {
    name: 'Sky', category: 'backdrop', tags: ['backdrop'],
    fw: 32, fh: 180, ax: 0, ay: 0, poses: ['day'], anims: { day: ['day'] }, defaultAnim: 'day',
    description: 'The sky behind everything, repeated across the screen. Bands, dithered between — no smooth gradients.',
    gen, draw: drawSky,
  },
  mountains_far: {
    name: 'Far mountains', category: 'backdrop', tags: ['backdrop', 'parallax'],
    fw: 256, fh: 80, ax: 0, ay: 0, poses: ['range'], anims: { range: ['range'] }, defaultAnim: 'range',
    description: 'The far range, scrolling slowly. Repeats left to right: keep the left and right edges matching.',
    gen, draw: drawFar,
  },
  mountains_near: {
    name: 'Near ridge', category: 'backdrop', tags: ['backdrop', 'parallax'],
    fw: 256, fh: 64, ax: 0, ay: 0, poses: ['ridge'], anims: { ridge: ['ridge'] }, defaultAnim: 'ridge',
    description: 'The nearer ridge with pines, scrolling a little faster than the far range. Repeats left to right.',
    gen, draw: drawNear,
  },
  cloud: {
    name: 'Cloud', category: 'backdrop', tags: ['backdrop'],
    fw: 48, fh: 16, ax: 24, ay: 15, poses: ['a', 'b'], anims: { all: ['a', 'b'] }, defaultAnim: 'all',
    description: 'Clouds drifting by (moved whole, a pixel at a time).',
    gen, draw: drawCloud,
  },
};
