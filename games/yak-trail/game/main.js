// game/main.js — Yak Trail boots here: the screen, input, the font and widgets from the art registry,
// the best-time record, the music, the F8 knobs and F9 moments, the scenes, and the hooks Pixel Yak
// and the capture tests use.
//   scenes/title.js → scenes/play.js (with scenes/pause.js and scenes/finish.js on top)
// The rules live in sim.js, the trail in level.js, the drawing in world.js, the sound in sound.js.
import { createScreen, createInput, Director, runLoop } from '../engine/shell/runtime.js';
import { useFontArt, measure } from '../engine/shell/font.js';
import { createWidgets } from '../engine/shell/widgets.js';
import { slotStore } from '../engine/shell/saves.js';
import { studio } from '../engine/link/studio.js';
import { sprite, ARTKIT } from './sprites.js';
import { buildLevel } from './level.js';
import { TUNE, HOP_PX, hopFor, saveRun } from './sim.js';
import { SOUND } from './sound.js';
import { createWorld, W, H } from './world.js';
import { C, M } from '../design/palette.js';
import { titleScene } from './scenes/title.js';
import { playScene } from './scenes/play.js';

const screen = studio.attach(createScreen(document.getElementById('game'), { w: W, h: H, background: C(M.INK, 0) }));
const input = createInput().attach(screen);
const director = new Director(screen, input);
const fontArt = useFontArt(sprite); // text draws from the `font` art entry, so the user can repaint the letters

// F8 in a game launched from Pixel Yak (or opened with ?tune=1): the user slides these while
// climbing and keeps what feels right (docs/contracts/TUNING.md). Anywhere else they are the code's
// values: the knobs start at sim.js TUNE, so the feel only changes when the AI builds a kept choice in.
const trotSpeed = studio.knob('Trot speed', TUNE.trot, { min: 0.8, max: 3.2, step: 0.1 });
const hopHeight = studio.knob('Hop height', HOP_PX, { min: 20, max: 80, step: 2 });
const trailMusic = studio.variant('Trail music', ['A · folk band', 'B · quiet bells']);
const TRAIL_SONGS = ['trail', 'trail-quiet'];
const tune = { ...TUNE };

// One record, kept in the browser: the best time, the most tufts, and whether the timer shows.
const store = slotStore('yak-trail', { slots: [1], version: 1 });
const level = buildLevel();

export const game = {
  screen, input, director, level,
  world: createWorld(level),
  ui: createWidgets(sprite),
  sound: SOUND,
  record: { best: null, bestTufts: 0, timer: true, ...(store.read(1) || {}) },
  save() { const { best, bestTufts, timer } = game.record; store.write(1, { best, bestTufts, timer }); },
  // The feel this tick: TUNE with the F8 knobs on top (one object, reused every tick).
  tune() { Object.assign(tune, TUNE); tune.trot = trotSpeed(); tune.hop = hopFor(hopHeight()); return tune; },
  // The climb's music; F8 can swap the arrangement live (asking for the song already playing is free).
  trailMusic: () => SOUND.music(TRAIL_SONGS[trailMusic.index()] || 'trail'),
  // Controls: arrows / WASD trot, Space / ↑ / W / pad A hop, Esc / pad Menu pause. Enter confirms.
  hop: () => input.pressed('a') || input.pressed('up'),
  hopHeld: () => input.down('a') || input.down('up'),
  ok: () => input.pressed('a') || input.keyPressed('Enter'),
  back: () => input.keyPressed('Escape') || input.pressed('b') || input.padPressed(9),
  title: () => director.go(titleScene(game)),
  play: (opts) => director.go(playScene(game, opts)),
};

// Browsers start audio only after a click or key press: the first one starts the music.
function startAudio() {
  SOUND.unlock();
  removeEventListener('keydown', startAudio);
  removeEventListener('pointerdown', startAudio);
}
addEventListener('keydown', startAudio);
addEventListener('pointerdown', startAudio);

// ?moment=<save file> boots into a climb saved by F9 (docs/contracts/MOMENTS.md);
// ?scene=play&at=<x> starts a climb at x (capture tests, clips); otherwise the title.
const q = new URLSearchParams(location.search);
if (q.has('moment')) studio.loadMoment().then((save) => director.go(save && save.run ? playScene(game, { save: save.run }) : titleScene(game)));
else if (q.get('scene') === 'play') director.go(playScene(game, { at: Number(q.get('at')) || null }));
else director.go(titleScene(game));

// 60 updates a second whatever the screen's refresh rate. Paused, the music drops to a murmur
// (the climb is frozen; the menu shouldn't feel dead).
let hushed = false;
runLoop(() => {
  director.update();
  const paused = (director.top || {}).name === 'pause';
  if (paused !== hushed) { hushed = paused; SOUND.volume({ music: paused ? 0.35 : 1 }); }
}, () => director.draw());

// F9 in Pixel Yak attaches this: a small state to read, and a save that reproduces the climb. Capture
// tests read the state as window.__studioMoment().
studio.onMoment(() => {
  const s = director.top || {};
  const run = (director.scene && director.scene.run) || null;
  return {
    state: {
      scene: s.name || 'boot', tick: director.tick, music: SOUND.current(),
      ...(run ? { x: Math.round(run.x), y: Math.round(run.y), tufts: run.tufts, of: level.tufts.length, falls: run.falls, cairn: run.check, ticks: run.tick, done: run.done } : {}),
    },
    save: run ? { run: saveRun(run) } : null,
  };
});

// Pixel Yak's checks read the songs as the game plays them (the AI's, with the user's edits on top).
window.__studioSound = SOUND;
// For capture tests (dev/tests/*.json) and clips: read the state, jump to a spot, start a run.
window.__yak = {
  game, level, art: ARTKIT, measure, fontArt,
  scene: () => (director.top || {}).name,
  run: () => director.scene && director.scene.run,
  place: (x) => director.scene.place(x),
};
