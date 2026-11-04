// follow-camera.test.mjs — the camera keeps its target in view, never shows past the level, lands on
// whole pixels, and saves and loads back. In a game this file lives in dev/systems/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, saveWorld, loadWorld } from '../../../engine/shell/systems.js';
import { followCamera } from './index.js';

const walker = { id: 'hero', version: 1, init: () => ({ x: 40, y: 100 }), step(s) { s.x += 1.5; } };
const camera = followCamera({ target: (w) => w.state.hero, view: { w: 320, h: 180 }, bounds: () => ({ w: 1000, h: 180 }) });
const SYSTEMS = [walker, camera];

test('it follows the target, stays in the level and lands on whole pixels', () => {
  const w = createWorld(SYSTEMS);
  for (let i = 0; i < 800; i++) { // the hero walks past the end of the 1000-px level
    stepWorld(SYSTEMS, w);
    const c = w.state.camera, h = w.state.hero;
    assert.ok(Number.isInteger(c.px) && Number.isInteger(c.py));
    assert.ok(c.x >= 0 && c.x <= 1000 - 320, `inside the level (x ${c.x})`);
    assert.ok(h.x >= c.x - 1 && h.x <= c.x + 320 + 1 || h.x > 1000, 'the hero stays on screen');
  }
  assert.equal(w.state.camera.x, 1000 - 320, 'at the end of the level it stops at the edge');
});

test('a save loads back to the same view', () => {
  const w = createWorld(SYSTEMS);
  for (let i = 0; i < 120; i++) stepWorld(SYSTEMS, w);
  const { world } = loadWorld(SYSTEMS, JSON.parse(JSON.stringify(saveWorld(SYSTEMS, w))));
  assert.equal(world.state.camera.px, w.state.camera.px);
  assert.equal(world.state.camera.py, w.state.camera.py);
});
