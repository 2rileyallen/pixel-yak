// assets.js — what Pixel Yak lists for Yak Trail. Generated from the art contract (game/sprites.js),
// so every new ART entry appears in the studio by itself.
import { ARTKIT } from './game/sprites.js';

export const STUDIO = ARTKIT.studioMeta();

export const ASSET_CATEGORIES = [
  { id: 'all', label: 'All assets' },
  { id: 'character', label: 'Characters' },
  { id: 'tileset', label: 'Ground' },
  { id: 'prop', label: 'On the trail' },
  { id: 'backdrop', label: 'Backdrops' },
  { id: 'vfx', label: 'Effects' },
  { id: 'ui', label: 'UI' },
];

export const ASSETS = ARTKIT.studioAssets();
