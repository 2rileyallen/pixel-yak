// follow-camera — a camera that follows a target through a dead zone, eases toward it, stays inside
// the level and lands on whole pixels (designs/systems/follow-camera/DESIGN.md).
// A system for engine/shell/systems.js. It reads nothing of the game by itself: the game passes in
// what to follow and how big the view and the level are, so it drops into any game unchanged.
//
//   import { followCamera } from './follow-camera/index.js';
//   export const SYSTEMS = [hero, followCamera({ target: (world) => world.state.hero, view: { w: 320, h: 180 }, bounds: (world) => ({ w: 2048, h: 180 }) })];
//   // drawing: const { px, py } = world.state.camera; g.drawImage(layer, -px, -py)

export function followCamera({
  id = 'camera',
  target,                      // (world) → { x, y }: the point to keep in view (the hero's anchor)
  view,                        // { w, h }: the screen in game pixels
  bounds = null,               // (world) → { x?, y?, w, h }: the level; the camera never shows past it
  deadzone = { w: 48, h: 32 }, // the target moves this freely around the centre before the camera follows
  ease = 0.15,                 // how much of the remaining distance the camera closes each step (0–1]
  lookAhead = 0,               // pixels ahead in the direction the target last moved (0 = off)
} = {}) {
  if (typeof target !== 'function') throw new Error('followCamera needs target: (world) => ({ x, y })');
  if (!view || !(view.w > 0) || !(view.h > 0)) throw new Error('followCamera needs view: { w, h }');
  const clamp = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

  function place(s, world, snap) {
    const t = target(world);
    if (!t) return;
    const dx = Math.sign(t.x - (s.lastX ?? t.x));
    if (dx) s.face = dx;
    s.lastX = t.x;
    const aimX = t.x + lookAhead * (s.face || 0);
    // centre of the view, moved only as far as needed to keep the aim inside the dead zone
    let cx = s.x + view.w / 2, cy = s.y + view.h / 2;
    const hx = deadzone.w / 2, hy = deadzone.h / 2;
    const wantX = aimX < cx - hx ? aimX + hx : aimX > cx + hx ? aimX - hx : cx;
    const wantY = t.y < cy - hy ? t.y + hy : t.y > cy + hy ? t.y - hy : cy;
    const k = snap ? 1 : Math.max(0.01, Math.min(1, ease));
    cx += (wantX - cx) * k;
    cy += (wantY - cy) * k;
    let x = cx - view.w / 2, y = cy - view.h / 2;
    const b = bounds ? bounds(world) : null;
    if (b) {
      x = clamp(x, b.x || 0, (b.x || 0) + b.w - view.w);
      y = clamp(y, b.y || 0, (b.y || 0) + b.h - view.h);
    }
    s.x = x; s.y = y;
    s.px = Math.round(x); s.py = Math.round(y); // draw at whole pixels: a fractional camera smears pixel art
  }

  return {
    id,
    version: 1,
    init(world) { const s = { x: 0, y: 0, px: 0, py: 0, face: 0, lastX: null }; place(s, world, true); return s; },
    step(s, tick) { place(s, tick.world, false); },
    save: (s) => ({ x: s.x, y: s.y, face: s.face }),
    load: (d) => ({ x: d.x, y: d.y, px: Math.round(d.x), py: Math.round(d.y), face: d.face || 0, lastX: null }),
    // Jump straight to the target (a new level, a respawn, a door): no easing across the map.
    snap(world) { place(world.state[id], world, true); },
  };
}
