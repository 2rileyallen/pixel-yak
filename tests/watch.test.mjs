// tests/watch.test.mjs — the studio's safety-net sweep scales with the games that are open: a game in
// focus is swept in full, every other game only shallowly (its folder and requests/), and a file
// that simply wasn't swept is never reported as deleted. History and generated output are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWatcher } from '../studio/main/watch.mjs';

test('the sweep goes deep only into focused games', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yak-watch-'));
  const w8 = (f, t = 'x') => fs.mkdir(path.dirname(path.join(root, f)), { recursive: true }).then(() => fs.writeFile(path.join(root, f), t));
  for (const g of ['open', 'shut']) {
    await w8(`games/${g}/game.json`, '{}');
    await w8(`games/${g}/game/main.js`);
    await w8(`games/${g}/requests/R-1.json`, '{}');
    await w8(`games/${g}/archive/old-plan.md`);
  }
  const seen = [];
  const watcher = createWatcher({
    root, tops: ['games'], sweepMs: 1e9, focus: () => new Set(['open']), log: { error() {} },
    classify: (top, rel) => ({ kind: 'code', file: rel.split(path.sep).join('/') }),
    onChange: (c) => { if (c.viaPoll) seen.push(c.file); },
  });
  try {
    await watcher.fullSweep(); // primes
    const later = new Date(Date.now() + 5000);
    for (const f of ['open/game/main.js', 'shut/game/main.js', 'shut/requests/R-1.json', 'open/archive/old-plan.md']) await fs.utimes(path.join(root, 'games', f), later, later);
    await watcher.fullSweep();
    assert.ok(seen.includes('open/game/main.js'), 'a focused game is swept in full');
    assert.ok(seen.includes('shut/requests/R-1.json'), "another game's requests are still swept");
    assert.ok(!seen.includes('shut/game/main.js'), "another game's code waits for the OS watcher (or for focus)");
    assert.ok(!seen.some((f) => f.includes('archive/')), 'history is never swept');
    assert.equal(seen.length, new Set(seen).size);
  } finally {
    watcher.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
