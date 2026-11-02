// dev/rules.test.mjs — Yak Trail's rules as tests (node:test). Run: node --test "games/yak-trail/dev/**/*.test.mjs"
// One test per rule; name it after its DECISIONS.md number when it has one ("#12 …"). Keep game
// logic pure (no DOM, no Math.random) so tests can import it directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = JSON.parse(readFileSync(new URL('../game.json', import.meta.url), 'utf8'));

test('game.json names this game', () => {
  assert.equal(game.id, 'yak-trail');
});

test('every art entry declares its size, anchor and poses, and its anims name only those poses', async () => {
  const { ART } = await import('../game/sprites.js'); // nothing is drawn: the contract only
  assert.ok(Object.keys(ART).length > 0, 'no art entries');
  for (const [id, e] of Object.entries(ART)) {
    for (const k of ['fw', 'fh', 'ax', 'ay']) assert.ok(Number.isInteger(e[k]), `${id}.${k}`);
    assert.ok(Array.isArray(e.poses) && e.poses.length > 0, `${id}.poses`);
    for (const [anim, frames] of Object.entries(e.anims || {})) {
      for (const f of frames) assert.ok(e.poses.includes(f), `${id}: anim ${anim} names ${f}, not a pose`);
    }
  }
});
