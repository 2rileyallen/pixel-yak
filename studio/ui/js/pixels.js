// studio/ui/js/pixels.js — the editor's pixel model. A frame is a Grid: Uint16Array of color
// indices into a ColorTable (0 = transparent). The table maps indices to legend values
// ([MATERIAL, shade] or '#rrggbb'), exactly the values core/art/edits.js stores, and those
// same functions decode/encode edit files — so the studio and the game agree on every pixel.

import {
  makePalette, refToHex, hexToRef, hexToRgb, rgbToHex, forEachEditPixel, fnv1a,
} from '../../../engine/art/edits.js';

export { makePalette };

export const refKey = (ref) => (ref == null ? '.' : typeof ref === 'string' ? ref.toLowerCase() : `${ref[0]}:${ref[1]}`);

export class ColorTable {
  constructor(pal) {
    this.pal = pal;
    this.refs = [null];
    this.keys = new Map([['.', 0]]);
    this.rgba = [[0, 0, 0, 0]];
  }
  idx(ref) {
    const k = refKey(ref);
    let i = this.keys.get(k);
    if (i === undefined) {
      i = this.refs.length;
      this.refs.push(typeof ref === 'string' ? ref.toLowerCase() : [ref[0], ref[1]]);
      this.keys.set(k, i);
      const hex = refToHex(ref, this.pal);
      this.rgba.push(hex ? [...hexToRgb(hex), 255] : [255, 0, 255, 255]);
    }
    return i;
  }
  ref(i) { return this.refs[i] ?? null; }
  hex(i) { return i ? refToHex(this.refs[i], this.pal) : null; }
  label(i) {
    const r = this.refs[i];
    if (r == null) return 'Transparent';
    return typeof r === 'string' ? r : `${r[0]} ${r[1]}`;
  }
}

export class Grid {
  constructor(w, h, data) { this.w = w; this.h = h; this.data = data || new Uint16Array(w * h); }
  clone() { return new Grid(this.w, this.h, new Uint16Array(this.data)); }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0; }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = v; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  equals(o) {
    if (!o || o.w !== this.w || o.h !== this.h) return false;
    const a = this.data, b = o.data;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  countDiff(o) {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== o.data[i]) n++;
    return n;
  }
  opaque() { let n = 0; for (const v of this.data) if (v) n++; return n; }
}

// RGBA bytes (from a host raw render) → Grid. Exact ramp colors become material refs.
export function gridFromRgba(w, h, rgba, table) {
  const g = new Grid(w, h);
  const memo = new Map();
  for (let i = 0, k = 0; i < w * h; i++, k += 4) {
    if (!rgba[k + 3]) continue;
    const key = (rgba[k] << 16) | (rgba[k + 1] << 8) | rgba[k + 2];
    let v = memo.get(key);
    if (v === undefined) { v = table.idx(hexToRef(rgbToHex(rgba[k], rgba[k + 1], rgba[k + 2]), table.pal)); memo.set(key, v); }
    g.data[i] = v;
  }
  return g;
}

// Re-index a grid from one ColorTable into another (by palette reference).
export function translateGrid(g, from, to) {
  if (!g || from === to) return g;
  const memo = new Map([[0, 0]]);
  const out = new Grid(g.w, g.h);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    let t = memo.get(v);
    if (t === undefined) { t = to.idx(from.ref(v)); memo.set(v, t); }
    out.data[i] = t;
  }
  return out;
}

// Same fingerprint the game computes with canvasHash() (core/art/edits.js).
export const rgbaHash = (w, h, rgba) => `${w}x${h}:${fnv1a(rgba)}`;

// Apply one pose entry of an edit file onto a grid (patch onto the raw grid, or a baked grid).
export function applyPoseEdit(base, pe, legend, table) {
  const g = pe.mode === 'baked' ? new Grid(base.w, base.h) : base.clone();
  forEachEditPixel(pe, legend || {}, (x, y, ref) => g.set(x, y, ref == null ? 0 : table.idx(ref)));
  return g;
}

export function gridToRefs(g, table) {
  const out = new Array(g.w * g.h);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] ? table.ref(g.data[i]) : null;
  return out;
}

export function gridToImageData(g, table, alpha = 255) {
  const img = new ImageData(g.w, g.h);
  const d = img.data;
  for (let i = 0, k = 0; i < g.data.length; i++, k += 4) {
    const v = g.data[i];
    if (!v) continue;
    const c = table.rgba[v];
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = alpha === 255 ? c[3] : alpha;
  }
  return img;
}

// Grid → small canvas at scale 1 (thumbnails, previews, onion skins).
export function gridCanvas(g, table, into = null) {
  const c = into || document.createElement('canvas');
  if (c.width !== g.w || c.height !== g.h) { c.width = g.w; c.height = g.h; }
  c.getContext('2d').putImageData(gridToImageData(g, table), 0, 0);
  return c;
}

// Draw a grid scaled to fit a box (integer zoom, centered), for thumbnails.
export function drawThumb(canvas, g, table, { box = 40, bg = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const z = Math.max(1, Math.floor(Math.min(box / g.w, box / g.h) * dpr)) || 1;
  const size = Math.round(box * dpr);
  canvas.width = size; canvas.height = size;
  canvas.style.width = `${box}px`; canvas.style.height = `${box}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); } else ctx.clearRect(0, 0, size, size);
  const src = gridCanvas(g, table);
  let zz = z;
  if (g.w * zz > size || g.h * zz > size) zz = Math.min(size / g.w, size / g.h); // big art: shrink
  const w = Math.round(g.w * zz), h = Math.round(g.h * zz);
  ctx.drawImage(src, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
}

// Distinct colors used by a set of grids, most used first.
export function usedColors(grids) {
  const counts = new Map();
  for (const g of grids) if (g) for (const v of g.data) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
