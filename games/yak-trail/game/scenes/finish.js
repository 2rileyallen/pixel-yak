// scenes/finish.js — the summit panel: your time, the tufts you munched, and the best so far (kept in
// the browser). Again · Title.
import { text } from '../../engine/shell/font.js';
import { drawSprite } from '../sprites.js';
import { clock } from '../sim.js';
import { W } from '../world.js';
import { C, M } from '../../design/palette.js';

export function finishOverlay(game, run) {
  const { input, record, ui, level } = game;
  const best = record.best == null || run.doneTick < record.best;
  if (best) record.best = run.doneTick;
  record.bestTufts = Math.max(record.bestTufts || 0, run.tufts);
  game.save();
  const items = ['Again', 'Title'];
  let sel = 0, t = 0;

  return {
    name: 'finish', best,
    update() {
      t++;
      if (input.pressed('left') || input.pressed('right')) sel = 1 - sel;
      if (game.ok()) (sel ? game.title : game.play)();
      else if (game.back()) game.title();
    },
    draw(g) {
      const pw = 152, ph = 92, x = Math.round((W - pw) / 2), y = 18;
      const white = C(M.WHITE, 4), gold = C(M.GOLD, 3), ink = C(M.INK, 0);
      ui.panel(g, x, y, pw, ph);
      text(g, 'SUMMIT!', W / 2, y + 8, gold, { align: 'center', scale: 2, shadow: ink });
      drawSprite(g, 'icon', 'clock', x + 18, y + 32);
      text(g, clock(run.doneTick), x + 32, y + 33, white, { shadow: ink });
      if (best && Math.floor(t / 20) % 2 === 0) text(g, 'NEW BEST', x + pw - 16, y + 33, gold, { align: 'right', shadow: ink });
      else if (!best) text(g, `[m]best[/] ${clock(record.best)}`, x + pw - 16, y + 33, white, { align: 'right', shadow: ink });
      drawSprite(g, 'icon', 'tuft', x + 18, y + 46);
      text(g, `${run.tufts}/${level.tufts.length} munched`, x + 32, y + 47, white, { shadow: ink });
      items.forEach((it, i) => {
        const bx = x + 18 + i * 62, by = y + 68;
        if (i === sel) ui.panel(g, bx - 6, by - 4, 56, 16, 'focus');
        text(g, it, bx + 22, by, i === sel ? white : C(M.WHITE, 3), { align: 'center', shadow: ink });
      });
    },
  };
}
