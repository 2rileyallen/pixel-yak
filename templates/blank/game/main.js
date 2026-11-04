// game/main.js — {{NAME}}'s boot: the screen, input, the world, the studio link and the loop. It stays
// small as the game grows: the rules live in systems (game/systems/), drawing in scenes
// (game/scenes/), saves in game/save.js, the F8 knobs in game/tune.js.
// A placeholder until the first playable: it shows every registered sprite and plays the theme, so
// the art and sound pipelines (generator → Pixel Yak edits → game) work from day one.
import { createScreen, createInput, runLoop } from '../engine/shell/runtime.js';
import { useFontArt } from '../engine/shell/font.js';
import { createWorld, stepWorld } from '../engine/shell/systems.js';
import { studio } from '../engine/link/studio.js';
import { sprite } from './sprites.js';
import { SOUND } from './sound.js';
import { SYSTEMS } from './systems/index.js';
import { tuneNow } from './tune.js';
import { snapshot, restore } from './save.js';
import * as play from './scenes/play.js';

const W = {{W}}, H = {{H}};
const screen = studio.attach(createScreen(document.getElementById('game'), { w: W, h: H, background: '#0c1024' }));
const input = createInput().attach(screen);
useFontArt(sprite); // text draws from the `font` art entry, so the user can repaint the letters

let world = createWorld(SYSTEMS, { seed: 1 });
const scene = { name: 'placeholder', events: [] };

// Browsers start audio only after a click or key press: the first one starts the music.
function startAudio() {
  SOUND.unlock();
  SOUND.music('theme');
  removeEventListener('keydown', startAudio);
  removeEventListener('pointerdown', startAudio);
}
addEventListener('keydown', startAudio);
addEventListener('pointerdown', startAudio);

function step() {
  input.update();
  scene.events = stepWorld(SYSTEMS, world, { input, tune: tuneNow() }); // sound and effects react to these
}

function draw() {
  play.draw(screen.g, world, { W, H, tune: tuneNow() });
  screen.present();
}

// F9 in Pixel Yak attaches this: a small state to read, and the world's save, so an AI can load the
// exact moment (docs/contracts/MOMENTS.md). Capture tests read the state as window.__studioMoment().
studio.onMoment(() => ({ state: { scene: scene.name, tick: world.tick, music: SOUND.current() }, save: snapshot(world) }));

// ?moment=../requests/<R-id>-save.json boots straight into a saved moment.
studio.loadMoment().then((save) => { const w = save && restore(save); if (w) world = w; });

// Pixel Yak's checks read the songs as the game plays them (the AI's, with the user's edits on top).
window.__studioSound = SOUND;

runLoop(step, draw);
