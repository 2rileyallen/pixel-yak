// game/sim.js — Yak Trail's rules: trotting, hopping, munching, checkpoints, falls and the summit.
// Pure and deterministic (no DOM, no Math.random, 60 steps a second), so dev/*.test.mjs can play it
// in Node. The scenes read a run's state and draw it; step() also lists what happened this tick in
// run.events ('hop', 'land', 'munch', 'checkpoint', 'fall', 'summit') for effects and sound.
import { GAP } from './level.js';

// Feel. Speeds in pixels per tick. A studio tuning panel can change these live (TUNE is shared).
export const TUNE = {
  trot: 1.6,      // top speed on the ground
  accel: 0.14,    // how fast it gets there
  brake: 0.22,    // how fast it stops when you let go
  air: 0.08,      // steering in the air
  hop: 4.6,       // take-off speed (≈ 42 px high)
  cut: 1.6,       // letting go of hop early caps the rise at this speed (short hops)
  gravity: 0.25,
  fall: 6,        // fastest fall
  coyote: 6,      // ticks you can still hop after walking off an edge
  buffer: 6,      // ticks a hop pressed just before landing is remembered
  munch: 24,      // ticks a munch takes (hop to cancel it)
};

const HALF = 9;   // half the yak's width, for walls
const FOOT = 6;   // half its footprint, for standing
const STEP = 3;   // a sudden rise taller than this is a wall (a rock, a ledge): it takes a hop
const STICK = 5;  // drops up to this many pixels keep it on the ground (slopes, small steps)
const SNAP = 8;   // a landing this far inside a slope still lands

export function newRun(level) {
  return {
    x: level.start.x, y: level.start.y, vx: 0, vy: 0, ground: true, face: 1,
    coyote: 0, buffer: 0, munch: 0, eaten: new Uint8Array(level.tufts.length), tufts: 0,
    check: -1, falls: 0, tick: 0, done: false, doneTick: 0, events: [],
  };
}

const colTop = (level, x) => (x < 0 || x >= level.width ? GAP : level.top[x | 0]);

// Where the yak stands at x (GAP when nothing is under it). Ground under its middle counts fully,
// ground further out a pixel less per pixel: so it stands in the middle of a slope, but can still
// stand half off a rock (and steps down off it smoothly).
export function floorAt(level, x) {
  let f = GAP;
  const cx = Math.round(x);
  for (let i = -FOOT; i <= FOOT; i++) { const t = colTop(level, cx + i); if (t !== GAP && t + Math.abs(i) < f) f = t + Math.abs(i); }
  return f;
}

// A wall: column c rises suddenly from the column before it (moving in direction s), and its top is
// above the yak's feet (by more than a stride when on the ground). Slopes never rise suddenly.
const wall = (level, c, s, y, ground) => {
  const t = colTop(level, c), before = colTop(level, c - s);
  return t !== GAP && t < before - STEP && t < y - (ground ? STEP : 0);
};

// One tick. input: { left, right, hop (pressed this tick), hopHeld }.
export function step(run, level, input = {}, T = TUNE) {
  const ev = run.events;
  ev.length = 0;
  if (run.done) { run.vx *= 0.8; return run; }
  run.tick++;

  // munching stands still (a hop cancels it)
  if (run.munch > 0) { if (input.hop) run.munch = 0; else run.munch--; }
  const eating = run.munch > 0;

  // trot
  const dir = eating ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) run.face = dir;
  const want = dir * T.trot, rate = !run.ground ? T.air : dir ? T.accel : T.brake;
  run.vx += Math.max(-rate, Math.min(rate, want - run.vx));

  // hop, with a little forgiveness both ways
  run.buffer = input.hop ? T.buffer : Math.max(0, run.buffer - 1);
  run.coyote = run.ground ? T.coyote : Math.max(0, run.coyote - 1);
  if (run.buffer > 0 && run.coyote > 0 && !eating) {
    run.vy = -T.hop; run.ground = false; run.coyote = 0; run.buffer = 0;
    ev.push('hop');
  }
  if (!input.hopHeld && run.vy < -T.cut) run.vy = -T.cut;
  run.vy = Math.min(T.fall, run.vy + T.gravity);

  // move across, stopping at walls taller than a stride
  const nx = Math.max(HALF, Math.min(level.width - HALF - 1, run.x + run.vx));
  if (run.vx) {
    const s = Math.sign(run.vx);
    const from = Math.round(run.x) + s * HALF, to = Math.round(nx) + s * HALF;
    let blocked = false;
    for (let c = from; c !== to + s; c += s) {
      if (wall(level, c, s, run.y, run.ground)) { blocked = true; run.x = c - s * (HALF + 1); break; }
    }
    if (blocked) run.vx = 0; else run.x = nx;
  } else run.x = nx;

  // move down (or up): land, stick to slopes, or fall
  const floor = floorAt(level, run.x);
  const ny = run.y + run.vy;
  if (run.ground && run.vy >= 0 && floor !== GAP && floor - run.y <= STICK) {
    run.y = floor; run.vy = 0; // trotting: follow the ground up and down
  } else if (run.vy >= 0 && floor !== GAP && ny >= floor && run.y <= floor + SNAP) {
    run.y = floor; run.vy = 0;
    if (!run.ground) ev.push('land');
    run.ground = true;
  } else {
    run.y = floor !== GAP && run.vy < 0 && ny > floor && ny - floor <= SNAP ? floor : ny; // rising along a slope
    run.ground = false;
  }

  // munch a tuft we trot onto
  if (run.ground && !eating) {
    level.tufts.forEach((t, i) => {
      if (!run.eaten[i] && Math.abs(t.x - run.x) < 6 && Math.abs(t.y - run.y) < 4) {
        run.eaten[i] = 1; run.tufts++; run.munch = T.munch; run.vx = 0;
        ev.push('munch');
      }
    });
  }

  // checkpoints
  for (let i = run.check + 1; i < level.cairns.length; i++) {
    if (level.cairns[i].x <= run.x) { run.check = i; ev.push('checkpoint'); }
  }

  // a fall goes back to the last cairn
  if (run.y > level.bottom) {
    const back = run.check >= 0 ? level.cairns[run.check] : level.start;
    Object.assign(run, { x: back.x, y: back.y, vx: 0, vy: 0, ground: true, munch: 0, falls: run.falls + 1 });
    ev.push('fall');
  }

  // the summit
  if (level.summit && run.ground && run.x >= level.summit.x) {
    run.done = true; run.doneTick = run.tick;
    ev.push('summit');
  }
  return run;
}

// Ticks → "1:23.4"
export function clock(ticks) {
  const t = Math.max(0, Math.floor(ticks / 6)); // tenths of a second
  const m = Math.floor(t / 600), s = Math.floor(t / 10) % 60, d = t % 10;
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}
