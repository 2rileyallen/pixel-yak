// dev/sim.test.mjs — Yak Trail's rules as tests (node:test), played on the real trail in Node.
// Run: node --test "games/yak-trail/dev/**/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel, GAP, COURSE } from '../game/level.js';
import { newRun, step, floorAt, clock, TUNE } from '../game/sim.js';

const level = buildLevel();
const RIGHT = { right: true };

// Hold the given input for n ticks (a function gets the run and returns the input).
function play(run, n, input = RIGHT) {
  for (let i = 0; i < n && !run.done; i++) step(run, level, typeof input === 'function' ? input(run) : input);
  return run;
}
const at = (x) => Object.assign(newRun(level), { x, y: floorAt(level, x) });

test('the trail builds: it climbs, has tufts, rocks, cairns and a summit on the ground', () => {
  assert.ok(level.width > 3000, 'long enough for a minute or two');
  assert.ok(level.summit && level.summit.y < level.start.y - 300, 'the summit is well above the start');
  assert.ok(level.tufts.length >= 10 && level.rocks.length >= 8 && level.cairns.length >= 3);
  assert.notEqual(level.ground[Math.round(level.summit.x)], GAP);
  for (const t of level.tufts) assert.equal(level.ground[t.x], t.y, `tuft at ${t.x} sits on the ground`);
});

test('→ trots right up to top speed; letting go stops it', () => {
  const run = play(newRun(level), 30);
  assert.ok(run.x > level.start.x + 20);
  assert.ok(Math.abs(run.vx - TUNE.trot) < 1e-9);
  play(run, 30, {});
  assert.equal(run.vx, 0);
});

test('slopes are trotted, not hopped: holding → climbs the first slope', () => {
  const slope = level.ground.findIndex((y, x) => x > 400 && y < 0); // the first rise
  const run = play(at(slope - 30), 60);
  assert.ok(run.x > slope + 40, `got past the slope (x ${run.x.toFixed(1)})`);
  assert.equal(run.falls, 0);
});

test('a rock stops a trot; a hop clears it', () => {
  const rock = level.rocks[0];
  const run = play(at(rock.x - 40), 60);
  assert.ok(run.x < rock.x - rock.w / 2, 'stopped in front of the rock');
  assert.equal(run.vx, 0);
  let t = 0;
  play(run, 80, () => ({ right: true, hop: t++ === 0, hopHeld: true }));
  assert.ok(run.x > rock.x + rock.w / 2, 'over it');
  assert.ok(run.ground);
});

test('a short tap hops lower than a held hop', () => {
  const height = (held) => {
    const run = newRun(level);
    const y0 = run.y;
    let top = y0;
    for (let t = 0; t < 60; t++) { step(run, level, { hop: t === 0, hopHeld: held || t < 2 }); top = Math.min(top, run.y); }
    return y0 - top;
  };
  assert.ok(height(true) > 35, `a held hop is tall (${height(true).toFixed(1)} px)`);
  assert.ok(height(false) < height(true) - 15, 'a tap is clearly shorter');
});

test('trotting onto a tuft munches it: counted, and the yak stops to chew', () => {
  const tuft = level.tufts[0];
  const run = at(tuft.x - 30);
  for (let i = 0; i < 60 && !run.events.includes('munch'); i++) step(run, level, RIGHT);
  assert.ok(run.events.includes('munch'));
  assert.equal(run.tufts, 1);
  assert.equal(run.eaten[0], 1);
  const x = run.x;
  play(run, TUNE.munch - 2);
  assert.equal(run.x, x, 'stands still while munching');
  play(run, 10);
  assert.ok(run.x > x, 'then trots on');
});

test('hopping over a tuft skips it', () => {
  const tuft = level.tufts[0];
  const run = play(at(tuft.x - 26), 1);
  let t = 0;
  play(run, 70, () => ({ right: true, hop: t++ === 6, hopHeld: true }));
  assert.ok(run.x > tuft.x + 10);
  assert.equal(run.tufts, 0);
});

test('a fall into a gap goes back to the last cairn passed, and counts', () => {
  // the first gap after the first cairn with clear, level ground in front of it
  const gapX = level.ground.findIndex((y, x) => x > level.cairns[0].x && y === GAP && level.ground[x - 1] !== GAP
    && level.top.slice(x - 60, x).every((t) => t === level.top[x - 1]));
  assert.ok(gapX > 0, "there is such a gap");
  const run = at(gapX - 60);
  run.check = 0; // the first cairn is behind us
  for (let i = 0; i < 240 && !run.events.includes('fall'); i++) step(run, level, RIGHT); // trot straight in
  assert.equal(run.falls, 1);
  assert.equal(run.x, level.cairns[0].x);
  assert.ok(run.ground);
});

test('passing a cairn makes it the checkpoint', () => {
  const c = level.cairns[0];
  const run = at(c.x - 20);
  play(run, 30);
  assert.equal(run.check, 0);
});

test('reaching the summit finishes the run and stops the clock', () => {
  const run = at(level.summit.x - 60);
  play(run, 120);
  assert.ok(run.done);
  const t = run.doneTick;
  play(run, 30);
  assert.equal(run.doneTick, t);
});

test('the whole trail can be climbed (a simple player: hold →, hop at walls and gaps)', () => {
  const run = newRun(level);
  let hold = 0;
  play(run, 60 * 180, (r) => {
    let gap = false;
    for (let d = 10; d < 17; d++) if (level.top[Math.round(r.x) + d] === GAP) gap = true;
    const hop = r.ground && hold === 0 && (gap || (r.vx === 0 && r.munch === 0 && r.tick > 2));
    if (hop) hold = 24;
    if (hold) hold--;
    return { right: true, hop, hopHeld: hold > 0 };
  });
  assert.ok(run.done, `stuck at x ${Math.round(run.x)}`);
  assert.equal(run.falls, 0);
  assert.equal(run.tufts, level.tufts.length, 'trotting the whole way munches every tuft');
});

test('the sim is deterministic: the same inputs give the same run', () => {
  const go = () => play(newRun(level), 900, (r) => ({ right: true, hop: r.tick % 50 === 0, hopHeld: r.tick % 50 < 20 }));
  const a = go(), b = go();
  assert.deepEqual({ ...a, events: [] }, { ...b, events: [] });
});

test('every course step is one the builder knows', () => {
  const known = new Set(['zone', 'flat', 'slope', 'ledge', 'gap', 'rock', 'tuft', 'bird', 'cairn', 'summit']);
  for (const [kind] of COURSE) assert.ok(known.has(kind), kind);
});

test('the clock reads minutes, seconds and tenths', () => {
  assert.equal(clock(0), '0:00.0');
  assert.equal(clock(60 * 83 + 30), '1:23.5');
});
