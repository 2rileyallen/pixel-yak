// studio/ui/js/icons.js — the studio's icons are code-drawn pixel art too: each is a 16x16
// raster built from tiny drawing ops, emitted as a crisp SVG that inherits currentColor.

const N = 16;

function raster(ops) {
  const px = new Uint8Array(N * N);
  const P = (x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = 1; };
  const E = (x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = 0; };
  const R = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j); };
  const X = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) E(x + i, y + j); };
  const B = (x, y, w, h) => { R(x, y, w, 1); R(x, y + h - 1, w, 1); R(x, y, 1, h); R(x + w - 1, y, 1, h); };
  const L = (x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { P(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  const C = (cx, cy, r, fill = false) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (fill ? d <= r * r + r : d <= r * r + r && d >= r * r - r) P(cx + x, cy + y);
    }
  };
  const TR = (x, y, h) => { for (let k = 0; k < h; k++) R(x, y + k, Math.min(k, h - 1 - k) + 1, 1); }; // ▶
  const TL = (x, y, h) => { for (let k = 0; k < h; k++) { const w = Math.min(k, h - 1 - k) + 1; R(x - w + 1, y + k, w, 1); } }; // ◀
  const TD = (x, y, w) => { for (let k = 0; k * 2 < w; k++) R(x + k, y + k, w - 2 * k, 1); }; // ▼
  const TU = (x, y, w) => { for (let k = 0; k * 2 < w; k++) R(x + k, y - k, w - 2 * k, 1); }; // ▲
  ops({ P, E, R, X, B, L, C, TR, TL, TD, TU });
  return px;
}

const DEFS = {
  pencil: ({ L, P, R }) => { for (let k = 0; k < 3; k++) L(4 + k, 12 - k + 1, 12, 3 + k - 1); L(3, 12, 3, 12); R(2, 13, 2, 1); P(2, 12); R(12, 2, 2, 2); },
  eraser: ({ B, R, L }) => { B(2, 5, 12, 7); R(8, 6, 5, 5); L(2, 13, 13, 13); },
  fill: ({ R, X, L, P }) => { for (let k = 0; k < 8; k++) R(2 + (k >> 2), 5 + k, 10 - 2 * (k >> 2), 1); X(4, 7, 6, 4); R(4, 9, 6, 2); L(3, 4, 6, 1); L(6, 1, 10, 4); R(12, 6, 2, 4); R(13, 10, 1, 2); P(12, 10); },
  picker: ({ L, R, P }) => { L(3, 12, 9, 6); L(4, 12, 10, 6); L(3, 13, 3, 13); R(2, 13, 1, 1); R(9, 3, 3, 3); R(10, 2, 4, 3); R(12, 4, 2, 4); P(8, 5); P(11, 8); },
  line: ({ L, R }) => { L(3, 12, 12, 3); R(2, 12, 2, 2); R(12, 2, 2, 2); },
  rect: ({ B }) => { B(2, 3, 12, 10); B(3, 4, 10, 8); },
  select: ({ R }) => { for (let i = 2; i < 14; i += 3) { R(i, 3, 2, 1); R(i, 12, 2, 1); } for (let j = 3; j < 13; j += 3) { R(2, j, 1, 2); R(13, j, 1, 2); } },
  move: ({ R, TU, TD, TL, TR }) => { R(7, 3, 2, 10); R(3, 7, 10, 2); TU(5, 3, 6); TD(5, 12, 6); TL(3, 5, 6); TR(12, 5, 6); },
  mirror: ({ R, TL, TR }) => { for (let j = 1; j < 15; j += 2) R(7, j, 2, 1); TL(5, 4, 9); TR(10, 4, 9); },
  shade: ({ C, R, X }) => { C(8, 8, 6); C(8, 8, 5, true); X(8, 2, 6, 13); C(8, 8, 6); R(8, 2, 1, 13); },
  undo: ({ R, TL }) => { R(5, 6, 6, 2); R(11, 7, 2, 1); R(12, 8, 2, 4); R(11, 12, 2, 1); R(5, 13, 6, 2); TL(5, 3, 7); },
  redo: ({ R, TR }) => { R(5, 6, 6, 2); R(3, 7, 2, 1); R(2, 8, 2, 4); R(3, 12, 2, 1); R(5, 13, 6, 2); TR(10, 3, 7); },
  play: ({ TR }) => { TR(5, 2, 12); TR(6, 3, 10); },
  pause: ({ R }) => { R(4, 3, 3, 10); R(9, 3, 3, 10); },
  prev: ({ R, TL }) => { R(3, 3, 2, 10); TL(12, 3, 10); },
  next: ({ R, TR }) => { R(11, 3, 2, 10); TR(4, 3, 10); },
  plus: ({ R }) => { R(7, 3, 2, 10); R(3, 7, 10, 2); },
  minus: ({ R }) => { R(3, 7, 10, 2); },
  trash: ({ R, B }) => { R(2, 3, 12, 2); R(6, 1, 4, 2); B(3, 5, 10, 10); R(6, 7, 1, 6); R(9, 7, 1, 6); },
  grid: ({ B, R }) => { B(2, 2, 12, 12); R(6, 2, 1, 12); R(9, 2, 1, 12); R(2, 6, 12, 1); R(2, 9, 12, 1); },
  onion: ({ B, R }) => { B(2, 2, 8, 8); R(6, 6, 8, 8); },
  compare: ({ B, R }) => { B(2, 3, 12, 10); R(8, 3, 6, 10); },
  diff: ({ R }) => { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if ((i + j) % 2 === 0) R(2 + i * 3, 2 + j * 3, 2, 2); },
  save: ({ B, R, X }) => { R(2, 2, 12, 12); X(4, 3, 7, 4); R(9, 4, 1, 2); X(4, 9, 8, 4); R(5, 10, 6, 1); },
  bake: ({ B, R, X }) => { B(5, 2, 6, 6); B(6, 3, 4, 5); R(3, 7, 10, 8); X(7, 9, 2, 4); },
  revert: ({ R, TL, C, X }) => { C(8, 9, 5); X(3, 4, 5, 4); X(3, 9, 3, 1); TL(6, 2, 7); R(6, 5, 2, 1); },
  inbox: ({ R, B, X }) => { B(2, 3, 12, 11); R(2, 9, 4, 1); R(10, 9, 4, 1); R(5, 9, 1, 2); R(10, 9, 1, 2); R(6, 11, 4, 1); },
  lessons: ({ R, P }) => { R(7, 1, 2, 14); R(1, 7, 14, 2); R(5, 5, 6, 6); P(4, 4); P(11, 4); P(4, 11); P(11, 11); },
  projects: ({ B, R, X }) => { R(3, 1, 10, 14); X(5, 3, 6, 5); R(6, 4, 4, 3); X(4, 13, 1, 1); X(11, 13, 1, 1); R(5, 10, 6, 1); },
  ideas: ({ C, R, X }) => { C(8, 6, 5); C(8, 6, 4, true); X(6, 5, 1, 1); R(6, 11, 4, 2); R(6, 14, 4, 1); },
  art: ({ C, R, X, P }) => { C(8, 8, 6, true); X(9, 10, 5, 5); X(10, 9, 3, 1); X(4, 6, 2, 2); X(7, 4, 2, 2); X(10, 5, 2, 2); X(5, 10, 2, 2); P(13, 13); },
  help: ({ R, P }) => { R(5, 2, 6, 2); R(11, 3, 2, 4); R(4, 3, 2, 2); R(8, 6, 3, 2); R(7, 8, 2, 3); R(7, 12, 2, 2); },
  close: ({ L }) => { for (let k = 0; k < 2; k++) { L(3 + k, 3, 12, 12 - k); L(3, 3 + k, 12 - k, 12); L(12 - k, 3, 3, 12 - k); L(12, 3 + k, 3 + k, 12); } },
  check: ({ L }) => { for (let k = 0; k < 2; k++) { L(2, 8 + k, 6, 12 + k); L(6, 12 + k, 13, 4 + k); } },
  folder: ({ R, X }) => { R(2, 3, 5, 2); R(2, 5, 12, 9); X(3, 7, 10, 6); R(2, 7, 12, 1); },
  game: ({ R, X, P }) => { R(2, 5, 12, 7); R(1, 7, 1, 5); R(14, 7, 1, 5); X(4, 7, 1, 3); X(3, 8, 3, 1); X(11, 7, 1, 1); X(12, 9, 1, 1); R(4, 12, 2, 1); R(10, 12, 2, 1); },
  camera: ({ R, X, C }) => { R(2, 5, 12, 9); R(5, 3, 5, 2); X(6, 7, 4, 4); R(7, 8, 2, 2); X(11, 6, 1, 1); },
  copy: ({ B, R }) => { B(2, 2, 8, 9); R(6, 6, 8, 9); },
  search: ({ C, L }) => { C(6, 6, 4); L(9, 10, 13, 14); L(10, 9, 14, 13); L(10, 10, 14, 14); },
  chevron: ({ TD }) => { TD(3, 6, 10); },
  refresh: ({ C, X, TR, R }) => { C(8, 8, 5); X(9, 2, 6, 6); TR(8, 1, 6); R(7, 3, 1, 2); },
  warn: ({ R, X }) => { for (let k = 0; k < 13; k++) { const hw = 1 + Math.floor(k * 0.55); R(8 - hw, 2 + k, hw * 2, 1); } X(7, 6, 2, 5); X(7, 12, 2, 2); },
  bot: ({ B, R, X, P }) => { R(3, 4, 10, 9); X(5, 6, 2, 2); X(9, 6, 2, 2); X(6, 10, 4, 1); R(7, 1, 2, 3); R(1, 7, 2, 3); R(13, 7, 2, 3); },
  user: ({ C, R }) => { C(8, 5, 3, true); R(3, 10, 10, 5); R(4, 9, 8, 1); },
  film: ({ R, X }) => { R(2, 2, 12, 12); X(4, 4, 8, 8); for (let j = 3; j < 13; j += 3) { X(2, j, 1, 1); X(13, j, 1, 1); } },
  dup: ({ B, R, X }) => { B(1, 1, 9, 9); R(5, 5, 10, 10); X(6, 6, 8, 8); R(9, 7, 2, 6); R(7, 9, 6, 2); },
  zoomin: ({ C, L, R }) => { C(6, 6, 4); L(10, 10, 14, 14); L(9, 10, 13, 14); R(4, 6, 5, 1); R(6, 4, 1, 5); },
  zoomout: ({ C, L, R }) => { C(6, 6, 4); L(10, 10, 14, 14); L(9, 10, 13, 14); R(4, 6, 5, 1); },
  send: ({ L, R }) => { for (let k = 0; k < 3; k++) L(2, 7 + k, 13, 8); L(2, 3, 13, 8); L(2, 13, 13, 8); L(2, 3, 2, 13); L(5, 8, 2, 13); },
  open: ({ B, R, L, X }) => { B(2, 4, 10, 10); X(7, 4, 5, 5); R(9, 2, 5, 1); R(13, 2, 1, 5); L(7, 8, 13, 2); L(8, 8, 13, 3); },
  dot: ({ C }) => { C(8, 8, 4, true); },
  frames: ({ R, X }) => { R(1, 4, 4, 8); R(6, 4, 4, 8); R(11, 4, 4, 8); X(2, 5, 2, 6); X(12, 5, 2, 6); },
  hold: ({ R, B }) => { B(2, 4, 5, 8); R(9, 4, 5, 8); R(7, 7, 2, 2); },
  fit: ({ R }) => { R(2, 2, 4, 1); R(2, 2, 1, 4); R(10, 2, 4, 1); R(13, 2, 1, 4); R(2, 13, 4, 1); R(2, 10, 1, 4); R(10, 13, 4, 1); R(13, 10, 1, 4); R(6, 6, 4, 4); },
  left: ({ TL }) => { TL(9, 3, 10); },
  right: ({ TR }) => { TR(6, 3, 10); },
  sound: ({ R, L }) => { R(2, 6, 3, 4); R(5, 4, 2, 8); R(7, 2, 1, 12); L(10, 5, 11, 6); R(11, 7, 1, 2); L(10, 10, 11, 9); L(12, 3, 14, 6); R(14, 7, 1, 2); L(12, 12, 14, 9); },
  pp: ({ R }) => { for (let k = 0; k < 6; k++) R(1 + k * 2, 12 - k * 2, 3, 2); },
  anchor: ({ R, C }) => { R(7, 2, 2, 11); C(8, 3, 1); R(4, 6, 8, 1); R(2, 10, 2, 2); R(12, 10, 2, 2); R(3, 12, 10, 2); },
};

const cache = new Map();
export function iconSvg(name) {
  let s = cache.get(name);
  if (s) return s;
  const def = DEFS[name] || DEFS.dot;
  const px = raster(def);
  let d = '';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      if (!px[y * N + x]) { x++; continue; }
      let run = 1;
      while (x + run < N && px[y * N + x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  s = `<svg class="ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
  cache.set(name, s);
  return s;
}

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.innerHTML = iconSvg(name);
  return span;
}

export const ICON_NAMES = Object.keys(DEFS);
