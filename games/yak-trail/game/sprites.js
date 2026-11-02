// game/sprites.js — THE ART CONTRACT for Yak Trail (engine/art/registry.js, docs/contracts/ART.md).
// Game code only calls sprite(id, pose) / drawSprite(...). Every entry shows up in Pixel Yak by
// itself — including the font and the UI widgets, so the user can repaint the text and the boxes too.
import { createArt } from '../../../engine/art/registry.js';
import { fontArt } from '../../../engine/art/font-art.js';
import { widgetArt } from '../../../engine/art/widget-art.js';
import { EDITS } from './art/edits/index.js';
import { M, HEXRAMPS, GLOW, FIN } from '../design/palette.js';
import { YAK_ART } from './art/yak.js';
import { TRAIL_ART } from './art/trail.js';
import { SKY_ART } from './art/sky.js';
import { CRITTER_ART } from './art/critters.js';
import { UI_ART } from './art/ui.js';

const gen = { style: 'yak-trail', v: 1, by: 'engine', date: '2026-11-02' }; // the engine's default font and widgets
const MAT_NAME = Object.fromEntries(Object.entries(M).map(([name, id]) => [id, name]));

export const ARTKIT = createArt({
  project: 'yak-trail',
  entries: {
    ...YAK_ART,
    ...CRITTER_ART,
    ...TRAIL_ART,
    ...SKY_ART,
    ...UI_ART,
    ...fontArt({ ink: M.WHITE, fin: FIN, gen }),
    ...widgetArt({ M, fin: FIN, gen }),
  },
  palette: { materials: M, ramps: HEXRAMPS, glow: [...GLOW].map((mid) => MAT_NAME[mid]) },
  edits: EDITS,
  editsModule: new URL('./art/edits/index.js', import.meta.url).href,
});

export const { ART, sprite, animPose, drawSprite, clearArtCache } = ARTKIT;
