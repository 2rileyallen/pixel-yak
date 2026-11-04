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

// Linux has no native recursive watching: Node's stand-in walks every file of every game (.git too) and
// watches each one. There the studio watches only the folders its scans keep, one plain watcher each.
test('per-folder watching: a watcher on each kept folder, none in .git, node_modules or a closed game', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yak-watch-'));
  const w8 = (f, t = 'x') => fs.mkdir(path.dirname(path.join(root, f)), { recursive: true }).then(() => fs.writeFile(path.join(root, f), t));
  for (const g of ['open', 'shut']) {
    await w8(`games/${g}/game.json`, '{}');
    await w8(`games/${g}/game/art/yak.js`);
    await w8(`games/${g}/requests/R-1.json`, '{}');
    await w8(`games/${g}/.git/objects/ab/cdef`);
    await w8(`games/${g}/node_modules/pkg/index.js`);
  }
  const seen = [];
  const watcher = createWatcher({
    root, tops: ['games'], sweepMs: 1e9, scopedDelayMs: 50, perFolder: true, focus: () => new Set(['open']), log: { error() {} },
    classify: (top, rel) => ({ kind: 'code', file: rel.split(path.sep).join('/') }),
    onChange: (c) => seen.push(c),
  });
  const until = async (ok, what) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50)); assert.ok(ok(), what); };
  try {
    await watcher.start();
    const watched = watcher.watchedFolders().map((d) => path.relative(root, d).split(path.sep).join('/')).sort();
    for (const d of ['games', 'games/open', 'games/open/game', 'games/open/game/art', 'games/open/requests', 'games/shut', 'games/shut/requests']) assert.ok(watched.includes(d), `watches ${d}`);
    assert.ok(!watched.some((d) => d.includes('.git') || d.includes('node_modules')), 'never .git or node_modules');
    assert.ok(!watched.includes('games/shut/game'), "a closed game's code folders aren't watched");
    assert.equal(watcher.stats().mode, 'per-folder');

    // a change in the open game arrives through its folder's watcher, not a sweep
    await w8('games/open/game/art/yak.js', 'changed');
    await until(() => seen.some((c) => c.file === 'open/game/art/yak.js' && !c.viaPoll), 'an edit is reported by the folder watcher');
    // a new folder is watched once its scoped scan has seen it
    await w8('games/open/game/scenes/a.js');
    await until(() => watcher.watchedFolders().some((d) => d.endsWith(path.join('game', 'scenes'))), 'a new folder gets a watcher');
    await w8('games/open/game/scenes/b.js');
    await until(() => seen.some((c) => c.file === 'open/game/scenes/b.js' && !c.viaPoll), "a new folder's files are reported");
    // a new ticket in a closed game still arrives
    await w8('games/shut/requests/R-2.json', '{}');
    await until(() => seen.some((c) => c.file === 'shut/requests/R-2.json'), "a closed game's tickets are watched");
  } finally {
    watcher.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
