// assets.js — what Pixel Yak lists for {{NAME}}. Generated from the art contract (game/sprites.js),
// so every new ART entry appears in the studio by itself.
import { ARTKIT } from './game/sprites.js';

export const STUDIO = ARTKIT.studioMeta();

export const ASSET_CATEGORIES = [
  { id: 'all', label: 'All assets' },
  { id: 'character', label: 'Characters' },
  { id: 'enemy', label: 'Enemies' },
  { id: 'tileset', label: 'Tiles' },
  { id: 'prop', label: 'Props' },
  { id: 'vfx', label: 'Effects' },
  { id: 'ui', label: 'UI' },
];

export const ASSETS = ARTKIT.studioAssets();
