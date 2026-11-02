// game/main.js — {{NAME}}'s entry point. A placeholder until the first playable: it boots the
// engine's shell (screen, fixed-step loop, keyboard + pad + mouse) and shows every registered
// sprite, so the art pipeline (generator → Pixel Yak edits → game) works from day one.
import { createScreen, createInput, runLoop } from '../../../engine/shell/runtime.js';
import { text } from '../../../engine/shell/font.js';
import { ART, sprite } from './sprites.js';

const W = {{W}}, H = {{H}};
const screen = createScreen(document.getElementById('game'), { w: W, h: H, background: '#0c1024' });
const input = createInput().attach(screen);
const g = screen.g;

const state = { scene: 'placeholder', tick: 0 };

function step() {
  input.update();
  state.tick++;
}

function draw() {
  g.fillStyle = '#0c1024';
  g.fillRect(0, 0, W, H);
  let x = 8, y = 20, rowH = 0;
  for (const [id, e] of Object.entries(ART)) {
    const frames = (e.anims && e.anims[e.defaultAnim]) || e.poses;
    const c = sprite(id, frames[Math.floor(state.tick / 10) % frames.length] || frames[0]);
    if (x + c.width > W - 8) { x = 8; y += rowH + 8; rowH = 0; }
    g.drawImage(c, x, y);
    x += c.width + 8; rowH = Math.max(rowH, c.height);
  }
  text(g, '{{NAME}}', 8, 6, '#e8e4ff');
  screen.present();
}

runLoop(step, draw);

// Pixel Yak: F9 in a studio-launched game attaches this snapshot to the request it opens.
window.__studioMoment = () => ({ scene: state.scene, tick: state.tick });
