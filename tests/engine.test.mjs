// tests/engine.test.mjs — the engine games build on: the frozen functions (their output can never
// change: maps, art and music are rebuilt from them), saves (versions, migrations, nothing lost),
// and systems (per-system save versions). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, rng } from '../engine/shell/runtime.js';
import { bayer } from '../engine/art/pix.js';
import { mulberry32 } from '../engine/sound/synth.js';
import { createWorld, stepWorld, saveWorld, loadWorld, describeLoad } from '../engine/shell/systems.js';

// A localStorage for Node, so slotStore and openSlots (which falls back to it without IndexedDB) run.
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('frozen: hash, rng, bayer and mulberry32 give the same numbers as ever (README.md → Frozen)', () => {
  assert.deepEqual([[0, 0, 0], [1, 2, 3], [-5, 7, 41], [1000, -3, 9]].map(([x, y, s]) => hash(x, y, s)),
    [0, 0.264700623229146, 0.04394415207207203, 0.33389856689609587]);
  const g = rng(42);
  assert.deepEqual([g(), g(), g(), g.int(100), g.int(100)], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 66, 17]);
  const b = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) b.push(bayer(x, y));
  assert.deepEqual(b, [0.03125, 0.53125, 0.15625, 0.65625, 0.78125, 0.28125, 0.90625, 0.40625, 0.21875, 0.71875, 0.09375, 0.59375, 0.96875, 0.46875, 0.84375, 0.34375]);
  const m = mulberry32(7);
  assert.deepEqual([m(), m(), m()], [0.011704753153026104, 0.06195825757458806, 0.97690763277933]);
});

test('slotStore: migrations bring an old save forward one version at a time', async () => {
  globalThis.localStorage = fakeStorage();
  const { slotStore } = await import('../engine/shell/saves.js');
  slotStore('g1', { version: 1 }).write(1, { gold: 5 });
  const v3 = slotStore('g1', { version: 3, migrations: { 1: (s) => ({ ...s, gems: 0 }), 2: (s) => ({ ...s, gold: s.gold * 10 }) } });
  const d = v3.read(1);
  assert.equal(d.v, 3);
  assert.equal(d.gold, 50);
  assert.equal(d.gems, 0);
});

test('slotStore: a save it cannot read is kept aside before a write goes over it', async () => {
  globalThis.localStorage = fakeStorage();
  const { slotStore } = await import('../engine/shell/saves.js');
  slotStore('g2', { version: 5 }).write(1, { gold: 9 });
  const old = slotStore('g2', { version: 2 }); // an older build meets a newer save
  assert.equal(old.read(1), null);
  assert.equal(old.write(1, { gold: 1 }), true);
  assert.equal(JSON.parse(old.kept(1)).gold, 9, 'the newer save survives in kept()');
  const exported = old.exportSlot(1);
  const fresh = slotStore('g2', { version: 2 });
  fresh.erase(1);
  assert.deepEqual(fresh.importSlot(1, exported), { ok: true });
  assert.equal(fresh.read(1).gold, 1);
  assert.equal(fresh.importSlot(1, '{"v":9}').ok, false, 'a save from a newer build is refused, not imported');
});

test('openSlots: migrations, and an unreadable record is kept the moment it fails to load', async () => {
  globalThis.localStorage = fakeStorage();
  const { openSlots } = await import('../engine/shell/saves.js');
  const a = await openSlots('g3', { version: 1, legacy: false });
  assert.equal(await a.write(1, { gold: 2 }), true);
  const b = await openSlots('g3', { version: 2, legacy: false, migrations: { 1: (s) => ({ ...s, gold: s.gold + 1 }) } });
  const r = await b.load(1);
  assert.equal(r.data.gold, 3);
  assert.equal(r.backup, false);
  await b.write(1, { gold: 7 }); // a version-2 save; the version-1 one is now its backup
  const c2 = await openSlots('g3', { version: 1, legacy: false }); // an older build opens it
  const rc = await c2.load(1);
  assert.equal(rc.backup, true, 'falls back to the version-1 backup');
  const kept = await c2.kept(1);
  assert.ok(kept.some((raw) => JSON.parse(raw).gold === 7), 'the version-2 save is kept aside');
  assert.ok(typeof (await c2.exportSlot(1)) === 'string');
});

const counter = { id: 'counter', version: 1, init: () => ({ n: 0 }), step(s, t) { s.n++; if (s.n % 5 === 0) t.emit('five', { n: s.n }); } };
const bank = { id: 'bank', version: 2, init: () => ({ coins: 0, gems: 0 }), step(s, t) { for (const e of t.events) if (e.type === 'five') s.coins++; },
  migrations: { 1: (d) => ({ ...d, gems: 0 }) } };

test('systems: a world steps, saves and loads back exactly; events pass between systems', () => {
  const w = createWorld([counter, bank], { seed: 3 });
  for (let i = 0; i < 20; i++) stepWorld([counter, bank], w);
  assert.equal(w.state.counter.n, 20);
  assert.equal(w.state.bank.coins, 4);
  const saved = JSON.parse(JSON.stringify(saveWorld([counter, bank], w)));
  const { world, report } = loadWorld([counter, bank], saved);
  assert.deepEqual(world.state, w.state);
  assert.equal(world.tick, 20);
  assert.ok(report.every((r) => r.status === 'ok'), describeLoad(report));
});

test('systems: one system migrates, a new one starts fresh, a removed one is kept, a newer save fails', () => {
  const saved = { tick: 7, seed: 1, systems: { bank: { v: 1, data: { coins: 3 } }, old: { v: 4, data: { x: 1 } } } };
  const { world, report } = loadWorld([counter, bank], saved);
  const by = Object.fromEntries(report.map((r) => [r.id, r.status]));
  assert.deepEqual(by, { counter: 'new', bank: 'migrated', old: 'dropped' });
  assert.deepEqual(world.state.bank, { coins: 3, gems: 0 });
  assert.deepEqual(saveWorld([counter, bank], world).systems.old, { v: 4, data: { x: 1 } }, 'a dropped system survives the next save');
  const newer = loadWorld([counter, bank], { systems: { bank: { v: 9, data: {} } } });
  assert.equal(newer.world, null, 'never a world from a save this build cannot read');
  const tooOld = loadWorld([counter, { ...bank, migrations: {} }], { systems: { bank: { v: 1, data: {} } } });
  assert.equal(tooOld.world, null);
  const allowed = loadWorld([counter, { ...bank, migrations: {}, resetBelow: 2 }], { systems: { bank: { v: 1, data: { coins: 9 } } } });
  assert.equal(allowed.report.find((r) => r.id === 'bank').status, 'reset');
  assert.deepEqual(allowed.world.state.bank, { coins: 0, gems: 0 });
});
