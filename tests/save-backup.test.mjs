// tests/save-backup.test.mjs — the person's playtest saves are copied to plain files
// (local/saves/<id>/): only real copies are written, an unchanged game writes nothing, a broken copy
// never hides the one before it, old copies thin out to the newest ten plus one a day, and the copy
// and restore code that runs in a game's page brings every save back as it was (in Electron:
// tests/electron/save-roundtrip.cjs, with the engine's own save slots).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as B from '../studio/main/save-backup.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PID = `zz-backup-test-${process.pid}`;
const dir = B.backupDir(PID);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dump = (gold) => JSON.stringify({ format: B.SAVES_FORMAT, at: new Date().toISOString(), localStorage: { 'g.slot1': JSON.stringify({ gold }) }, indexedDB: [] });
const files = async () => (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();

test.after(() => fs.rm(dir, { recursive: true, force: true }));

test('only a real copy with something in it is written', async () => {
  assert.equal(await B.writeBackup(PID, 'not json'), null);
  assert.equal(await B.writeBackup(PID, JSON.stringify({ format: 'something-else', localStorage: {}, indexedDB: [] })), null);
  assert.equal(await B.writeBackup(PID, JSON.stringify({ format: B.SAVES_FORMAT, localStorage: {}, indexedDB: [] })), null);
  assert.equal(await B.writeBackup(PID, null), null); // the page didn't answer in time
  assert.deepEqual(await files(), []);
});

test('an unchanged game writes nothing; a change writes a new copy, and the newest is found', async () => {
  assert.ok(await B.writeBackup(PID, dump(1)));
  await sleep(3);
  assert.equal(await B.writeBackup(PID, dump(1)), null);
  assert.equal((await files()).length, 1);
  await sleep(3);
  assert.ok(await B.writeBackup(PID, dump(2)));
  const latest = await B.latestBackup(PID);
  assert.equal(JSON.parse(JSON.parse(latest.text).localStorage['g.slot1']).gold, 2);
});

test('a broken newest copy never hides the one before it', async () => {
  await fs.writeFile(path.join(dir, '2999-01-01T00-00-00-000Z.json'), '{"format": "pixel-yak-origin-saves@1", cut sho');
  const latest = await B.latestBackup(PID);
  assert.equal(JSON.parse(JSON.parse(latest.text).localStorage['g.slot1']).gold, 2);
  await fs.rm(path.join(dir, '2999-01-01T00-00-00-000Z.json'));
});

test('old copies thin out to the newest ten plus the last of each recent day', async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
  for (let n = 0; n < 20; n++) for (const t of ['08-00-00-000Z', '20-00-00-000Z']) await fs.writeFile(path.join(dir, `${day(n)}T${t}.json`), dump(-1));
  for (let i = 0; i < 12; i++) { await B.writeBackup(PID, dump(100 + i)); await sleep(3); }
  const kept = await files();
  assert.equal(kept.length, 30); // 10 newest (today) + the last copy of each of the 20 older days
  for (let n = 0; n < 20; n++) {
    assert.ok(kept.includes(`${day(n)}T20-00-00-000Z.json`), `the last copy of ${day(n)} is kept`);
    assert.ok(!kept.includes(`${day(n)}T08-00-00-000Z.json`), `an earlier copy of ${day(n)} goes`);
  }
});

test("a game's saves come back as they were after the profile is wiped (Electron)", (t) => {
  let electron;
  try { electron = createRequire(import.meta.url)('electron'); } catch { t.skip('Electron is not installed (npm install)'); return; }
  if (typeof electron !== 'string' || !fss.existsSync(electron)) { t.skip('Electron is not installed (npm install)'); return; }
  const r = spawnSync(electron, [path.join(HERE, 'electron', 'save-roundtrip.cjs')], { encoding: 'utf8', timeout: 90000 });
  const lines = (r.stdout || '').split('\n').filter((l) => /^(PASS|FAIL|ALL|SOME)/.test(l));
  assert.equal(r.status, 0, lines.join('\n') || r.stderr);
  assert.ok(lines.includes('ALL PASS'), lines.join('\n'));
});
