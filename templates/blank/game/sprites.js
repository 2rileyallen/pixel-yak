// game/sprites.js — THE ART CONTRACT for {{NAME}} (engine/art/registry.js, docs/contracts/ART.md).
// Game code only calls sprite(id, pose) / drawSprite(...). Add art modules to `entries`; each new
// entry shows up in Pixel Yak by itself.
import { createArt } from '../../../engine/art/registry.js';
import { EDITS } from './art/edits/index.js';
import { M, HEXRAMPS, GLOW } from '../design/palette.js';
import { STARTER_ART } from './art/starter.js';

const MAT_NAME = Object.fromEntries(Object.entries(M).map(([name, id]) => [id, name]));

export const ARTKIT = createArt({
  project: '{{ID}}',
  entries: {
    ...STARTER_ART,
  },
  palette: { materials: M, ramps: HEXRAMPS, glow: [...GLOW].map((mid) => MAT_NAME[mid]) },
  edits: EDITS,
  editsModule: new URL('./art/edits/index.js', import.meta.url).href,
});

export const { ART, sprite, animPose, drawSprite, clearArtCache } = ARTKIT;
