// game/scenes/play.js — draws the world. A scene reads the world's state (never changes it: that is
// the systems' job) and draws it from the art registry. The placeholder shows every registered
// sprite, animating from the clock system, until the first playable replaces it.
import { text } from '../../engine/shell/font.js';
import { ART, sprite } from '../sprites.js';

export function draw(g, world, { W, H, tune }) {
  g.fillStyle = '#0c1024';
  g.fillRect(0, 0, W, H);
  const ticks = world.state.clock ? world.state.clock.ticks : world.tick;
  let x = 8, y = 20, rowH = 0;
  for (const [id, e] of Object.entries(ART)) {
    if (id === 'font' || id.startsWith('ui_')) continue; // the font and widgets show as text and boxes, not in this gallery
    const frames = (e.anims && e.anims[e.defaultAnim]) || e.poses;
    const c = sprite(id, frames[Math.floor(ticks / tune.frameTicks) % frames.length] || frames[0]);
    if (x + c.width > W - 8) { x = 8; y += rowH + 8; rowH = 0; }
    g.drawImage(c, x, y);
    x += c.width + 8; rowH = Math.max(rowH, c.height);
  }
  text(g, {{NAMEJS}}, 8, 6, '#e8e4ff');
}
