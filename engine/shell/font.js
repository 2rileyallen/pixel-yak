// engine/shell/font.js — proportional pixel font with lowercase + descenders, shared by new games.
// Glyphs cover ASCII plus × … | _ ^ ← → ↑ ↓ ◀ ▶ ✓.
// Glyph rows: '#' ink, '.' empty, '/' row separator. Cap height 7, x-height 5
// (rows 2-6), descenders rows 7-8. Line height 10.
// Inline color tags in strings: [g] gold [r] red [c] cyan [p] purple [w] white [m] muted [/] reset.

const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '..../..../.##./...#/.###/#..#/.###',
  b: '#.../#.../###./#..#/#..#/#..#/###.',
  c: '..../..../.###/#.../#.../#.../.###',
  d: '...#/...#/.###/#..#/#..#/#..#/.###',
  e: '..../..../.##./#..#/####/#.../.###',
  f: '.##/#../###/#../#../#../#..',
  g: '..../..../.###/#..#/#..#/#..#/.###/...#/.##.',
  h: '#.../#.../###./#..#/#..#/#..#/#..#',
  i: '#/./#/#/#/#/#',
  j: '.#/../.#/.#/.#/.#/.#/.#/#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../####./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '..../..../###./#..#/#..#/#..#/#..#',
  o: '..../..../.##./#..#/#..#/#..#/.##.',
  p: '..../..../###./#..#/#..#/#..#/###./#.../#...',
  q: '..../..../.###/#..#/#..#/#..#/.###/...#/...#',
  r: '.../.../#.#/##./#../#../#..',
  s: '..../..../.###/#.../.##./...#/###.',
  t: '.#./.#./###/.#./.#./.#./..#',
  u: '..../..../#..#/#..#/#..#/#..#/.###',
  v: '...../...../#...#/#...#/.#.#./.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '..../..../#..#/#..#/.##./#..#/#..#',
  y: '..../..../#..#/#..#/#..#/#..#/.###/...#/.##.',
  z: '..../..../####/...#/.##./#.../####',
  0: '.##./#..#/#..#/#..#/#..#/#..#/.##.',
  1: '.#../##../.#../.#../.#../.#../###.',
  2: '.##./#..#/...#/..#./.#../#.../####',
  3: '###./...#/...#/.##./...#/...#/###.',
  4: '..#./.##./#.#./#.#./####/..#./..#.',
  5: '####/#.../###./...#/...#/#..#/.##.',
  6: '.##./#.../#.../###./#..#/#..#/.##.',
  7: '####/...#/..#./..#./.#../.#../.#..',
  8: '.##./#..#/#..#/.##./#..#/#..#/.##.',
  9: '.##./#..#/#..#/.###/...#/...#/.##.',
  '.': './././././././#',
  ',': '../../../../../.#/.#/#.',
  '!': '#/#/#/#/#/./#',
  '?': '.##./#..#/...#/..#./.#../..../.#..',
  ':': './././#/././#',
  ';': '../../../.#/../../.#/#.',
  '-': '.../.../.../###',
  '—': '...../...../...../#####',
  '+': '.../.../.#./###/.#.',
  '/': '..#/..#/.#./.#./.#./#../#..',
  '(': '.#/#./#./#./#./#./.#',
  ')': '#./.#/.#/.#/.#/.#/#.',
  '[': '##/#./#./#./#./#./##',
  ']': '##/.#/.#/.#/.#/.#/##',
  "'": '#/#',
  '"': '#.#/#.#',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '*': '.../#.#/.#./#.#',
  '=': '.../.../###/.../###',
  '<': '.../..#/.#./#../.#./..#',
  '>': '.../#../.#./..#/.#./#..',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  '~': '...../...../...../.##.#/#.##.',
  '#': '...../.#.#./#####/.#.#./#####/.#.#.',
  '★': '..#../..#../#####/.###./.###./.#.#./#...#',
  '·': './././././#',
  '×': '.../.../#.#/.#./#.#',
  '…': '...../...../...../...../...../...../#.#.#',
  '|': '#/#/#/#/#/#/#',
  '_': '..../..../..../..../..../..../..../####',
  '^': '.#./#.#',
  '←': '...../..#../.#.../#####/.#.../..#..',
  '→': '...../..#../...#./#####/...#./..#..',
  '↑': '..#../.###./#.#.#/..#../..#../..#..',
  '↓': '..#../..#../..#../#.#.#/.###./..#..',
  '◀': '...#/..##/.###/####/.###/..##/...#',
  '▶': '#.../##../###./####/###./##../#...',
  '✓': '...../....#/...#./#.#../.#...',
  'é': '..#./.#../.##./#..#/####/#.../.###',
  'è': '.#../..#./.##./#..#/####/#.../.###',
  '–': '..../..../..../####',
};

const SPACE_W = 3;
export const LINE_H = 10;

const parsed = {};
for (const [ch, src] of Object.entries(GLYPHS)) {
  const rows = src.split('/');
  parsed[ch] = { rows, w: rows[0].length };
}

const TAGS = { g: '#ffd34a', r: '#ff5a4a', c: '#6ee8ff', p: '#d79bff', w: '#ffffff', m: '#8a8fb0' };

const cache = new Map();
function glyph(ch, color) {
  const key = ch + color;
  let c = cache.get(key);
  if (c) return c;
  const gph = parsed[ch] || parsed['?'];
  c = document.createElement('canvas');
  c.width = gph.w;
  c.height = 9;
  const g = c.getContext('2d');
  g.fillStyle = color;
  gph.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1);
  });
  cache.set(key, c);
  return c;
}

// Split a string into [{text, color|null}] runs using [x] tags.
function runs(str) {
  const out = [];
  let color = null, buf = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '[' && str[i + 2] === ']' && (TAGS[str[i + 1]] || str[i + 1] === '/')) {
      if (buf) out.push({ text: buf, color });
      buf = '';
      color = str[i + 1] === '/' ? null : TAGS[str[i + 1]];
      i += 2;
      continue;
    }
    buf += str[i];
  }
  if (buf) out.push({ text: buf, color });
  return out;
}

export function stripTags(str) { return runs(str).map((r) => r.text).join(''); }

// Raw glyph rows (for logo rasterizers). Unknown chars fall back to '?'.
export function glyphRows(ch) {
  if (ch === ' ') return { rows: ['...'], w: SPACE_W };
  return parsed[ch] || parsed['?'];
}

function charW(ch) {
  if (ch === ' ') return SPACE_W;
  return (parsed[ch] || parsed['?']).w;
}

// Small bounded caches (first in, first out): a game asks for the same few hundred strings every frame.
function bounded(map, max, key, value) {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, value);
  return value;
}

function measureRaw(str) {
  const s = stripTags(str);
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charW(s[i]) + (i < s.length - 1 ? 1 : 0);
  return w;
}
const widths = new Map();
export function measure(str, scale = 1) {
  let w = widths.get(str);
  if (w === undefined) w = bounded(widths, 4096, str, measureRaw(str));
  return w * scale;
}

const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
// Every pass of a string (outline, shadow, then the text), glyph by glyph, with its top-left at (x, y).
function drawPasses(g, str, x, y, color, o, scale, limit) {
  const parts = runs(str);
  const pass = (dx, dy, forced) => {
    let cx = x, n = 0;
    for (const r of parts) {
      const col = forced || r.color || color;
      for (const ch of r.text) {
        if (n++ >= limit) break;
        if (ch !== ' ') {
          const gc = glyph(ch, col);
          g.drawImage(gc, cx + dx * scale, y + dy * scale, gc.width * scale, gc.height * scale);
        }
        cx += (charW(ch) + 1) * scale;
      }
    }
  };
  if (o.outline) for (const [dx, dy] of OUTLINE) pass(dx, dy, o.outline);
  if (o.shadow) pass(1, 1, o.shadow);
  pass(0, 0, null);
}

// Whole strings, rendered once (outline and shadow included) and kept: one drawImage a string instead
// of one a glyph and pass. Glyph pixels are opaque, so the cached picture is pixel-identical; text
// drawn see-through, in another blend mode or in a colour with alpha takes the glyph path instead.
const strings = new Map();
const STRINGS_MAX = 1024;
const opaque = (c) => !c || (c.length === 7 && c[0] === '#');
function rendered(str, color, shadow, outline, scale) {
  const key = `${str}\u0001${color}\u0001${shadow}\u0001${outline}\u0001${scale}`;
  let c = strings.get(key);
  if (c !== undefined) return c;
  const w = measure(str, scale);
  if (w <= 0) return bounded(strings, STRINGS_MAX, key, null);
  const pad = outline ? scale : 0, padR = outline || shadow ? scale : 0;
  c = document.createElement('canvas');
  c.width = pad + w + padR; c.height = pad + 9 * scale + padR;
  const cg = c.getContext('2d');
  cg.imageSmoothingEnabled = false;
  drawPasses(cg, str, pad, pad, color, { shadow, outline }, scale, Infinity);
  c.pad = pad;
  return bounded(strings, STRINGS_MAX, key, c);
}

// Draw text. o: { shadow: hex, outline: hex, align: 'left'|'center'|'right', scale, limit }
// `limit` draws only the first N visible characters (typewriter effect).
export function text(g, str, x, y, color = '#ffffff', o = {}) {
  const scale = o.scale || 1;
  if (o.align === 'center') x -= Math.floor(measure(str, scale) / 2);
  else if (o.align === 'right') x -= measure(str, scale);
  x = Math.round(x); y = Math.round(y);
  const limit = o.limit ?? Infinity;
  if (limit === Infinity && g.globalAlpha === 1 && g.globalCompositeOperation === 'source-over' && (scale === 1 || !g.imageSmoothingEnabled)
    && opaque(color) && opaque(o.shadow) && opaque(o.outline)) {
    const c = rendered(str, color, o.shadow || '', o.outline || '', scale);
    if (c) g.drawImage(c, x - c.pad, y - c.pad);
    return x;
  }
  drawPasses(g, str, x, y, color, o, scale, limit);
  return x;
}

// Word-wrap into lines no wider than maxW (tags preserved). The lines come from a cache: read them,
// don't change them.
const wraps = new Map();
export function wrap(str, maxW) {
  const key = `${maxW}\u0001${str}`;
  let lines = wraps.get(key);
  if (!lines) lines = bounded(wraps, 256, key, Object.freeze(wrapRaw(str, maxW)));
  return lines;
}
function wrapRaw(str, maxW) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (measureRaw(test) > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  // carry an open color tag onto the next line
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const m = prev.match(/\[([grcpwm/])\](?!.*\[[grcpwm/]\])/);
    if (m && m[1] !== '/') lines[i] = `[${m[1]}]${lines[i]}`;
  }
  return lines;
}
