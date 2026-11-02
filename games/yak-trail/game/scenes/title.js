// scenes/title.js — the title: the foot of the trail, the yak grazing, the logo, the best run so far.
// Space / Enter / pad A starts.
import { text } from '../../../../engine/shell/font.js';
import { drawSprite, animPose } from '../sprites.js';
import { makeBirds, W } from '../world.js';
import { clock } from '../sim.js';
import { C, M } from '../../design/palette.js';

export function titleScene(game) {
  const { level, world, record } = game;
  const cam = { x: 0, y: level.start.y - 132 };
  const yak = { x: level.start.x + 56, y: level.start.y, face: 1 };
  const birds = makeBirds(level);
  let t = 0;
  return {
    name: 'title',
    update() {
      t++;
      if (game.ok() || game.input.padPressed(9)) game.play();
    },
    draw(g) {
      // the yak idles, then dips its head for a munch now and then
      const pose = t % 300 < 220 ? animPose('yak', 'idle', t, 4) : animPose('yak', 'munch', t, 3);
      world.draw(g, cam, t, { run: yak, pose, birds });
      drawSprite(g, 'title_logo', 'logo', W / 2, 18);
      const ink = C(M.INK, 1);
      if (Math.floor(t / 32) % 2 === 0) text(g, 'PRESS SPACE', W / 2, 74, C(M.WHITE, 4), { align: 'center', outline: ink });
      if (record.best != null) {
        text(g, `[g]BEST[/] ${clock(record.best)}   [g]TUFTS[/] ${record.bestTufts}/${level.tufts.length}`, W / 2, 160, C(M.WHITE, 4), { align: 'center', outline: ink });
      }
    },
  };
}
