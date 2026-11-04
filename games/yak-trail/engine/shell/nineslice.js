// engine/shell/nineslice.js — any-size panels cut from a small pixel-art source (9-slice): corners
// are copied, edges and the middle repeat (tiled, never stretched, so pixel patterns stay crisp).
// Results are cached per source canvas, so a source repainted in Pixel Yak (a new canvas from
// the art registry) rebuilds by itself.
//   g.drawImage(nineSlice(sprite('ui_frame', 'panel'), 120, 40), x, y);

const built = new WeakMap(); // source canvas → Map("w|h|c" → canvas)

export function nineSlice(src, w, h, corner = 8) {
  const C = corner;
  w = Math.max(2 * C, Math.round(w)); h = Math.max(2 * C, Math.round(h));
  let m = built.get(src);
  if (!m) built.set(src, (m = new Map()));
  const key = `${w}|${h}|${C}`;
  let c = m.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const SW = src.width, SH = src.height, MW = SW - 2 * C, MH = SH - 2 * C;
  const tile = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    for (let y = 0; y < dh; y += sh) for (let x = 0; x < dw; x += sw) {
      const cw = Math.min(sw, dw - x), ch = Math.min(sh, dh - y);
      g.drawImage(src, sx, sy, cw, ch, dx + x, dy + y, cw, ch);
    }
  };
  tile(C, C, MW, MH, C, C, w - 2 * C, h - 2 * C);       // middle
  tile(C, 0, MW, C, C, 0, w - 2 * C, C);                // top
  tile(C, SH - C, MW, C, C, h - C, w - 2 * C, C);       // bottom
  tile(0, C, C, MH, 0, C, C, h - 2 * C);                // left
  tile(SW - C, C, C, MH, w - C, C, C, h - 2 * C);       // right
  g.drawImage(src, 0, 0, C, C, 0, 0, C, C);
  g.drawImage(src, SW - C, 0, C, C, w - C, 0, C, C);
  g.drawImage(src, 0, SH - C, C, C, 0, h - C, C, C);
  g.drawImage(src, SW - C, SH - C, C, C, w - C, h - C, C, C);
  m.set(key, c);
  return c;
}
