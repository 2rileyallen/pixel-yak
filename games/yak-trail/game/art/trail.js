// art/trail.js — what the trail is made of: ground strips (the surface, laid along the slope column by
// column), the fill under it (tiled on the world grid), rocks, grass tufts, cairns and the summit
// bunting. One pose per zone where the look changes (meadow · rocky · snow).
import { Pix } from '../../engine/art/pix.js';
import { hash } from '../../engine/shell/runtime.js';
import { M, FIN, FIN_FLAT } from '../../design/palette.js';

const T = 16;
const wrap = (v) => ((v % T) + T) % T;
const n = (x, y, seed) => hash(wrap(x), wrap(y), seed); // tile-periodic noise: fills tile seamlessly

// The surface strip. Row 3 is the ground line: rows 0–2 poke up above it (blades, pebbles, drifts),
// and below the edge it is see-through so the fill shows.
function drawGround(pose) {
  const p = new Pix(T, T);
  for (let x = 0; x < T; x++) {
    if (pose === 'meadow') {
      const depth = 6 + Math.floor(n(x, 0, 3) * 3);
      for (let y = 3; y < 3 + depth; y++) p.set(x, y, M.GRASS, y === 3 ? 4 : y < 5 ? 3 : y < 3 + depth - 1 ? 2 : 1);
      const blade = n(x, 1, 7);
      if (blade > 0.55) { p.set(x, 2, M.GRASS, 3); if (blade > 0.8) p.set(x, 1, M.GRASS, 4); }
      if (n(x, 2, 11) > 0.86) p.set(x, 6, M.GRASS, 4); // a few bright blades in the turf
    } else if (pose === 'rocky') {
      const depth = 4 + Math.floor(n(x, 0, 5) * 3);
      for (let y = 3; y < 3 + depth; y++) p.set(x, y, M.STONE2, y === 3 ? 4 : y === 4 ? 3 : y < 3 + depth - 1 ? 2 : 1);
      if (x % 7 === 3) p.set(x, 5, M.STONE2, 1); // seams between flagstones
      if (n(x, 1, 9) > 0.8) p.set(x, 2, M.STONE2, 3);
      if (n(x, 3, 13) > 0.85) { p.set(x, 4, M.GRASS, 3); p.set(x, 3, M.GRASS, 4); } // grass in the cracks
    } else {
      const depth = 5 + Math.floor(n(x, 0, 2) * 3);
      for (let y = 3; y < 3 + depth; y++) p.set(x, y, M.WHITE, y < 5 ? 4 : y < 3 + depth - 1 ? 3 : 2);
      const drift = n(Math.floor(x / 3), 2, 4);
      if (drift > 0.4) p.set(x, 2, M.WHITE, 4);
      if (drift > 0.75 && x % 3 === 1) p.set(x, 1, M.WHITE, 4);
      if (n(x, 4, 6) > 0.8) p.set(x, 3 + depth, M.WHITE, 1); // a drip of ice
    }
  }
  return p.finish(FIN_FLAT);
}

// The fill under the surface: tiles seamlessly on the world grid.
function drawFill(pose) {
  const p = new Pix(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (pose === 'meadow') {
      const v = n(x, y, 21);
      p.set(x, y, M.EARTH, v > 0.9 ? 2 : v < 0.12 ? 0 : 1);
      if (n(Math.floor(x / 2), Math.floor(y / 2), 23) > 0.93) p.set(x, y, M.STONE2, 2); // pebbles
    } else if (pose === 'rocky') {
      const band = Math.floor((y + Math.floor(n(x, 0, 31) * 2)) / 4);
      const v = n(x, y, 29);
      p.set(x, y, M.STONE2, band % 2 ? 1 : 2);
      if (v > 0.9) p.set(x, y, M.STONE2, 3);
      if (v < 0.06) p.set(x, y, M.STONE2, 0);
    } else {
      const v = n(x, y, 41);
      p.set(x, y, M.STONE, v > 0.85 ? 2 : 1);
      if (v > 0.96) p.set(x, y, M.WHITE, 2); // frost
    }
  }
  return p.finish(FIN_FLAT);
}

// Rocks, bottom-centred in a 32×26 frame; their size matches level.js ROCKS (w × h, plus a lip).
const ROCK = { small: [16, 12], mid: [20, 18], big: [26, 24] };
function drawRock(pose) {
  const [kind, snowy] = pose.split('_');
  const [w, h] = ROCK[kind];
  const p = new Pix(32, 26);
  const cx = 16, base = 24;
  p.ball(cx, base - h / 2 + 2, w / 2, h / 2 + 2, M.STONE2, { bias: 0.04 });
  for (let y = base + 1; y < 26; y++) for (let x = 0; x < 32; x++) p.erase(x, y); // flat underside sits on the ground
  // a crack and a facet line
  p.layer({ cast: false });
  p.line(cx + 1, base - h + 4, cx + 3, base - h / 2, M.STONE2, 1);
  p.line(cx - w / 2 + 3, base - h / 2 + 2, cx - 1, base - h / 2 + 3, M.STONE2, 2);
  if (snowy) {
    p.layer();
    for (let x = cx - w / 2 + 1; x < cx + w / 2 - 1; x++) {
      let y = 0; while (y < 26 && !p.matAt(x, y)) y++;
      if (y >= 26) continue;
      const d = 1 + Math.floor(hash(x, 3, 17) * 2) + (Math.abs(x - cx) < w / 4 ? 1 : 0);
      for (let k = 0; k < d; k++) p.set(x, y + k, M.WHITE, k ? 3 : 4);
    }
  } else {
    p.layer();
    for (let x = cx - w / 2 + 2; x < cx; x++) if (hash(x, 5, 19) > 0.45) { // moss on the shady side
      let y = 0; while (y < 26 && !p.matAt(x, y)) y++;
      if (y < 26 && y > base - h + 2) p.set(x, y, M.MOSS, 3);
    }
  }
  return p.finish(FIN);
}

// A grass tuft to munch: long blades with a flower; frosted in the snow.
function drawTuft(pose) {
  const p = new Pix(16, 14);
  const frost = pose.startsWith('frost'), lean = pose.endsWith('1') ? 1 : 0;
  const mat = frost ? M.MOSS : M.GRASS;
  const blades = [[3, 7, -2], [5, 10, -1], [7, 12, 0], [8, 11, 1], [10, 9, 1], [12, 6, 2], [6, 8, 0], [9, 7, 1]];
  for (const [x, len, tilt] of blades) {
    const tip = 13 - len, tx = x + tilt + (len > 8 ? lean : 0);
    p.line(x, 12, tx, tip, mat, 2);
    p.set(tx, tip, mat, frost ? 3 : 4);
    if (frost) p.set(tx, tip, M.WHITE, 4);
  }
  p.layer();
  p.rect(3, 11, 10, 2, mat, 1);
  if (!frost) { p.layer(); p.set(9 + lean, 3, M.GOLD, 4); p.set(10 + lean, 4, M.GOLD, 3); p.set(8 + lean, 4, M.GOLD, 3); p.set(9 + lean, 4, M.HAIR, 2); }
  return p.finish(FIN);
}

// A cairn: stacked stones; a little pennant pops up once the yak has passed it.
function drawCairn(pose) {
  const p = new Pix(16, 30);
  const stones = [[8, 26, 6, 3], [7.5, 21.5, 4.5, 2.5], [8.5, 17.5, 3.5, 2], [8, 14, 2.5, 1.8]];
  for (const [x, y, rx, ry] of stones) { p.layer(); p.ball(x, y, rx, ry, M.STONE2, { bias: 0.05 }); }
  if (pose !== 'plain') {
    p.layer();
    p.rect(8, 2, 1, 11, M.WOOD, 3);
    const wave = pose === 'flag_1';
    const rows = wave ? ['####', '#####', '####.', '###'] : ['#####', '####', '#####', '##'];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') p.set(9 + i, 2 + j + (wave && i > 2 ? 1 : 0), M.FLAG, j === 0 ? 4 : 3); });
  }
  return p.finish(FIN);
}

// The summit: two poles with a string of little flags between them.
function drawSummit(pose) {
  const p = new Pix(80, 48);
  const wave = pose === 'wave_1' ? 1 : 0;
  const colours = [M.FLAG, M.GOLD, M.IRIS, M.WHITE, M.GRASS, M.FLAG, M.GOLD, M.IRIS];
  p.rect(5, 6, 2, 41, M.WOOD, 3); p.rect(73, 6, 2, 41, M.WOOD, 3);
  p.set(5, 5, M.GOLD, 4); p.set(6, 5, M.GOLD, 4); p.set(73, 5, M.GOLD, 4); p.set(74, 5, M.GOLD, 4);
  p.layer();
  const sag = (x) => 8 + Math.round(10 * Math.sin(((x - 7) / 66) * Math.PI));
  for (let x = 7; x < 73; x++) p.set(x, sag(x), M.PAPER, 2);
  p.layer();
  colours.forEach((m, i) => {
    const x0 = 10 + i * 8, y0 = sag(x0 + 2) + 1;
    for (let j = 0; j < 6; j++) {
      const half = Math.max(0, 3 - Math.floor(j / 2));
      for (let k = -half; k <= half; k++) p.set(x0 + 2 + k + (wave && j > 2 ? (i % 2 ? 1 : -1) : 0), y0 + j, m, j < 2 ? 4 : 3);
    }
  });
  return p.finish(FIN);
}

const gen = { style: 'yak-trail', v: 1, by: 'claude-opus-5.5', date: '2026-11-02' };

export const TRAIL_ART = {
  ground: {
    name: 'Ground (surface strip)', category: 'tileset', tags: ['terrain'],
    fw: T, fh: T, ax: 0, ay: 3, poses: ['meadow', 'rocky', 'snow'], anims: { zones: ['meadow', 'rocky', 'snow'] }, defaultAnim: 'zones',
    description: 'The top of the ground, laid along the trail column by column (so slopes follow it). Row 3 is the ground line; rows above it poke up; below the edge, leave it see-through so the fill shows.',
    gen, draw: drawGround,
  },
  ground_fill: {
    name: 'Ground (fill)', category: 'tileset', tags: ['terrain'],
    fw: T, fh: T, ax: 0, ay: 0, poses: ['meadow', 'rocky', 'snow'], anims: { zones: ['meadow', 'rocky', 'snow'] }, defaultAnim: 'zones',
    description: 'What is under the ground: tiled on a 16 px grid, so keep the edges matching.',
    gen, draw: drawFill,
  },
  rock: {
    name: 'Rock', category: 'prop', tags: ['obstacle'],
    fw: 32, fh: 26, ax: 16, ay: 25, poses: ['small', 'mid', 'big', 'small_snow', 'mid_snow', 'big_snow'],
    anims: { all: ['small', 'mid', 'big', 'small_snow', 'mid_snow', 'big_snow'] }, defaultAnim: 'all',
    description: 'Rocks to hop over. The yak stands on their tops (level.js ROCKS has the sizes it collides with).',
    gen, draw: drawRock,
  },
  tuft: {
    name: 'Grass tuft', category: 'prop', tags: ['pickup'],
    fw: 16, fh: 14, ax: 8, ay: 13, poses: ['sway_0', 'sway_1', 'frost_0', 'frost_1'],
    anims: { sway: ['sway_0', 'sway_1'], frost: ['frost_0', 'frost_1'] }, defaultAnim: 'sway',
    description: 'A tuft the yak munches when it trots onto one. Sways at 3 fps; frosted in the snow.',
    gen, draw: drawTuft,
  },
  cairn: {
    name: 'Cairn', category: 'prop', tags: ['checkpoint'],
    fw: 16, fh: 30, ax: 8, ay: 28, poses: ['plain', 'flag_0', 'flag_1'],
    anims: { plain: ['plain'], flag: ['flag_0', 'flag_1'] }, defaultAnim: 'flag',
    description: 'A checkpoint: a fall comes back to the last one passed. Its pennant waves once reached.',
    gen, draw: drawCairn,
  },
  summit: {
    name: 'Summit bunting', category: 'prop', tags: ['goal'],
    fw: 80, fh: 48, ax: 40, ay: 46, poses: ['wave_0', 'wave_1'], anims: { wave: ['wave_0', 'wave_1'] }, defaultAnim: 'wave',
    description: 'The top of the trail: reach it to finish.',
    gen, draw: drawSummit,
  },
};
