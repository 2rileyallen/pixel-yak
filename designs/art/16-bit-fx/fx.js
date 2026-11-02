// designs/art/16-bit-fx/fx.js — PIXEL FX: the light and air of this look, drawn on the sprites' own
// pixel grid. One pass over a finished frame at native resolution (never upscaled first): the scene
// sinks to an ambient level, light pools add warm or cool colour back around their sources, emissive
// pixels stay at full strength and bleed a soft halo (bloom), haze lifts the far top of the picture,
// and the bottom edge falls into shadow. Colour here may be smooth (it's light, not a solid thing),
// but nothing is dithered and nothing strobes: a light breathes no faster than once every 1.5 s, and
// a whole light moves together, so no single pixel ever blinks on its own.
//
//   const keep = glowKeys(HEXRAMPS, GLOW);              // once, from the palette
//   pixelFx(g, W, H, { t, keep, lights: [{ x: 40, y: 60, r: 70, color: C(M.LWARM, 4) }] });
import { hexRgb } from '../../../engine/art/pix.js';

// The colours of every emissive ramp stop, so the pass can leave them unlit and let them glow.
export function glowKeys(hexramps, glow) {
  const keep = new Set();
  for (const id of glow) for (const hex of hexramps[id] || []) { const [r, g, b] = hexRgb(hex); keep.add((r << 16) | (g << 8) | b); }
  return keep;
}

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// o: { t (seconds), ambient 0..1, lights [{ x, y, r, color '#hex', power 1, breathe 0.08, period 2.6, phase }],
//      keep (glowKeys), haze { color '#hex', amount }, floor 0..1, vignette 0..1, bloom 0..1 }
export function pixelFx(g, w, h, o = {}) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const ambient = o.ambient ?? 0.42, t = o.t || 0, keep = o.keep || new Set();
  const lights = (o.lights || []).map((L) => {
    const period = Math.max(1.5, L.period || 2.6); // slow breath, never a strobe
    const k = (L.power ?? 1) * (1 + (L.breathe ?? 0.08) * Math.sin((t / period) * Math.PI * 2 + (L.phase || 0)));
    const [r, gg, b] = hexRgb(L.color || '#ffb062');
    return { x: L.x, y: L.y, r: L.r || 48, cr: (r / 255) * k, cg: (gg / 255) * k, cb: (b / 255) * k };
  });
  const haze = o.haze ? { rgb: hexRgb(o.haze.color || '#576181'), a: o.haze.amount ?? 0.12 } : null;
  const floor = o.floor ?? 0.35, vig = o.vignette ?? 0.2, bloomK = o.bloom ?? 0.35;
  // bloom: every emissive pixel spills a little of its colour onto its neighbours (radius 2)
  const glowBuf = bloomK ? new Float32Array(w * h * 3) : null;
  if (glowBuf) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (!d[k + 3] || !keep.has((d[k] << 16) | (d[k + 1] << 8) | d[k + 2])) continue;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const xx = x + i, yy = y + j;
        if ((!i && !j) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const f = bloomK * (Math.abs(i) + Math.abs(j) <= 1 ? 0.22 : 0.08) / 255;
        const q = (yy * w + xx) * 3;
        glowBuf[q] += d[k] * f; glowBuf[q + 1] += d[k + 1] * f; glowBuf[q + 2] += d[k + 2] * f;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const edge = 1 - floor * smooth(0.55, 1, y / h);
    const hz = haze ? haze.a * (1 - y / h) : 0;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (!d[k + 3]) continue;
      let r = d[k], gg = d[k + 1], b = d[k + 2];
      if (!keep.has((r << 16) | (gg << 8) | b)) {
        let lr = ambient, lg = ambient, lb = ambient;
        for (const L of lights) {
          const dx = x - L.x, dy = y - L.y, dd = dx * dx + dy * dy;
          if (dd >= L.r * L.r) continue;
          const f = 1 - Math.sqrt(dd) / L.r;
          lr += L.cr * f * f; lg += L.cg * f * f; lb += L.cb * f * f;
        }
        const cx = x / w - 0.5, cy = y / h - 0.5;
        const v = edge * (1 - vig * (cx * cx + cy * cy) * 2);
        r *= lr * v; gg *= lg * v; b *= lb * v;
      }
      if (glowBuf) { const q = (y * w + x) * 3; r += glowBuf[q] * 255; gg += glowBuf[q + 1] * 255; b += glowBuf[q + 2] * 255; }
      if (hz) { r += (haze.rgb[0] - r) * hz; gg += (haze.rgb[1] - gg) * hz; b += (haze.rgb[2] - b) * hz; }
      d[k] = r > 255 ? 255 : r; d[k + 1] = gg > 255 ? 255 : gg; d[k + 2] = b > 255 ? 255 : b;
    }
  }
  g.putImageData(img, 0, 0);
}
