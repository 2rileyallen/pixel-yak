// art/starter.js — a placeholder sprite proving the art pipeline (generator → Pixel Yak edits →
// game). Replace or delete it once the real art arrives. Paints materials + shades from the
// game's own palette (design/palette.js), never raw colours.
import { Pix } from '../../../../engine/art/pix.js';
import { M, FIN } from '../../design/palette.js';

const first = (...names) => names.map((n) => M[n]).find((v) => v != null) ?? Object.values(M)[1];

function drawMarker(pose) {
  const p = new Pix(16, 16);
  const bob = pose === 'idle_1' ? 1 : 0;
  p.ball(8, 7 + bob, 5, 5, first('GLOW', 'SOUL', 'SKY', 'CLOTH'), { bias: 0.05 });
  p.layer();
  p.rect(7, 12 + bob, 2, 2, first('METAL', 'GOLD', 'STONE'), 3);
  return p.finish(FIN);
}

export const STARTER_ART = {
  starter_marker: {
    name: 'Starter marker (placeholder)',
    category: 'ui',
    tags: ['placeholder'],
    fw: 16, fh: 16, ax: 8, ay: 15,
    poses: ['idle_0', 'idle_1'],
    anims: { idle: ['idle_0', 'idle_1'] },
    defaultAnim: 'idle',
    description: 'Proves generator → studio edits → game works for this game.',
    gen: { style: '{{ID}}', v: 1, by: 'template', date: '{{DATE}}' },
    draw: drawMarker,
  },
};
