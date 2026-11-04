// dev/sound.test.mjs — Yak Trail's music and sound effects as tests (node:test): every song compiles
// without a warning and renders healthy (no NaN, not silent, not clipping), every event the sim
// reports has its sound effect. Nobody listens here — the user's ear in the Sound view is the test
// of how it sounds. Run: node --test "games/yak-trail/dev/**/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUND, SONGS, SFX } from '../game/sound.js';
import { renderSong, renderSfx, audioStats } from '../engine/sound/index.js';

test('the songs are there: the trail theme loops, the summit fanfare plays once', () => {
  assert.equal(SONGS.trail.loop, true);
  assert.equal(SONGS.summit.loop, false);
  assert.ok(SONGS['trail-quiet'], 'the F8 variant\'s arrangement');
});

for (const id of Object.keys(SONGS)) {
  test(`song ${id} compiles cleanly and renders healthy`, () => {
    const c = SOUND.song(id);
    assert.deepEqual(c.warnings, []);
    const s = audioStats(renderSong(c, { seconds: 8 }));
    assert.equal(s.nan, 0, 'no NaN');
    assert.ok(!s.silent, 'not silent');
    assert.ok(s.peakDb < -0.5 && s.peakDb > -9, `peak ${s.peakDb} dBFS`);
    assert.ok(s.rmsDb > -26 && s.rmsDb < -12, `loudness ${s.rmsDb} dB RMS`);
  });
}

test('every event the sim reports has a sound effect, and each one renders', () => {
  for (const ev of ['hop', 'land', 'munch', 'checkpoint', 'fall', 'summit']) {
    assert.ok(SFX[ev], `no sound effect for "${ev}"`);
    const c = SOUND.effect(ev);
    assert.deepEqual(c.warnings, [], ev);
    const s = audioStats(renderSfx(c));
    assert.ok(s.nan === 0 && !s.silent && s.clipped === 0, `${ev}: ${JSON.stringify(s)}`);
  }
});
