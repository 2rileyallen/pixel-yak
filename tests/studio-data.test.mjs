// tests/studio-data.test.mjs — the data layer keeps the person's work safe: requests never share an
// id or lose a change made at the same moment, a claimed ticket isn't taken by a second agent, notes
// are never trimmed, and a file that exists but can't be read is named, not silently skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as D from '../studio/data/index.mjs';

const SCOPE = `zz-data-test-${process.pid}`;
const dir = path.join(D.DIRS.games, SCOPE);
const rm = (p) => fs.rm(p, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });

test.before(async () => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'game.json'), JSON.stringify({ id: SCOPE, name: 'Data test' }));
});
test.after(() => rm(dir));

test('fifty requests in one burst all get their own id and file', async () => {
  const made = await Promise.all(Array.from({ length: 50 }, (_, i) => D.createRequest(SCOPE, { title: `t${i}` }, [], 'web')));
  assert.equal(new Set(made.map((r) => r.id)).size, 50);
  assert.equal((await D.listRequests(SCOPE)).length, 50);
});

test('two changes at the same moment both land (the lock)', async () => {
  const r = await D.createRequest(SCOPE, { title: 'locked' });
  await Promise.all(Array.from({ length: 12 }, (_, i) => D.updateRequest(SCOPE, r.id, { addNote: `note ${i}` })));
  assert.equal((await D.getRequest(SCOPE, r.id)).notes.length, 12);
});

test('notes are never trimmed', async () => {
  const r = await D.createRequest(SCOPE, { title: 'chatty' });
  const raw = JSON.parse(await fs.readFile(path.join(dir, 'requests', `${r.id}.json`), 'utf8'));
  raw.notes = Array.from({ length: 150 }, (_, i) => ({ ts: D.nowIso(), by: 'user', text: `n${i}` }));
  await fs.writeFile(path.join(dir, 'requests', `${r.id}.json`), JSON.stringify(raw));
  await D.updateRequest(SCOPE, r.id, { addNote: 'one more' });
  assert.equal((await D.getRequest(SCOPE, r.id)).notes.length, 151);
});

test('a ticket another agent is working is refused, unless taken over', async () => {
  const r = await D.createRequest(SCOPE, { title: 'claim', goNow: true });
  await D.updateRequest(SCOPE, r.id, { status: 'in-progress', claimedBy: 'agent-a', claim: { who: 'agent-a' } }, 'ai');
  const now = await D.getRequest(SCOPE, r.id);
  assert.equal(D.startBlock(now, { who: 'agent-b' }), 'claimed');
  assert.equal(D.startBlock(now, { who: 'agent-a' }), null);
  await assert.rejects(D.updateRequest(SCOPE, r.id, { status: 'in-progress', claimedBy: 'agent-b', claim: { who: 'agent-b' } }, 'ai'), /already being worked by agent-a/);
  await D.updateRequest(SCOPE, r.id, { status: 'in-progress', claimedBy: 'agent-b', claim: { who: 'agent-b', take: true } }, 'ai');
  assert.equal((await D.getRequest(SCOPE, r.id)).claimedBy, 'agent-b');
});

test('a request file that exists but cannot be read is named in takeUnreadable()', async () => {
  D.takeUnreadable();
  await fs.writeFile(path.join(dir, 'requests', 'R-261104-000000-broken.json'), '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> other\n');
  await D.listRequests(SCOPE);
  const bad = D.takeUnreadable();
  assert.ok(bad.some((b) => b.path.endsWith('R-261104-000000-broken.json') && /merge conflict/.test(b.error)), JSON.stringify(bad));
});

test('writeText leaves no temp file behind and survives many writes at once', async () => {
  const f = path.join(dir, 'many.json');
  await Promise.all(Array.from({ length: 30 }, (_, i) => D.writeJson(f, { i })));
  assert.ok(typeof JSON.parse(await fs.readFile(f, 'utf8')).i === 'number');
  assert.deepEqual((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')), []);
});
