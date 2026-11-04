// engine/shell/perf.js — a dev-only frame meter for any game on engine/shell: milliseconds a frame split by
// part, and a part's ms per count (e.g. the sim's ms per tick), in the pixel font. Off by default;
// a game turns it on with a dev key (e.g. F3) or ?perf=1 in the URL — never in its Help.
// While off every call is a no-op (no clock reads, nothing allocated).
//   const perf = createPerf();
//   let t = perf.begin(); drawTiles(); t = perf.lap('tiles', t); drawThings(); perf.lap('things', t);
//   perf.add('sim', ms, ticks);   // shown as ms per tick
//   perf.frame();                 // once a frame, after drawing: rolls the numbers
//   if (perf.on) layers.push({ canvas: perf.draw(), scale, x, y });
import { text } from './font.js';

export function createPerf({ on = false } = {}) {
  const parts = new Map(); // name → { ms, n (this frame), avg, per, max, peak, order }
  let order = 0, frames = 0;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let lines = [];
  const part = (name) => {
    let p = parts.get(name);
    if (!p) parts.set(name, (p = { ms: 0, n: 0, avg: 0, per: 0, max: 0, peak: 0, order: order++ }));
    return p;
  };
  const perf = {
    on,
    toggle() { perf.on = !perf.on; },
    // the parts listed first, in this order (the first one is the headline)
    declare(...names) { for (const n of names) part(n); return perf; },
    begin() { return perf.on ? performance.now() : 0; },
    // add the time since t to a part; returns now (so parts can be timed back to back)
    lap(name, t) {
      if (!perf.on) return 0;
      const now = performance.now();
      perf.add(name, now - t);
      return now;
    },
    end(name, t) { if (perf.on) perf.add(name, performance.now() - t); },
    add(name, ms, n = 0) { if (!perf.on) return; const p = part(name); p.ms += ms; p.n += n; },
    // Once a frame: a smoothed average and the worst of the last second per part.
    frame() {
      if (!perf.on) return;
      frames++;
      for (const p of parts.values()) {
        p.avg += (p.ms - p.avg) * 0.1;
        if (p.n) p.per += (p.ms / p.n - p.per) * 0.1;
        if (p.ms > p.peak) p.peak = p.ms;
        p.ms = 0; p.n = 0;
      }
      if (frames % 60 === 0) for (const p of parts.values()) { p.max = p.peak; p.peak = 0; }
      if (frames % 15 === 0) {
        lines = [...parts.entries()].sort((a, b) => a[1].order - b[1].order).map(([name, p]) =>
          [name, `${p.avg.toFixed(2)}`, p.per ? `${p.per.toFixed(3)}/tick` : `max ${p.max.toFixed(1)}`]);
      }
    },
    // The meter as a small pixel panel (its own canvas, drawn at 1×; the game scales it like its HUD).
    draw() {
      const W = 150, H = 12 + Math.max(1, lines.length) * 10;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#06050d'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5c6080'; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
      if (!lines.length) text(g, 'measuring…', 6, 6, '#8a8fb0');
      lines.forEach(([name, avg, extra], i) => {
        const y = 6 + i * 10;
        text(g, name, 6, y, i ? '#d4d8e8' : '#ffd34a');
        text(g, avg, 84, y, '#ffffff', { align: 'right' });
        text(g, extra, W - 6, y, '#8a8fb0', { align: 'right' });
      });
      return canvas;
    },
  };
  return perf;
}
