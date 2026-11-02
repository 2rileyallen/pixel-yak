// game/world.js — draws the mountain: sky, parallax ranges, clouds, the trail's ground, rocks, tufts,
// cairns, the summit, birds, little effects and the yak. Every picture comes from the art registry
// (sprites.js); nothing here picks a colour. The title screen and the play scene both use it.
import { GAP, zoneAt } from './level.js';
import { sprite, drawSprite, animPose, ART } from './sprites.js';
import { hash } from '../../../engine/shell/runtime.js';

export const W = 320, H = 180;
const ZONES = ['meadow', 'rocky', 'snow'];

export function createWorld(level) {
  let lo = GAP, hi = -GAP;
  for (const v of level.ground) if (v !== GAP) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const Y0 = lo - 16, Y1 = hi + 220; // the terrain picture covers these world rows

  // The ground, drawn once into one long picture: the fill tiled on the world grid under each column,
  // then the surface strip laid along the column's height (so slopes follow it). Rebuilt when the
  // user repaints a ground tile in Pixel Yak (the registry then hands out new canvases).
  let terrain = null, made = [];
  function terrainPicture() {
    const src = ZONES.flatMap((z) => [sprite('ground', z), sprite('ground_fill', z)]);
    if (terrain && src.every((c, i) => c === made[i])) return terrain;
    made = src;
    terrain = document.createElement('canvas');
    terrain.width = level.width; terrain.height = Y1 - Y0;
    const g = terrain.getContext('2d');
    g.imageSmoothingEnabled = false;
    const fills = Object.fromEntries(ZONES.map((z) => [z, g.createPattern(sprite('ground_fill', z), 'repeat')]));
    const ay = ART.ground.ay;
    for (let x = 0; x < level.width; x++) {
      const top = level.ground[x];
      if (top === GAP) continue;
      const z = zoneAt(level, x);
      g.fillStyle = fills[z];
      g.fillRect(x, top - Y0, 1, Y1 - top);
      g.drawImage(sprite('ground', z), x % 16, 0, 1, 16, x, top - Y0 - ay, 1, 16);
    }
    return terrain;
  }

  // ---------------------------------------------------------------- backdrop ---
  function backdrop(g, cam, tick) {
    const sky = sprite('sky', 'day');
    for (let x = 0; x < W; x += sky.width) g.drawImage(sky, x, 0);
    const rise = Math.max(0, -cam.y - 120); // how far we have climbed: the ranges sink a little
    tile(g, sprite('mountains_far', 'range'), -cam.x * 0.08, 52 + Math.round(rise * 0.05), true);
    clouds(g, cam, tick);
    tile(g, sprite('mountains_near', 'ridge'), -cam.x * 0.22, 74 + Math.round(rise * 0.1), true);
  }
  // A strip repeated across the screen; `down` repeats its last rows under it so no sky shows below.
  function tile(g, src, ox, y, down) {
    const x0 = (((Math.round(ox) % src.width) + src.width) % src.width) - src.width;
    for (let x = x0; x < W; x += src.width) {
      g.drawImage(src, x, y);
      if (down) for (let yy = y + src.height; yy < H; yy += 8) g.drawImage(src, 0, src.height - 8, src.width, 8, x, yy, src.width, 8);
    }
  }
  function clouds(g, cam, tick) {
    const span = W + 160;
    for (let i = 0; i < 4; i++) {
      const x = Math.round(((i * (span / 4) - cam.x * 0.12 - tick / 9) % span + span) % span) - 48;
      drawSprite(g, 'cloud', i % 2 ? 'b' : 'a', x + 24, 22 + ((i * 23) % 36) + Math.round(Math.max(0, -cam.y - 120) * 0.03));
    }
  }

  // ------------------------------------------------------------------- props ---
  const near = (x, cam, pad = 48) => x > cam.x - pad && x < cam.x + W + pad;
  function props(g, cam, tick, view) {
    const sx = (x) => Math.round(x - cam.x), sy = (y) => Math.round(y - cam.y);
    if (level.summit && near(level.summit.x, cam, 80)) drawSprite(g, 'summit', animPose('summit', 'wave', tick, 3), sx(level.summit.x + 24), sy(level.summit.y));
    level.cairns.forEach((c, i) => {
      if (!near(c.x, cam)) return;
      const pose = view.run && view.run.check >= i ? animPose('cairn', 'flag', tick + i * 5, 3) : 'plain';
      drawSprite(g, 'cairn', pose, sx(c.x), sy(c.y));
    });
    for (const r of level.rocks) if (near(r.x, cam)) drawSprite(g, 'rock', zoneAt(level, r.x) === 'snow' ? `${r.kind}_snow` : r.kind, sx(r.x), sy(r.y));
    level.tufts.forEach((t, i) => {
      if (!near(t.x, cam) || (view.run && view.run.eaten && view.run.eaten[i])) return;
      const anim = zoneAt(level, t.x) === 'snow' ? 'frost' : 'sway';
      drawSprite(g, 'tuft', animPose('tuft', anim, tick + i * 23, 3), sx(t.x), sy(t.y));
    });
  }

  function draw(g, cam, tick, view) {
    backdrop(g, cam, tick);
    g.drawImage(terrainPicture(), Math.round(cam.x), Math.round(cam.y - Y0), W, H, 0, 0, W, H);
    props(g, cam, tick, view);
    for (const b of view.birds || []) drawBird(g, cam, tick, b);
    if (view.run) drawYak(g, cam, view.run, view.pose);
    for (const p of view.particles || []) drawParticle(g, cam, p);
  }

  return { draw, Y0, Y1, terrainPicture };
}

// ------------------------------------------------------------------ the yak ---
// Which animation the yak shows for a run's state.
export function yakPose(run) {
  if (run.done) return animPose('yak', 'happy', run.tick, 4);
  if (run.munch > 0) return animPose('yak', 'munch', run.tick, 8);
  if (!run.ground) return run.vy < 0 ? 'hop' : 'fall';
  if (Math.abs(run.vx) > 0.15) return animPose('yak', 'walk', run.tick, Math.round(4 + Math.abs(run.vx) * 4));
  return animPose('yak', 'idle', run.tick, 4);
}
function drawYak(g, cam, run, pose) {
  drawSprite(g, 'yak', pose || yakPose(run), Math.round(run.x - cam.x), Math.round(run.y - cam.y), run.face < 0);
}

// ------------------------------------------------------------------- birds ---
// Birds peck until the yak trots within 56 px, then flap off up and away.
export const makeBirds = (level) => level.birds.map((b, i) => ({ x: b.x, y: b.y, i, flew: -1, dir: i % 2 ? 1 : -1 }));
export function updateBirds(birds, run, tick) {
  for (const b of birds) if (b.flew < 0 && Math.abs(run.x - b.x) < 56) { b.flew = tick; b.dir = run.x < b.x ? 1 : -1; }
}
function drawBird(g, cam, tick, b) {
  let x = b.x, y = b.y, pose;
  if (b.flew < 0) pose = animPose('bird', 'perch', tick + b.i * 17, 3);
  else {
    const t = tick - b.flew;
    x += b.dir * t * 1.4; y -= t * 0.9 + Math.floor(t / 20);
    pose = animPose('bird', 'fly', t, 12);
  }
  const X = Math.round(x - cam.x), Y = Math.round(y - cam.y);
  if (X > -16 && X < W + 16 && Y > -16) drawSprite(g, 'bird', pose, X, Y, b.dir < 0 && b.flew >= 0);
}

// ----------------------------------------------------------------- effects ---
// Little puffs and bits, stepped through their anim frames over their life (no per-pixel motion).
export function spawn(list, kind, x, y, n, tick) {
  for (let i = 0; i < n; i++) {
    const r = hash(tick, i, 7), s = hash(i, tick, 11);
    const e = { kind, x, y, vx: 0, vy: 0, grav: 0, age: 0, life: 18 };
    if (kind === 'leaf') Object.assign(e, { vx: (r - 0.5) * 1.6, vy: -0.8 - s, grav: 0.08, life: 26 });
    else if (kind === 'dust' || kind === 'snow') Object.assign(e, { x: x + (i - (n - 1) / 2) * 7, vx: (i - (n - 1) / 2) * 0.25, life: 16 });
    else if (kind === 'sparkle') Object.assign(e, { x: x + (r - 0.5) * 10, vy: -0.25 - s * 0.3, life: 30 });
    list.push(e);
  }
}
export function updateParticles(list) {
  for (const e of list) { e.age++; e.x += e.vx; e.y += e.vy; e.vy += e.grav; }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].age >= list[i].life) list.splice(i, 1);
}
function drawParticle(g, cam, e) {
  const frames = ART.fx.anims[e.kind];
  const pose = frames[Math.min(frames.length - 1, Math.floor((e.age / e.life) * frames.length))];
  drawSprite(g, 'fx', pose, Math.round(e.x - cam.x), Math.round(e.y - cam.y));
}
