// game/main.js — {{NAME}}'s entry point. A placeholder until the first playable: it boots the
// engine's shell (screen, fixed-step loop, keyboard + pad + mouse), shows every registered
// sprite and plays the theme, so the art and sound pipelines (generator → Pixel Yak edits →
// game) work from day one.
import { createScreen, createInput, runLoop } from '../../../engine/shell/runtime.js';
import { text, useFontArt } from '../../../engine/shell/font.js';
import { studio } from '../../../engine/link/studio.js';
import { ART, sprite } from './sprites.js';
import { SOUND } from './sound.js';

const W = {{W}}, H = {{H}};
const screen = studio.attach(createScreen(document.getElementById('game'), { w: W, h: H, background: '#0c1024' }));
const input = createInput().attach(screen);
const g = screen.g;
useFontArt(sprite); // text draws from the `font` art entry, so the user can repaint the letters

// F8 in a game launched from Pixel Yak: the user slides this live and keeps the value they like
// (docs/contracts/TUNING.md). Anywhere else it's simply 10.
const frameTicks = studio.knob('Animation frame ticks', 10, { min: 2, max: 30, step: 1 });

const state = { scene: 'placeholder', tick: 0 };

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
  state.tick++;
}

function draw() {
  g.fillStyle = '#0c1024';
  g.fillRect(0, 0, W, H);
  let x = 8, y = 20, rowH = 0;
  for (const [id, e] of Object.entries(ART)) {
    if (id === 'font' || id.startsWith('ui_')) continue; // the font and widgets show as text and boxes, not in this gallery
    const frames = (e.anims && e.anims[e.defaultAnim]) || e.poses;
    const c = sprite(id, frames[Math.floor(state.tick / frameTicks()) % frames.length] || frames[0]);
    if (x + c.width > W - 8) { x = 8; y += rowH + 8; rowH = 0; }
    g.drawImage(c, x, y);
    x += c.width + 8; rowH = Math.max(rowH, c.height);
  }
  text(g, '{{NAME}}', 8, 6, '#e8e4ff');
  screen.present();
}

// F9 in Pixel Yak attaches this: a small state to read, and a save an AI can load to reproduce the
// moment (docs/contracts/MOMENTS.md). Capture tests read the state as window.__studioMoment().
studio.onMoment(() => ({ state: { scene: state.scene, tick: state.tick, music: SOUND.current() }, save: { tick: state.tick } }));

// ?moment=../requests/<R-id>-save.json boots straight into a saved moment.
studio.loadMoment().then((save) => { if (save && Number.isFinite(save.tick)) state.tick = save.tick; });

// Pixel Yak's checks read the songs as the game plays them (the AI's, with the user's edits on top).
window.__studioSound = SOUND;

runLoop(step, draw);
