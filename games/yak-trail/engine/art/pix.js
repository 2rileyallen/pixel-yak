// engine/art/pix.js — pixel sprite authoring, shared by every game in this repo.
// Original code, written for Pixel Yak.
//
// You never paint RGB. You paint MATERIAL (palette ramp id) + SHADE (0 dark … 4 light)
// per pixel, grouped into LAYERS (body parts). finish() then:
//   1. darkens pixels touching a layer drawn in front of them (contact crease),
//   2. brightens edges that face the light (rim),
//   3. maps material+shade through the palette ramps,
//   4. wraps the silhouette in a 1px outline.
// Swapping a palette or restyling outlines restyles every sprite at once.

// Light comes from the top-left, slightly toward the viewer.
const LX = -0.49, LY = -0.67, LZ = 0.55;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// Map a lighting value v in [0,1] to a shade index.
function quantize(v, min = 1, max = 4) {
  const s = v < 0.3 ? 1 : v < 0.55 ? 2 : v < 0.84 ? 3 : 4;
  return Math.max(min, Math.min(max, s));
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.mat = new Uint8Array(w * h);
    this.sh = new Uint8Array(w * h);
    this.prt = new Uint8Array(w * h);
    this.part = 1;
    this.opts = [null, {}];
  }

  // Start a new layer. Later layers are "in front" for crease purposes.
  // opts: { cast: false } → doesn't darken what's behind it
  //       { recv: false } → never darkened by layers in front
  layer(opts = {}) {
    this.part = Math.min(255, this.part + 1);
    this.opts[this.part] = opts;
    return this;
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  idx(x, y) { return y * this.w + x; }
  matAt(x, y) { return this.inside(x, y) ? this.mat[this.idx(x, y)] : 0; }
  shadeAt(x, y) { return this.inside(x, y) ? this.sh[this.idx(x, y)] : 0; }

  set(x, y, m, s = 2) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    if (!m) { this.mat[i] = 0; this.prt[i] = 0; return; }
    this.mat[i] = m;
    this.sh[i] = s < 0 ? 0 : s > 4 ? 4 : s;
    this.prt[i] = this.part;
  }

  // Change shade only where something is already painted (optionally one material).
  tint(x, y, delta, onlyMat = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    if (!this.mat[i] || (onlyMat && this.mat[i] !== onlyMat)) return;
    this.sh[i] = Math.max(0, Math.min(4, this.sh[i] + delta));
  }

  erase(x, y) { this.set(x, y, 0); }

  rect(x, y, w, h, m, s = 2) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, m, s);
    return this;
  }

  shadeRect(x, y, w, h, delta, onlyMat = 0) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.tint(x + i, y + j, delta, onlyMat);
    return this;
  }

  line(x0, y0, x1, y1, m, s = 2) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, m, s);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  // Flat filled ellipse. Centers may be .5 for even-width shapes.
  oval(cx, cy, rx, ry, m, s = 2) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) this.set(x, y, m, s);
      }
    }
    return this;
  }

  // Volumetric ellipse, shaded as a lit ball.
  // o: { bias (+lighter/-darker), min, max, flat (0..1 squashes the normal → flatter) }
  ball(cx, cy, rx, ry, m, o = {}) {
    const bias = o.bias || 0, flat = o.flat || 0;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        let nx = u, ny = v, nz = Math.sqrt(1 - d);
        if (flat) { nx *= 1 - flat; ny *= 1 - flat; nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); }
        const lit = (nx * LX + ny * LY + nz * LZ) * 0.5 + 0.5 + bias;
        this.set(x, y, m, quantize(lit, o.min ?? 1, o.max ?? 4));
      }
    }
    return this;
  }

  // Tapered capsule (limbs, tails, horns) shaded as a lit cylinder.
  limb(x0, y0, x1, y1, r0, r1, m, o = {}) {
    const bias = o.bias || 0;
    const minX = Math.floor(Math.min(x0 - r0, x1 - r1)) - 1, maxX = Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1;
    const minY = Math.floor(Math.min(y0 - r0, y1 - r1)) - 1, maxY = Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1;
    const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - x0) * vx + (py - y0) * vy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = x0 + vx * t, cy = y0 + vy * t;
        const r = r0 + (r1 - r0) * t;
        const ox = px - cx, oy = py - cy;
        const dd = (ox * ox + oy * oy) / (r * r);
        if (dd > 1) continue;
        const nz = Math.sqrt(1 - dd);
        const lit = ((ox / r) * LX + (oy / r) * LY + nz * LZ) * 0.5 + 0.5 + bias;
        this.set(x, y, m, quantize(lit, o.min ?? 1, o.max ?? 4));
      }
    }
    return this;
  }

  // Filled polygon (pixel centers, even-odd). pts = [[x,y], ...]
  poly(pts, m, s = 2) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, m, s);
      }
    }
    return this;
  }

  // ASCII template. legend: { 'a': [mat, shade], ... }; '.' and ' ' are transparent.
  // A legend value of [0] erases. flip mirrors the template horizontally.
  stamp(rows, legend, x, y, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[flip ? row.length - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        const e = legend[ch];
        if (!e) continue;
        this.set(x + i, y + j, e[0], e[1] ?? 2);
      }
    }
    return this;
  }

  // Copy another Pix's paint into this one (as the current layer).
  paste(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      if (src.mat[i]) this.set(dx + x, dy + y, src.mat[i], src.sh[i]);
    }
    return this;
  }

  // Run fn(x, y, mat, shade) → [mat, shade] | null over every painted pixel.
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y);
      if (!this.mat[i]) continue;
      const r = fn(x, y, this.mat[i], this.sh[i]);
      if (r) { this.mat[i] = r[0]; this.sh[i] = Math.max(0, Math.min(4, r[1])); }
    }
    return this;
  }

  // Resolve to a canvas.
  // o: { ramps (required), outline: '#hex' | 'self' | null, rim: 'top'|'tl'|false,
  //      crease: bool, glow: Set of emissive material ids, flip: bool }
  finish(o) {
    const { w, h, mat, sh, prt, opts } = this;
    const ramps = o.ramps;
    const glow = o.glow || NO_GLOW;
    const rim = o.rim === undefined ? 'top' : o.rim;
    const crease = o.crease !== false;
    const outline = o.outline === undefined ? '#0c1024' : o.outline;
    const flip = !!o.flip;

    const out = new Uint8Array(w * h); // final shade per pixel
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, m = mat[i];
        if (!m) continue;
        let s = sh[i];
        if (!glow.has(m)) {
          if (rim && s > 0) {
            const up = y > 0 ? mat[i - w] : 0;
            const left = x > 0 ? mat[i - 1] : 0;
            if (!up || (rim === 'tl' && !left)) s = Math.min(4, s + 1);
          }
          if (crease && (opts[prt[i]] || {}).recv !== false) {
            const p = prt[i];
            const front = (j) => mat[j] && prt[j] > p && (opts[prt[j]] || {}).cast !== false && !glow.has(mat[j]);
            if ((x > 0 && front(i - 1)) || (x < w - 1 && front(i + 1)) || (y > 0 && front(i - w)) || (y < h - 1 && front(i + w))) {
              s = Math.max(0, s - 1);
            }
          }
        }
        out[i] = s;
      }
    }

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    const put = (x, y, rgb, a = 255) => {
      const k = ((y * w) + (flip ? w - 1 - x : x)) * 4;
      d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = a;
    };
    const ink = outline && outline !== 'self' ? hexRgb(outline) : null;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, m = mat[i];
        if (m) {
          const ramp = ramps[m];
          if (!ramp) throw new Error(`Pix.finish: no ramp for material ${m}`);
          put(x, y, ramp[out[i]]);
        } else if (outline) {
          // 4-neighbour outline
          let nm = 0;
          if (x > 0 && mat[i - 1]) nm = mat[i - 1];
          else if (x < w - 1 && mat[i + 1]) nm = mat[i + 1];
          else if (y > 0 && mat[i - w]) nm = mat[i - w];
          else if (y < h - 1 && mat[i + w]) nm = mat[i + w];
          if (nm) put(x, y, ink || ramps[nm][0]);
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

const NO_GLOW = new Set();

const hexCache = new Map();
export function hexRgb(hex) {
  let v = hexCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(hex, v);
  }
  return v;
}

// Make a canvas of a given size and hand back its context with smoothing off.
export function blank(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// Mirror a finished canvas horizontally.
export function flipCanvas(src) {
  const [c, g] = blank(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// Recolor a finished canvas: every pixel whose RGB matches a key in `swap` (hex→hex).
export function recolor(src, swap) {
  const [c, g] = blank(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const table = new Map(Object.entries(swap).map(([a, b]) => [hexRgb(a).join(','), hexRgb(b)]));
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3]) continue;
    const to = table.get(`${d[k]},${d[k + 1]},${d[k + 2]}`);
    if (to) { d[k] = to[0]; d[k + 1] = to[1]; d[k + 2] = to[2]; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Solid silhouette of a canvas in one color (hit flashes, shadows).
export function silhouette(src, hex, alpha = 255) {
  const [c, g] = blank(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data, rgb = hexRgb(hex);
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3]) continue;
    d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}
