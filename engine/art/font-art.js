// engine/art/font-art.js — the engine's pixel font as an art entry, so the user can repaint it in
// Pixel Yak like any sprite. One pose per glyph (6×9: cap height 7, two rows of descender), grouped
// into anims (upper, lower, digits, symbols) so the Art view can step through a set. Register it and
// switch the font over in two lines:
//   entries: { ...fontArt({ ink: M.WHITE, fin: FIN }) }          (game/sprites.js)
//   useFontArt(sprite);                                           (game/main.js, engine/shell/font.js)
// Paint glyphs in the ink's lightest stop: text colour multiplies onto it, so white takes the colour
// exactly and darker pixels shade the text. A glyph keeps its built-in width, or grows when the user
// paints past it (up to the frame's 6 px).
import { Pix } from './pix.js';
import { GLYPHS, glyphName } from '../shell/font.js';

const FW = 6, FH = 9;

// ink: the material glyphs are painted in · shade: its stop (4 = lightest) · fin: the game's finish
// options (only its ramps are used: glyphs get no outline, rim or crease).
export function fontArt({ ink, shade = 4, fin, id = 'font', gen = null } = {}) {
  if (!ink || !fin || !fin.ramps) throw new Error('fontArt needs { ink: <material id>, fin: { ramps } }');
  const rows = new Map(Object.entries(GLYPHS).map(([ch, src]) => [glyphName(ch), src.split('/')]));
  const poses = [...rows.keys()];
  const group = (re) => Object.keys(GLYPHS).filter((ch) => re.test(ch)).map(glyphName);
  const anims = {
    upper: group(/^[A-Z]$/),
    lower: group(/^[a-z]$/),
    digits: group(/^[0-9]$/),
    symbols: group(/^[^A-Za-z0-9]$/),
  };
  return {
    [id]: {
      name: 'Pixel font',
      category: 'ui',
      tags: ['font', 'ui', 'text'],
      fw: FW, fh: FH, ax: 0, ay: 6, // anchor on the baseline
      poses, anims, defaultAnim: 'upper',
      description: 'Every letter the game writes. Paint in white: text colours tint it. Paint past a letter\'s right edge to make it wider.',
      gen,
      draw(pose) {
        const p = new Pix(FW, FH);
        (rows.get(pose) || []).forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') p.set(x, y, ink, shade); });
        return p.finish({ ramps: fin.ramps, glow: fin.glow, outline: null, rim: false, crease: false });
      },
    },
  };
}
