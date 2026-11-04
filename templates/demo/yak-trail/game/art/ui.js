// art/ui.js — Yak Trail's own UI art: the title logo (the font's letters, built up into chunky gold
// blocks with snow on top) and the little HUD icons. The font and the widgets (boxes, bars,
// checkboxes) come from the engine: engine/art/font-art.js and engine/art/widget-art.js.
import { Pix } from '../../engine/art/pix.js';
import { glyphRows } from '../../engine/shell/font.js';
import { M, FIN } from '../../design/palette.js';

const LW = 176, LH = 34, B = 3; // logo frame; each font pixel becomes a B×B block

function drawLogo() {
  const p = new Pix(LW, LH);
  const word = 'YAK TRAIL';
  const glyphs = [...word].map((ch) => glyphRows(ch));
  const width = glyphs.reduce((w, g) => w + (g.w + 1) * B, -B);
  const ox = Math.floor((LW - width) / 2), oy = 5;
  const solid = new Set();
  let cx = ox;
  for (const g of glyphs) {
    g.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') solid.add(`${cx + i * B},${oy + j * B}`); });
    cx += (g.w + 1) * B;
  }
  const at = (x, y) => solid.has(`${x},${y}`);
  // the extrusion: each block cast down-right, darker
  for (const k of solid) {
    const [x, y] = k.split(',').map(Number);
    for (let d = 1; d <= 2; d++) p.rect(x + d, y + d, B, B, M.EARTH, 1);
  }
  p.layer();
  for (const k of solid) {
    const [x, y] = k.split(',').map(Number);
    const row = (y - oy) / B;
    const s = row < 2 ? 4 : row < 5 ? 3 : 2;
    p.rect(x, y, B, B, M.GOLD, s);
    if (!at(x, y + B)) p.rect(x, y + B - 1, B, 1, M.GOLD, Math.max(1, s - 1)); // the bottom of a stroke is darker
  }
  // snow on every top
  p.layer({ cast: false });
  for (const k of solid) {
    const [x, y] = k.split(',').map(Number);
    if (at(x, y - B)) continue;
    p.rect(x, y - 1, B, 2, M.WHITE, 4);
    if ((x * 7 + y) % 5 === 0) p.set(x + 1, y + 1, M.WHITE, 3); // a drip
  }
  return p.finish(FIN);
}

// HUD icons, 10×10.
function drawIcon(pose) {
  const p = new Pix(10, 10);
  if (pose === 'tuft') {
    for (const [x, len] of [[2, 4], [4, 6], [5, 7], [7, 5], [8, 3]]) p.line(x, 8, x + (x > 5 ? 1 : x < 4 ? -1 : 0), 8 - len, M.GRASS, 3);
    p.rect(2, 8, 7, 1, M.GRASS, 2);
    p.set(5, 1, M.GOLD, 4);
  } else if (pose === 'clock') {
    p.ball(5, 5, 4, 4, M.WHITE, { bias: 0.2, min: 3 });
    p.set(5, 2, M.INK, 1); p.set(5, 3, M.INK, 1); p.set(5, 4, M.INK, 1); p.set(6, 5, M.INK, 1); p.set(7, 5, M.INK, 1);
  } else { // peak: a mountain with a flag
    p.poly([[0.5, 9.5], [5, 2], [9.5, 9.5]], M.PEAKS, 3);
    p.poly([[3.6, 4.5], [5, 2], [6.4, 4.5]], M.WHITE, 4);
    p.rect(5, 0, 1, 2, M.WOOD, 3); p.set(6, 0, M.FLAG, 4);
  }
  return p.finish(FIN);
}

const gen = { style: 'yak-trail', v: 1, by: 'claude-opus-5.5', date: '2026-11-02' };

export const UI_ART = {
  title_logo: {
    name: 'Title logo', category: 'ui', tags: ['title'],
    fw: LW, fh: LH, ax: LW / 2, ay: 0, poses: ['logo'], anims: { logo: ['logo'] }, defaultAnim: 'logo',
    description: '"YAK TRAIL" on the title screen: the font\'s letters as gold blocks, snow on top.',
    gen, draw: drawLogo,
  },
  icon: {
    name: 'HUD icons', category: 'ui', tags: ['hud'],
    fw: 10, fh: 10, ax: 0, ay: 0, poses: ['tuft', 'clock', 'peak'], anims: { all: ['tuft', 'clock', 'peak'] }, defaultAnim: 'all',
    description: 'Tufts munched, the time, how far to the top.',
    gen, draw: drawIcon,
  },
};
