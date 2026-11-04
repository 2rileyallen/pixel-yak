// tests/origins.test.mjs — a game's code can never become the studio's code (studio/main/origins.mjs).
// The studio's origin holds the bridge to the disk; a page of that origin framed inside the studio
// window would share it. So its pages can't be framed, and it never serves a game's pages or scripts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originMay, securityHeaders, RUNNABLE } from '../studio/main/origins.mjs';

test("the studio's origin runs code only from Pixel Yak and the design library", () => {
  for (const p of ['studio/ui/index.html', 'studio/ui/js/main.js', 'engine/art/edits.js', 'designs/art/gba-bright/palette.js', 'local/designs/art/mine/palette.js', '/studio/ui/host.html'])
    assert.equal(originMay('app', p), true, p);
  // a game's own page or script, served on the studio's origin, would share window.studio
  for (const p of ['games/any/game/index.html', 'games/any/x/pwn.js', 'games/any/a.mjs', 'games/any/art.svg', 'games/any/p.htm', 'games/any/p.xhtml', 'local/ideas/x.html', 'scratch/x.js', 'templates/demo/yak-trail/game/main.js', 'tools/render-art.html'])
    assert.equal(originMay('app', p), false, p);
  // …but its data still shows in the studio
  for (const p of ['games/any/design/lessons/cards/L-1.png', 'games/any/clips/out/teaser.mp4', 'games/any/requests/R-1-1.png', 'games/any/game.json', 'games/any/AGENTS.md', 'local/inbox/R-1-1.png'])
    assert.equal(originMay('app', p), true, p);
});

test('a game reads only its own folder, the engine, the frame pages and three.js', () => {
  for (const h of ['host-a', 'play-a', 'sound-a']) {
    assert.equal(originMay(h, 'games/a/game/main.js'), true);
    assert.equal(originMay(h, 'engine/shell/runtime.js'), true);
    assert.equal(originMay(h, 'studio/ui/host.html'), true);
    assert.equal(originMay(h, 'games/b/game/main.js'), false, 'never another game');
    assert.equal(originMay(h, 'games/ab/game/main.js'), false, 'not a game whose id starts the same');
    assert.equal(originMay(h, 'local/ideas/x.md'), false, 'never local/');
    assert.equal(originMay(h, 'designs/art/gba-bright/palette.js'), false, 'never the design library');
  }
  assert.equal(originMay('evil', 'games/a/game/main.js'), false);
  assert.equal(originMay('host-A', 'games/a/game/main.js'), false);
});

test("every answer forbids type sniffing; the studio's pages can't be framed", () => {
  assert.equal(securityHeaders('app')['x-content-type-options'], 'nosniff');
  assert.match(securityHeaders('app')['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(securityHeaders('host-a')['x-content-type-options'], 'nosniff');
  assert.equal(securityHeaders('host-a')['content-security-policy'], undefined, "a game's own pages keep their own rules");
  assert.ok(RUNNABLE.test('X.HTML') && !RUNNABLE.test('x.png') && !RUNNABLE.test('x.json'));
});
