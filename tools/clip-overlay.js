// tools/clip-overlay.js — the words of a promo clip: title card, captions and end card, drawn in the
// engine's pixel font on a canvas laid over the game page while tools/clip.cjs films it. The recorder
// copies this file into the clean copy (tools/), so the font it imports is the committed engine's.
// The canvas is one pixel per game pixel and the page scales it up with nearest-neighbour, so the
// words share the game's pixel grid. Timing is the film clock: window.__clip.t() (seconds).
import { text, measure, wrap, LINE_H } from '../engine/shell/font.js';
import { ditherFill } from '../engine/shell/runtime.js';

const FADE = 0.3; // seconds a card's backdrop takes to dither in or out
const TYPE_CPS = 45; // caption typewriter speed (characters a second), done within TYPE_MAX
const TYPE_MAX = 0.5;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// cfg: { length, fps, aspect, overlay: [w, h], fontScale: { caption, title }, safe: { top, bottom },
//        titleCard, captions, endCard, colors } (the normalized recipe + studio/data/clips.mjs clipFrame)
export function install(cfg) {
  const [W, H] = cfg.overlay;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.setAttribute('data-clip-overlay', '');
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', imageRendering: 'pixelated', pointerEvents: 'none', zIndex: '2147483647' });
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  let t0 = null;
  window.__clip = {
    length: cfg.length, fps: cfg.fps, aspect: cfg.aspect,
    start() { t0 = performance.now(); },
    started: () => t0 !== null,
    t: () => (t0 === null ? 0 : (performance.now() - t0) / 1000),
  };
  const frame = () => {
    g.clearRect(0, 0, W, H);
    if (t0 !== null) {
      const t = window.__clip.t();
      for (const cap of cfg.captions) if (t >= cap.from && t < cap.to) caption(g, cfg, cap, t);
      for (const card of [cfg.titleCard, cfg.endCard]) if (card && t >= card.from && t < card.to) drawCard(g, cfg, card, t);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { overlay: [W, H] };
}

// A pixel panel: notched corners, a light border, a drop shadow one unit down.
function panel(g, x, y, w, h, u, { fill, border, shade }) {
  const notched = (px, py, pw, ph, color) => {
    g.fillStyle = color;
    g.fillRect(px + u, py, pw - 2 * u, ph);
    g.fillRect(px, py + u, pw, ph - 2 * u);
  };
  notched(x, y + u, w, h, shade);
  notched(x, y, w, h, border);
  notched(x + u, y + u, w - 2 * u, h - 2 * u, fill);
}

function caption(g, cfg, cap, t) {
  const [W, H] = cfg.overlay;
  const f = cfg.fontScale.caption, col = cfg.colors;
  const lines = wrap(cap.text, Math.floor((W * 0.84) / f));
  const textW = Math.max(...lines.map((l) => measure(l))) * f;
  const padX = 5 * f, padY = 4 * f, lineH = LINE_H * f;
  const bw = textW + 2 * padX, bh = lines.length * lineH - 3 * f + 2 * padY; // 7-row capitals: the descender rows sit in the bottom pad
  const bx = Math.round((W - bw) / 2);
  const by = cap.pos === 'top' ? Math.round(H * cfg.safe.top)
    : cap.pos === 'middle' ? Math.round((H - bh) / 2)
    : Math.round(H * (1 - cfg.safe.bottom)) - bh;
  panel(g, bx, by, bw, bh, f, { fill: col.box, border: col.border, shade: col.shade });
  const total = lines.reduce((n, l) => n + l.length, 0);
  let left = Math.floor((t - cap.from) * Math.max(TYPE_CPS, total / TYPE_MAX));
  lines.forEach((line, i) => {
    if (left <= 0) return;
    text(g, line, Math.round(W / 2), by + padY + i * lineH, col.text, { align: 'center', scale: f, limit: left >= line.length ? undefined : left });
    left -= line.length;
  });
}

function drawCard(g, cfg, card, t) {
  const [W, H] = cfg.overlay;
  const col = cfg.colors, f = cfg.fontScale.caption;
  const kin = card.from <= 0.01 ? 1 : clamp01((t - card.from) / FADE);
  const kout = card.to >= cfg.length - 0.01 ? 1 : clamp01((card.to - t) / FADE);
  const k = Math.min(kin, kout);
  if (card.backdrop !== 'none') ditherFill(g, Math.round(k * (card.backdrop === 'solid' ? 16 : 11)), col.bg);
  if (k < 0.5) return;
  // the title: the biggest size at which it fits on two lines (down to caption size, then as many as it takes)
  const fits = (s) => wrap(card.text, Math.floor((W * 0.88) / s)).every((l) => measure(l) * s <= W * 0.94);
  let ft = cfg.fontScale.title;
  while (ft > f && !(fits(ft) && wrap(card.text, Math.floor((W * 0.88) / ft)).length <= 2)) ft--;
  const lines = wrap(card.text, Math.floor((W * 0.88) / ft));
  // heights include the descender rows (a glyph is 9 rows; lines are LINE_H apart)
  const titleH = lines.length * LINE_H * ft - ft;
  const subLines = card.sub ? wrap(card.sub, Math.floor((W * 0.84) / f)) : [];
  const gap = subLines.length ? 4 * f + f + 4 * f : 0; // space, the accent rule, space
  const subH = subLines.length ? subLines.length * LINE_H * f - 3 * f : 0;
  let y = Math.round(H * 0.46 - (titleH + gap + subH) / 2);
  for (const l of lines) { text(g, l, Math.round(W / 2), y, col.text, { align: 'center', scale: ft, outline: col.shade }); y += LINE_H * ft; }
  if (!subLines.length) return;
  y += -ft + 4 * f; // below the last line's descenders
  const rw = Math.min(Math.round(Math.max(...lines.map((l) => measure(l))) * ft * 0.5), Math.round(W * 0.4));
  g.fillStyle = col.shade;
  g.fillRect(Math.round((W - rw) / 2) - f, y - f, rw + 2 * f, 3 * f);
  g.fillStyle = col.accent;
  g.fillRect(Math.round((W - rw) / 2), y, rw, f);
  y += f + 4 * f;
  for (const l of subLines) { text(g, l, Math.round(W / 2), y, col.accent, { align: 'center', scale: f, outline: col.shade }); y += LINE_H * f; }
}
