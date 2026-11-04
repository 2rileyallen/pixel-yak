// game/sprites.js — THE ART CONTRACT for {{NAME}} (engine/art/registry.js, docs/contracts/ART.md).
// Game code only calls sprite(id, pose) / drawSprite(...). Add art modules to `entries`; each new
// entry shows up in Pixel Yak by itself — the font and the UI widgets too, so the user can repaint
// the letters and the boxes like any sprite.
import { createArt } from '../engine/art/registry.js';
import { fontArt } from '../engine/art/font-art.js';
import { widgetArt } from '../engine/art/widget-art.js';
import { EDITS } from './art/edits/index.js';
import { M, HEXRAMPS, GLOW, FIN } from '../design/palette.js';
import { STARTER_ART } from './art/starter.js';

const MAT_NAME = Object.fromEntries(Object.entries(M).map(([name, id]) => [id, name]));
const gen = { style: '{{ID}}', v: 1, by: 'engine', date: '{{DATE}}' }; // the engine's default font and widgets
// the font is painted in the palette's lightest ink (text colour multiplies onto it)
const INK = M.WHITE ?? M.METAL ?? M.SILVER ?? Object.values(M)[0];

export const ARTKIT = createArt({
  project: '{{ID}}',
  entries: {
    ...STARTER_ART,
    ...fontArt({ ink: INK, fin: FIN, gen }),
    ...widgetArt({ M, fin: FIN, gen }),
  },
  palette: { materials: M, ramps: HEXRAMPS, glow: [...GLOW].map((mid) => MAT_NAME[mid]) },
  edits: EDITS,
  editsModule: new URL('./art/edits/index.js', import.meta.url).href,
});

export const { ART, sprite, animPose, drawSprite, clearArtCache } = ARTKIT;
