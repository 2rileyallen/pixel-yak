// scenes/play.js — the climb: reads the controls, steps the sim (sim.js) with the feel of the F8
// knobs, turns its events into little effects and sounds, moves the camera, draws the world and the
// HUD. Esc pauses (everything freezes); the summit plays the fanfare and brings up the finish panel.
import { text } from '../../../../engine/shell/font.js';
import { ditherFill } from '../../../../engine/shell/runtime.js';
import { drawSprite } from '../sprites.js';
import { newRun, step, floorAt, clock, loadRun } from '../sim.js';
import { zoneAt } from '../level.js';
import { makeBirds, updateBirds, spawn, updateParticles, W } from '../world.js';
import { pauseOverlay } from './pause.js';
import { finishOverlay } from './finish.js';
import { C, M } from '../../design/palette.js';

// opts: at (start the climb at x) or save (a climb saved by F9: sim.js saveRun)
export function playScene(game, { at = null, save = null } = {}) {
  const { level, world, input, ui, director } = game;
  const run = newRun(level);
  const birds = makeBirds(level), particles = [];
  const cam = { x: 0, y: 0 };
  let tick = 0, doneFor = 0, flash = 0;

  // The camera leads the yak a little; at the summit it frames the yak under the flags.
  const aim = () => (run.done
    ? { x: Math.max(0, Math.min(level.width - W, level.summit.x + 24 - W / 2)), y: run.y - 156 }
    : { x: Math.max(0, Math.min(level.width - W, run.x - 120 + run.face * 16)), y: run.y - 120 });
  const snap = () => Object.assign(cam, aim());

  // Put the yak on the ground at x (capture tests and ?scene=play&at=…); cairns behind it count as passed.
  function place(x) {
    Object.assign(run, { x, y: floorAt(level, x), vx: 0, vy: 0, ground: true, munch: 0 });
    run.check = level.cairns.reduce((k, c, i) => (c.x <= x ? i : k), -1);
    snap();
  }

  function effects() {
    const snowy = zoneAt(level, run.x) === 'snow';
    for (const e of run.events) {
      game.sound.play(e); // sound.js has one effect per event
      if (e === 'hop') spawn(particles, snowy ? 'snow' : 'dust', run.x - run.face * 4, run.y - 2, 1, tick);
      else if (e === 'land') spawn(particles, snowy ? 'snow' : 'dust', run.x, run.y - 2, 2, tick);
      else if (e === 'munch') spawn(particles, 'leaf', run.x + run.face * 13, run.y - 6, 5, tick);
      else if (e === 'checkpoint') { const c = level.cairns[run.check]; spawn(particles, 'sparkle', c.x, c.y - 30, 4, tick); }
      else if (e === 'fall') { snap(); flash = 16; }
      else if (e === 'summit') { spawn(particles, 'sparkle', level.summit.x + 24, level.summit.y - 40, 8, tick); game.sound.music('summit', { fade: 0.2 }); }
    }
  }

  function hud(g) {
    const ink = C(M.INK, 1), white = C(M.WHITE, 4);
    drawSprite(g, 'icon', 'tuft', 6, 5);
    text(g, `${run.tufts}/${level.tufts.length}`, 19, 6, white, { outline: ink });
    ui.bar(g, 110, 7, 96, level.summit ? (run.x - level.start.x) / (level.summit.x - level.start.x) : 0);
    drawSprite(g, 'icon', 'peak', 209, 4);
    if (game.record.timer) {
      text(g, clock(run.tick), W - 6, 6, white, { align: 'right', outline: ink });
      drawSprite(g, 'icon', 'clock', W - 52, 5);
    }
  }

  const scene = {
    name: 'play', run, place,
    enter() { if (save) { loadRun(run, save); snap(); } else if (at) place(at); else snap(); },
    update() {
      if (input.pressed('start')) { director.push(pauseOverlay(game)); return; }
      if (!run.done) game.trailMusic();
      step(run, level, { left: input.down('left'), right: input.down('right'), hop: game.hop(), hopHeld: game.hopHeld() }, game.tune());
      effects();
      scene.animate();
      if (run.done && ++doneFor === 75) director.push(finishOverlay(game, run));
    },
    // Pause freezes everything; under the finish panel the flags keep waving.
    idle() { if (run.done) scene.animate(); },
    animate() {
      tick++;
      const a = aim();
      cam.x += (a.x - cam.x) * 0.12;
      cam.y += (a.y - cam.y) * 0.1;
      updateBirds(birds, run, tick);
      updateParticles(particles);
      if (flash > 0) flash--;
    },
    draw(g) {
      world.draw(g, { x: Math.round(cam.x), y: Math.round(cam.y) }, tick, { run, birds, particles });
      if (flash) ditherFill(g, flash, C(M.INK, 0));
      hud(g);
    },
  };
  return scene;
}
