// engine/link/moments.js — F9's "the last ~5 seconds": a small ring of frames taken from the game's
// canvas twice a second (only in a game launched from Pixel Yak; engine/link/studio.js loads it),
// turned into ONE picture when the user presses F9 — oldest frame top-left, newest bottom-right,
// each labelled with how long before F9 it was. An AI can look at it like any screenshot.
// Cost: one small drawImage every 500 ms into canvases made once.
import { text } from '../shell/font.js';

const FRAMES = 10, EVERY = 500, MAX_W = 320, COLS = 5;

// source: { gameCanvas() -> canvas, gameSize() -> { w, h } | null (the native resolution) }
export function startRecorder({ gameCanvas, gameSize }) {
  const ring = []; // { canvas, t }
  let next = 0, tw = 0, th = 0;

  function grab() {
    const src = gameCanvas();
    if (!src || !src.width || !src.height) return;
    // the frame at the game's own resolution (an integer step down from the canvas), at most MAX_W wide
    const native = gameSize();
    let w = native ? native.w : src.width / Math.max(1, Math.floor(src.width / MAX_W));
    let h = native ? native.h : src.height / Math.max(1, Math.floor(src.width / MAX_W));
    const k = Math.max(1, Math.ceil(w / MAX_W));
    w = Math.max(1, Math.floor(w / k)); h = Math.max(1, Math.floor(h / k));
    if (w !== tw || h !== th) { tw = w; th = h; ring.length = 0; next = 0; } // a new size starts a new ring
    let slot = ring[next];
    if (!slot) {
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      ring[next] = slot = { canvas: c, g: c.getContext('2d'), t: 0 };
      slot.g.imageSmoothingEnabled = false;
    }
    try {
      slot.g.drawImage(src, 0, 0, src.width, src.height, 0, 0, tw, th);
      slot.t = performance.now();
      next = (next + 1) % FRAMES;
    } catch { /* a canvas that can't be read (tainted, lost context): skip this frame */ }
  }
  setInterval(grab, EVERY);

  return {
    // { strip: PNG data URL | null, frames, seconds } — the ring as one labelled grid
    strip() {
      grab(); // the moment itself is the newest frame
      const shots = ring.filter((s) => s.t).sort((a, b) => a.t - b.t);
      if (!shots.length) return { strip: null, frames: 0, seconds: 0 };
      const now = shots[shots.length - 1].t;
      const s = tw < 200 ? 2 : 1; // small games are shown 2x so they read
      const cw = tw * s, ch = th * s, LABEL = 11, GAP = 4;
      const cols = Math.min(COLS, shots.length), rows = Math.ceil(shots.length / cols);
      const c = document.createElement('canvas');
      c.width = GAP + cols * (cw + 2 + GAP);
      c.height = 14 + rows * (LABEL + ch + 2 + GAP);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#06050d';
      g.fillRect(0, 0, c.width, c.height);
      const secs = ((now - shots[0].t) / 1000).toFixed(1);
      text(g, `The last ${secs} s before F9 — oldest first, left to right, then down`, GAP, 3, '#8a8fb0');
      shots.forEach((shot, i) => {
        const x = GAP + (i % cols) * (cw + 2 + GAP), y = 14 + Math.floor(i / cols) * (LABEL + ch + 2 + GAP);
        const ago = (now - shot.t) / 1000;
        text(g, i === shots.length - 1 ? 'F9' : `-${ago.toFixed(1)} s`, x, y + 1, i === shots.length - 1 ? '#ffd34a' : '#d4d8e8');
        g.fillStyle = '#3a3f5c';
        g.fillRect(x, y + LABEL, cw + 2, ch + 2);
        g.drawImage(shot.canvas, 0, 0, tw, th, x + 1, y + LABEL + 1, cw, ch);
      });
      return { strip: c.toDataURL('image/png'), frames: shots.length, seconds: Number(secs) };
    },
  };
}
