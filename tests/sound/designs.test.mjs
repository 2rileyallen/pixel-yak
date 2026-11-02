// tests/sound/designs.test.mjs — every sound design in the library (designs/sound/<id>/) keeps the
// contract games rely on: its instruments.js has the six roles (lead, keys, bass, pad, bell, drums
// with kit letters K S h o C), its example songs and sound effects compile without warnings and
// render healthy audio, and the blank template's song plays on it (so a new game can start from
// any design). Run: node --test "tests/sound/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileSong, compileSfx, renderSong, renderSfx, audioStats } from '../../engine/sound/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHELF = path.join(ROOT, 'designs', 'sound');
const designs = fs.existsSync(SHELF) ? fs.readdirSync(SHELF, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
const ROLES = ['lead', 'keys', 'bass', 'pad', 'bell', 'drums'];
const KIT = ['K', 'S', 'h', 'o', 'C'];

// templates/blank/game/sound.js SONGS.theme — copied here because the template file holds
// {{TOKENS}} and relative imports that only resolve inside a made game. Keep the two in step.
const TEMPLATE_THEME = {
  name: 'Theme (placeholder)', bpm: 112, loop: true, order: ['A'],
  sections: {
    A: { tracks: [
      { inst: 'lead', vol: 0.5, notes: 'E5 - - - D5 - C5 - D5 - E5 - - - . . | C5 - - - A4 - - - C5 - F5 - E5 - - - | G5 - - - E5 - D5 - C5 - - - D5 - E5 - | D5 - - - - - - - B4 - - - . . . .' },
      { inst: 'keys', vol: 0.35, notes: 'A3 . C4 . E4 . C4 . A3 . C4 . E4 . A4 . | F3 . A3 . C4 . A3 . F3 . A3 . C4 . F4 . | C4 . E4 . G4 . E4 . C4 . E4 . G4 . C5 . | G3 . B3 . D4 . B3 . G3 . B3 . D4 . G4 .' },
      { inst: 'bass', vol: 0.6, notes: 'A2 . . . A2 . E2 . A2 . . . A2 . G2 . | F2 . . . F2 . C3 . F2 . . . F2 . E2 . | C3 . . . C3 . G2 . C3 . . . C3 . B2 . | G2 . . . G2 . D3 . G2 . . . B2 . G2 .' },
      { inst: 'drums', vol: 0.55, notes: 'K . h . S . h . K . K . S . h h | K . h . S . h . K . K . S . h h | K . h . S . h . K . K . S . h h | K . h . S . h . K . S . S S S! S!' },
    ] },
  },
};
const TEMPLATE_SFX = {
  select: { vol: 1, layers: [{ note: ['E6', 'B6'], every: 0.06, inst: 'bell', len: 0.08, vel: 0.35 }] },
  hit: { vol: 1, layers: [{ noise: 'lowpass', from: 2400, to: 400, len: 0.1, vol: 0.5 }, { tone: 'sine', from: 160, to: 70, len: 0.1, vol: 0.45 }] },
};

const healthy = (stats, what, { song = false } = {}) => {
  assert.equal(stats.nan, 0, `${what}: NaN samples`);
  assert.ok(!stats.silent, `${what}: silent`);
  assert.ok(stats.peak < 1, `${what}: peak ${stats.peak} reaches full scale`);
  if (song) assert.ok(stats.rmsDb > -40, `${what}: too quiet (${stats.rmsDb} dB)`);
};

test('the sound shelf has designs', () => {
  assert.ok(designs.length >= 3, `designs/sound/ has ${designs.length} entries`);
});

for (const id of designs) {
  const dir = path.join(SHELF, id);
  const load = async (f) => import(pathToFileURL(path.join(dir, f)).href);

  test(`${id}: DESIGN.md, instruments.js and example-song.js are there`, () => {
    for (const f of ['DESIGN.md', 'instruments.js', 'example-song.js']) assert.ok(fs.existsSync(path.join(dir, f)), `${id}/${f} missing`);
    const md = fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8');
    assert.match(md, /^# \S/, 'DESIGN.md starts with a "# Title" line');
  });

  test(`${id}: the six roles and the drum letters K S h o C`, async () => {
    const { INSTRUMENTS } = await load('instruments.js');
    for (const r of ROLES) assert.ok(INSTRUMENTS[r], `${id} has no "${r}"`);
    assert.equal(INSTRUMENTS.drums.type, 'drums');
    for (const k of KIT) assert.ok(INSTRUMENTS.drums.kit && INSTRUMENTS.drums.kit[k], `${id} drums have no "${k}"`);
  });

  test(`${id}: its example songs and sound effects compile and render healthy`, async () => {
    const { INSTRUMENTS } = await load('instruments.js');
    const { SONGS, SFX } = await load('example-song.js');
    assert.ok(SONGS && Object.keys(SONGS).length, `${id} has no example songs`);
    for (const [sid, s] of Object.entries(SONGS)) {
      const c = compileSong(s, INSTRUMENTS, { id: sid });
      assert.deepEqual(c.warnings, [], `${id} song ${sid}`);
      healthy(audioStats(renderSong(c, { seconds: 4 })), `${id} song ${sid}`, { song: true });
    }
    for (const [fid, f] of Object.entries(SFX || {})) {
      const c = compileSfx(f, INSTRUMENTS);
      assert.deepEqual(c.warnings, [], `${id} sfx ${fid}`);
      healthy(audioStats(renderSfx(c)), `${id} sfx ${fid}`);
    }
  });

  test(`${id}: the blank template's song and sound effects play on it`, async () => {
    const { INSTRUMENTS } = await load('instruments.js');
    const c = compileSong(TEMPLATE_THEME, INSTRUMENTS, { id: 'theme' });
    assert.deepEqual(c.warnings, [], `${id}: template theme`);
    healthy(audioStats(renderSong(c, { seconds: 3 })), `${id}: template theme`, { song: true });
    for (const [fid, f] of Object.entries(TEMPLATE_SFX)) assert.deepEqual(compileSfx(f, INSTRUMENTS).warnings, [], `${id}: template sfx ${fid}`);
  });
}
