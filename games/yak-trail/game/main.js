// game/main.js — Yak Trail boots here: the screen, input, the font and widgets from the art registry,
// the best-time record, the scenes, and the hooks Pixel Yak and the capture tests use.
//   scenes/title.js → scenes/play.js (with scenes/pause.js and scenes/finish.js on top)
// The rules live in sim.js, the trail in level.js, the drawing in world.js.
import { createScreen, createInput, Director, runLoop } from '../../../engine/shell/runtime.js';
import { useFontArt, measure } from '../../../engine/shell/font.js';
import { createWidgets } from '../../../engine/shell/widgets.js';
import { slotStore } from '../../../engine/shell/saves.js';
import { sprite, ARTKIT } from './sprites.js';
import { buildLevel } from './level.js';
import { createWorld, W, H } from './world.js';
import { C, M } from '../design/palette.js';
import { titleScene } from './scenes/title.js';
import { playScene } from './scenes/play.js';

const screen = createScreen(document.getElementById('game'), { w: W, h: H, background: C(M.INK, 0) });
const input = createInput().attach(screen);
const director = new Director(screen, input);
const fontArt = useFontArt(sprite); // text draws from the `font` art entry, so the user can repaint the letters

// One record, kept in the browser: the best time, the most tufts, and whether the timer shows.
const store = slotStore('yak-trail', { slots: [1], version: 1 });
const level = buildLevel();

export const game = {
  screen, input, director, level,
  world: createWorld(level),
  ui: createWidgets(sprite),
  record: { best: null, bestTufts: 0, timer: true, ...(store.read(1) || {}) },
  save() { const { best, bestTufts, timer } = game.record; store.write(1, { best, bestTufts, timer }); },
  // Controls: arrows / WASD trot, Space / ↑ / W / pad A hop, Esc / pad Menu pause. Enter confirms.
  hop: () => input.pressed('a') || input.pressed('up'),
  hopHeld: () => input.down('a') || input.down('up'),
  ok: () => input.pressed('a') || input.keyPressed('Enter'),
  back: () => input.keyPressed('Escape') || input.pressed('b') || input.padPressed(9),
  title: () => director.go(titleScene(game)),
  play: (opts) => director.go(playScene(game, opts)),
};

const q = new URLSearchParams(location.search);
if (q.get('scene') === 'play') director.go(playScene(game, { at: Number(q.get('at')) || null }));
else director.go(titleScene(game));

// 60 updates a second whatever the screen's refresh rate.
runLoop(() => director.update(), () => director.draw());

// Pixel Yak: F9 in a studio-launched game attaches this snapshot to the request it opens.
window.__studioMoment = () => {
  const s = director.top || {};
  const run = (director.scene && director.scene.run) || null;
  return {
    scene: s.name || 'boot', tick: director.tick,
    ...(run ? { x: Math.round(run.x), y: Math.round(run.y), tufts: run.tufts, of: level.tufts.length, falls: run.falls, cairn: run.check, ticks: run.tick, done: run.done } : {}),
  };
};
// For capture tests (dev/tests/*.json): read the state, jump to a spot, start a run.
window.__yak = {
  game, level, art: ARTKIT, measure, fontArt,
  scene: () => (director.top || {}).name,
  run: () => director.scene && director.scene.run,
  place: (x) => director.scene.place(x),
};
