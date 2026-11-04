// engine/shell/widgets.js — UI widgets drawn from the game's art (ui_* entries), never from code
// colours, so the user can repaint them in Pixel Yak: panels and menus (9-slice), progress bars,
// scrollbars and checkboxes. The default art is engine/art/widget-art.js (one line to register);
// a game may register its own entries with the same ids and poses instead.
//   const ui = createWidgets(sprite);
//   ui.panel(g, 40, 30, 120, 60);              // poses: panel · inset · focus (a selection reticle)
//   ui.bar(g, 8, 8, 60, 0.4);                  // 40% full
//   ui.scrollbar(g, 150, 34, 50, top, shown, total);
//   ui.checkbox(g, 46, 70, true);
// Cuts and tiles are cached per source canvas (engine/shell/nineslice.js), so a repainted widget
// rebuilds by itself.
import { nineSlice } from './nineslice.js';

// The corner size a source can afford: a third of its long side, at most half its short side.
const cornerOf = (src) => Math.max(1, Math.min(Math.floor(Math.max(src.width, src.height) / 3), Math.floor(Math.min(src.width, src.height) / 2)));

export function createWidgets(sprite, ids = {}) {
  const id = { panel: 'ui_panel', bar: 'ui_bar', scrollbar: 'ui_scrollbar', checkbox: 'ui_checkbox', ...ids };
  return {
    // Any-size box. pose: 'panel' (raised) · 'inset' (sunken) · 'focus' (corner brackets).
    panel(g, x, y, w, h, pose = 'panel') {
      const src = sprite(id.panel, pose);
      g.drawImage(nineSlice(src, w, h, cornerOf(src)), Math.round(x), Math.round(y));
    },
    // A bar w pixels long (its height is the art's), filled to k (0..1). `inset`: the frame's
    // thickness in pixels, so 0 < k < 1 fills only the inside.
    bar(g, x, y, w, k, { inset = 1 } = {}) {
      const empty = sprite(id.bar, 'empty'), full = sprite(id.bar, 'full');
      const h = empty.height, C = cornerOf(empty);
      x = Math.round(x); y = Math.round(y);
      g.drawImage(nineSlice(empty, w, h, C), x, y);
      k = Math.max(0, Math.min(1, Number(k) || 0));
      const fw = k <= 0 ? 0 : k >= 1 ? w : inset + Math.round(k * (w - 2 * inset));
      if (fw > 0) g.drawImage(nineSlice(full, w, h, C), 0, 0, fw, h, x, y, fw, h);
    },
    // A vertical scrollbar h pixels long for a list showing `shown` of `total` rows from row `first`.
    scrollbar(g, x, y, h, first, shown, total) {
      const track = sprite(id.scrollbar, 'track'), thumb = sprite(id.scrollbar, 'thumb');
      const w = track.width, C = cornerOf(track);
      x = Math.round(x); y = Math.round(y);
      g.drawImage(nineSlice(track, w, h, C), x, y);
      if (!(total > shown)) { g.drawImage(nineSlice(thumb, w, h, C), x, y); return; }
      const th = Math.max(2 * C, Math.round((h * shown) / total));
      const ty = Math.round(((h - th) * Math.max(0, Math.min(first, total - shown))) / (total - shown));
      g.drawImage(nineSlice(thumb, w, th, C), x, y + ty);
    },
    checkbox(g, x, y, on) {
      g.drawImage(sprite(id.checkbox, on ? 'on' : 'off'), Math.round(x), Math.round(y));
    },
  };
}
