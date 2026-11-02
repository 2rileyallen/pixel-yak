// scenes/pause.js — Esc while climbing: everything under it freezes. Resume · Help · Timer on/off ·
// Restart · Title. Help (how to play) lives here and only here: it scrolls, with a scrollbar.
import { text, wrap, LINE_H } from '../../../../engine/shell/font.js';
import { ditherFill } from '../../../../engine/shell/runtime.js';
import { W, H } from '../world.js';
import { C, M } from '../../design/palette.js';

const HELP = [
  '[g]TROT[/]  ← → or A D, or the stick',
  '[g]HOP[/]  Space, ↑ or W, or pad A. Hold it to hop higher.',
  '[g]PAUSE[/]  Esc, or pad Menu',
  '',
  'Trot onto a grass tuft to munch it. Hop over it if you are in a hurry.',
  'Rocks and ledges need a hop. So do the gaps: fall in one and you are back at the last cairn you passed.',
  'Reach the flags at the top of the mountain.',
  '',
  '[m]Yak Trail is the demo game of Pixel Yak. Every pixel is drawn by code, and you can paint over all of it in the studio — even these letters.[/]',
];

export function pauseOverlay(game) {
  const { input, director, record, ui } = game;
  const items = ['Resume', 'Help', 'Timer', 'Restart', 'Title'];
  let sel = 0, help = -1; // help: the first line shown, -1 = closed
  const pw = 212, inner = pw - 36;
  const lines = HELP.flatMap((l) => (l ? wrap(l, inner) : ['']));
  const shown = 9;

  const back = () => game.back() || input.keyPressed('KeyP');
  function choose() {
    const it = items[sel];
    if (it === 'Resume') director.pop();
    else if (it === 'Help') help = 0;
    else if (it === 'Timer') { record.timer = !record.timer; game.save(); }
    else if (it === 'Restart') game.play();
    else if (it === 'Title') game.title();
  }

  return {
    name: 'pause',
    update() {
      if (help >= 0) {
        if (input.repeat('down')) help = Math.min(Math.max(0, lines.length - shown), help + 1);
        if (input.repeat('up')) help = Math.max(0, help - 1);
        if (back() || game.ok()) help = -1;
        return;
      }
      if (input.repeat('down')) sel = (sel + 1) % items.length;
      if (input.repeat('up')) sel = (sel + items.length - 1) % items.length;
      if (back()) director.pop();
      else if (game.ok()) choose();
    },
    draw(g) {
      ditherFill(g, 8, C(M.INK, 0));
      const white = C(M.WHITE, 4), gold = C(M.GOLD, 3), ink = C(M.INK, 0);
      if (help >= 0) {
        const ph = shown * LINE_H + 34, x = (W - pw) / 2, y = (H - ph) / 2;
        ui.panel(g, x, y, pw, ph);
        text(g, 'HOW TO PLAY', W / 2, y + 8, gold, { align: 'center', shadow: ink });
        lines.slice(help, help + shown).forEach((l, i) => text(g, l, x + 10, y + 22 + i * LINE_H, white, { shadow: ink }));
        ui.scrollbar(g, x + pw - 15, y + 22, shown * LINE_H - 2, help, shown, lines.length);
        return;
      }
      const pw2 = 112, ph = 26 + items.length * 14, x = Math.round((W - pw2) / 2), y = Math.round((H - ph) / 2);
      ui.panel(g, x, y, pw2, ph);
      text(g, 'PAUSED', W / 2, y + 8, gold, { align: 'center', shadow: ink });
      items.forEach((it, i) => {
        const ry = y + 22 + i * 14;
        if (i === sel) ui.panel(g, x + 8, ry - 4, pw2 - 16, 16, 'focus');
        text(g, it, x + 16, ry, i === sel ? white : C(M.WHITE, 3), { shadow: ink });
        if (it === 'Timer') ui.checkbox(g, x + pw2 - 25, ry - 1, record.timer);
      });
    },
  };
}
