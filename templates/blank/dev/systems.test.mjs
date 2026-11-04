// dev/systems.test.mjs — {{NAME}}'s systems and saves as tests (engine/shell/systems.js): every system
// has the right shape, a world plays without a browser and the same way twice, a save loads back
// exactly, and every old save section in dev/saves/ still loads. Run: node --test "games/{{ID}}/dev/**/*.test.mjs"
//
// dev/saves/<system>@<version>.json is written the first time a system's version is seen (a played
// world's section — commit it). When a version goes up, the older file stays and must still load
// through the system's migrations: that is what keeps a 100-hour save alive through a rewrite.
// A better fixture: an F9 moment's save holds every system's section (requests/<R-id>-save.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkSystems, createWorld, stepWorld, saveWorld, loadWorld, describeLoad } from '../engine/shell/systems.js';
import { SYSTEMS } from '../game/systems/index.js';
import { tuneNow } from '../game/tune.js';

const SAVES = new URL('./saves/', import.meta.url);
const noInput = new Proxy({}, { get: () => () => false }); // every button up
function played(steps = 600) {
  const w = createWorld(SYSTEMS, { seed: 1 });
  for (let i = 0; i < steps; i++) stepWorld(SYSTEMS, w, { input: noInput, tune: tuneNow() });
  return w;
}
const json = (x) => JSON.parse(JSON.stringify(x));

test('every system has an id, a version and init', () => {
  checkSystems(SYSTEMS);
});

test('a world plays the same way twice (no randomness or clock inside a system)', () => {
  assert.deepEqual(json(saveWorld(SYSTEMS, played())), json(saveWorld(SYSTEMS, played())));
});

test('a save loads back exactly', () => {
  const w = played();
  const { world, report } = loadWorld(SYSTEMS, json(saveWorld(SYSTEMS, w)));
  assert.ok(world, describeLoad(report));
  assert.deepEqual(json(world.state), json(w.state));
  assert.ok(report.every((r) => r.status === 'ok'), describeLoad(report));
});

test('every old save section still loads (dev/saves/<system>@<version>.json)', () => {
  fs.mkdirSync(SAVES, { recursive: true });
  const now = saveWorld(SYSTEMS, played());
  for (const s of SYSTEMS) {
    const f = new URL(`${s.id}@${s.version}.json`, SAVES);
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(json(now.systems[s.id]), null, 1) + '\n');
  }
  for (const name of fs.readdirSync(SAVES).filter((n) => /@\d+\.json$/.test(n))) {
    const id = name.slice(0, name.lastIndexOf('@'));
    if (!SYSTEMS.some((s) => s.id === id)) continue; // a removed system: its old saves are kept, not loaded
    const sec = JSON.parse(fs.readFileSync(new URL(name, SAVES), 'utf8'));
    const { world, report } = loadWorld(SYSTEMS, { tick: 0, seed: 1, systems: { [id]: sec } });
    assert.ok(world, `${name} no longer loads: ${describeLoad(report)}`);
  }
});
