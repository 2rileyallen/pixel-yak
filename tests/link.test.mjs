// tests/link.test.mjs — engine/link outside a browser (a shipped build's defaults) and the studio's
// tuning + moment files (studio/data/tuning.mjs, moments.mjs). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as D from '../studio/data/index.mjs';
import { studio, slugOf } from '../engine/link/studio.js';

test('without a studio, knobs and variants are their code defaults', async () => {
  assert.equal(studio.on, false);
  const speed = studio.knob('Hero walk speed', 1.0, { min: 0.5, max: 2, step: 0.1 });
  const title = studio.variant('Title music', ['A · calm harp', 'B · war drums'], { default: 1 });
  assert.equal(speed(), 1);
  assert.equal(title(), 'B · war drums');
  assert.equal(title.index(), 1);
  assert.equal(await studio.loadMoment(), null);
  assert.deepEqual(studio.list(), []);
});

test('the engine and the studio name a knob the same way', () => {
  for (const n of ['Hero walk speed', '  Title MUSIC!! ', 'roof/art v2', '']) assert.equal(slugOf(n), D.tuningSlug(n));
});

test('a choice is checked before it is kept', () => {
  assert.throws(() => D.normChoice({ kind: 'knob', chosen: 1 }), /name/);
  assert.throws(() => D.normChoice({ name: 'x', kind: 'knob', chosen: 'fast' }), /number/);
  const r = D.normChoice({ name: 'Roof', kind: 'variant', chosen: 'b', options: ['a', 'b', { no: 1 }], note: 'x'.repeat(900) });
  assert.equal(r.slug, 'roof');
  assert.equal(r.note.length, 300);
  assert.equal(typeof r.options[2], 'string');
});

test('keep → list → done, and a save-state beside a request', async (t) => {
  const id = `zz-link-test-${process.pid}`;
  const dir = path.join(D.DIRS.games, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify({ id, name: 'Link test' }));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const k = await D.keepTuning(id, { name: 'Hero walk speed', kind: 'knob', chosen: 1.4, label: '1.4', default: 1, range: { min: 0.5, max: 2, step: 0.1 }, note: 'too slow' });
  assert.equal(k.file, `games/${id}/tuning/hero-walk-speed.json`);
  assert.match(k.lesson.lesson, /Kept 1\.4 for Hero walk speed/);
  await D.keepTuning(id, { name: 'Title music', kind: 'variant', chosen: 'B', label: 'B', default: 'A', options: ['A', 'B', 'C'] });
  assert.deepEqual((await D.listTuning(id)).map((r) => r.slug), ['hero-walk-speed', 'title-music']);
  const lines = fs.readFileSync(path.join(dir, 'design', 'lessons', 'tuning.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.match(lines[1].lesson, /over A, C/);

  await D.markTuningDone(id, 'title-music', 'drums are the title song now');
  assert.deepEqual((await D.listTuning(id)).map((r) => r.slug), ['hero-walk-speed']);
  assert.equal((await D.listTuning(id, { done: true }))[0].doneNote, 'drums are the title song now');
  await assert.rejects(D.markTuningDone(id, 'title-music'), /already in tuning\/done/);
  await assert.rejects(D.markTuningDone(id, '../x'), /invalid/);

  const r = await D.createRequest(id, { title: 'moment' });
  const file = await D.attachJson(id, r.id, 'save', D.momentFile({ game: id, request: r.id, at: 'now', state: { a: 1 }, save: { b: 2 } }));
  assert.equal(file, `games/${id}/requests/${r.id}-save.json`);
  assert.deepEqual((await D.getRequest(id, r.id)).attachments, [`${r.id}-save.json`]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(D.ROOT, file), 'utf8')).save.b, 2);
  await D.deleteRequest(id, r.id);
  assert.equal(fs.existsSync(path.join(D.ROOT, file)), false, 'deleting the request deletes its save-state');
  await assert.rejects(D.attachJson(id, r.id, 'save', {}), /not found/);
});
