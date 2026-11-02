// tests/designs/library.test.mjs — the design library keeps its contract (docs/contracts/DESIGN-FILES.md):
// every art palette is a drop-in for a new game, every DESIGN.md has its title, summary and sections,
// and use / promote / diff behave (never over a game's own copy) on a throwaway game.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as D from '../../studio/data/index.mjs';

const SECTIONS = {
  art: ['The look in one paragraph', 'Resolution and scale', 'Palette and material roles', 'Shapes, outlines, shading, light', 'Motion', 'UI', 'Style knobs', 'Do / Don\'t', 'Exemplars', 'How to ask', 'Changelog'],
  game: ['This game', 'Pacing and progression', 'What the screen shows', 'Controls', 'What to build for its size', 'Do / Don\'t', 'Lessons from games', 'How to ask', 'Changelog'],
};

const library = (await D.listDesigns()).filter((d) => d.source === 'library');

test('every library DESIGN.md has a title, a short summary and its shelf\'s sections', async () => {
  for (const d of library) {
    const { md } = await D.readDesign(d.shelf, d.id);
    assert.ok(d.title, `${d.path}: no "# Title" line`);
    const words = d.summary.split(/\s+/).filter(Boolean).length;
    // the card shows ~3 lines: aim under ~45 words; the test only catches a whole section used as the summary
    assert.ok(words > 5 && words <= 90, `${d.path}: the summary paragraph has ${words} words (aim under ~45)`);
    const heads = [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    for (const want of SECTIONS[d.shelf] || []) assert.ok(heads.some((x) => x.startsWith(want)), `${d.path}: missing the "## ${want}…" section`);
  }
});

test('every art palette exports the contract, keeps hexes unique and fits the starter art', async () => {
  for (const d of library.filter((x) => x.shelf === 'art')) {
    const pal = await import(pathToFileURL(path.join(D.ROOT, d.path, 'palette.js')).href);
    for (const k of ['M', 'HEXRAMPS', 'RAMPS', 'GLOW', 'C', 'FIN', 'FIN_FX', 'FIN_FLAT']) assert.ok(k in pal, `${d.path}/palette.js: no export ${k}`);
    const seen = new Map();
    for (const [name, id] of Object.entries(pal.M)) {
      assert.ok(Number.isInteger(id) && id > 0 && id < 100, `${d.path}: material ${name} id ${id} (library ids are 1–99; games add 100+)`);
      const ramp = pal.HEXRAMPS[id];
      assert.equal(ramp && ramp.length, 5, `${d.path}: ${name} needs 5 stops`);
      ramp.forEach((hex, s) => {
        assert.match(hex, /^#[0-9a-f]{6}$/, `${d.path}: ${name}[${s}] ${hex}`);
        assert.ok(!seen.has(hex), `${d.path}: ${name}[${s}] ${hex} repeats ${seen.get(hex)} — the studio reads pixels back by colour`);
        seen.set(hex, `${name}[${s}]`);
      });
    }
    assert.ok(['GLOW', 'SOUL', 'SKY', 'CLOTH'].some((n) => n in pal.M) && ['METAL', 'GOLD', 'STONE'].some((n) => n in pal.M), `${d.path}: the starter art needs GLOW/SOUL/SKY/CLOTH and METAL/GOLD/STONE`);
  }
});

test('lineDiff marks what each side has', () => {
  assert.equal(D.lineDiff('a\nb\nc\n', 'a\nb\nc\n'), '');
  const diff = D.lineDiff('a\nb\nc\n', 'a\nB\nc\n', { aName: 'game', bName: 'library' });
  assert.match(diff, /^--- game\n\+\+\+ library\n@@ /);
  assert.match(diff, /\n-b\n\+B\n/);
});

test('use refuses over a game\'s own copy; force archives it; promote and diff round-trip', async () => {
  const id = `zz-designs-test-${process.pid}`;
  const newId = `zz-promoted-${process.pid}`;
  const gameDir = path.join(D.DIRS.games, id);
  try {
    await D.createProject({ id, name: 'Designs test', designs: { game: 'basics' }, pitch: 'A thought: tiny frogs.' });
    // no art design yet: the template's placeholder may be replaced
    const r1 = await D.useDesign(id, 'art', 'gba-bright');
    assert.ok(r1.written.includes('design/palette.js'));
    // now it has its own: refused without force
    await assert.rejects(D.useDesign(id, 'art', 'cozy-factory'), /already has its own art design/);
    // the game design keeps the user's first notes when forced
    const r2 = await D.useDesign(id, 'game', 'factory-automation', { force: true });
    assert.ok(r2.archived.length >= 1);
    assert.match(await fs.readFile(path.join(gameDir, 'design', 'game.md'), 'utf8'), /## The user's first notes[\s\S]*tiny frogs/);
    // diff: same as the library until the game changes
    assert.equal((await D.diffDesign(id, 'art')).files.find((f) => f.file === 'art.md').status, 'same');
    await fs.appendFile(path.join(gameDir, 'design', 'art.md'), '\n- A rule of this game (#1).\n');
    assert.match((await D.diffDesign(id, 'art')).files.find((f) => f.file === 'art.md').diff, /^-- A rule of this game/m);
    // promote: a new local entry with a changelog line and the palette, no copy note
    const p = await D.promoteDesign(id, 'art', newId, { local: true, title: 'Promoted Look' });
    const md = await fs.readFile(path.join(D.ROOT, p.dir, 'DESIGN.md'), 'utf8');
    assert.match(md, /^# Promoted Look/);
    assert.match(md, /Promoted from the game "Designs test"/);
    assert.doesNotMatch(md, /This game's own copy/);
    assert.ok(p.written.some((f) => f.endsWith('/palette.js')));
    await assert.rejects(D.promoteDesign(id, 'art', newId, { local: true }), /already an art design/);
  } finally {
    await fs.rm(gameDir, { recursive: true, force: true });
    await fs.rm(path.join(D.DIRS.localDesigns, 'art', newId), { recursive: true, force: true });
  }
});
