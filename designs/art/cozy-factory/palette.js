// designs/art/cozy-factory/palette.js — the Cozy Factory palette: the code twin of this DESIGN.md.
// Calm, warm ground that stays out of the way; walls darker than the floor so open space reads;
// one material family per era of tech (primitive: wood, clay, rope, stone, hide; industrial: iron
// with copper accents); goods in bright, distinct colours so the player sees what the factory made;
// three dim light-pool ramps for warm, gold and teal light at the sprites' own resolution.
// Every material is a 5-stop ramp (0 crease … 4 highlight); sprites paint MATERIAL + SHADE, never
// RGB. A game copies this file into its design/ folder and makes it its own: game-only materials
// take ids >= 100. Keep every hex unique (the studio reads painted pixels back by colour).
import { hexRgb } from '../../../engine/art/pix.js';

export const M = {
  INK: 1, SKIN: 2, HAIR: 3, CLOTH: 4, WHITE: 5,
  GROUND: 6, ROCK: 7, HARD: 8, BED: 9, GRASS: 10, LEAF: 11, WATER: 12,
  WOOD: 13, CLAY: 14, STONE: 15, EARTH: 16, ROPE: 17, HIDE: 18, BONE: 19,
  COPPER: 20, IRON: 21, GOLD: 22, GEM: 23, BANNER: 24, STEAM: 25,
  FIRE: 26, GLOW: 27, LWARM: 28, LGOLD: 29, LTEAL: 30, PANEL: 31,
};

const HEX = {
  [M.INK]: ['#06050d', '#0c1024', '#1b2040', '#2c345e', '#46507e'],
  [M.SKIN]: ['#6b2f30', '#a8513f', '#dc8a5e', '#f5b98a', '#ffe3bf'],
  [M.HAIR]: ['#5c1a0e', '#a63a10', '#e66716', '#ff9c2c', '#ffd57a'],
  [M.CLOTH]: ['#3a0b18', '#78151e', '#bc2f1e', '#e8592a', '#ff8f4c'],
  [M.WHITE]: ['#383c62', '#767ba3', '#b6bbd0', '#e4e7f0', '#ffffff'],
  // the ground: a lighter, calmer floor; rock walls darker; hard rock cool; bedrock near black
  [M.GROUND]: ['#2a1b21', '#47302d', '#664837', '#86624a', '#a8825c'],
  [M.ROCK]: ['#130b15', '#241720', '#3d2828', '#5e4033', '#82603f'],
  [M.HARD]: ['#0c0a17', '#19172c', '#2b2944', '#454262', '#6a6688'],
  [M.BED]: ['#09060c', '#140f19', '#211a27', '#2f2636', '#40354a'],
  [M.GRASS]: ['#162019', '#263a26', '#3d5a33', '#5f7d43', '#89a35c'],
  [M.LEAF]: ['#0a1711', '#15311b', '#295627', '#4a8c31', '#8ac74c'],
  [M.WATER]: ['#06131e', '#0c2a3d', '#14506b', '#2a869c', '#77cdcf'],
  // primitive tech
  [M.WOOD]: ['#1c0f0b', '#3a1f14', '#5e3420', '#8a5430', '#b88152'],
  [M.CLAY]: ['#2e1712', '#5c3020', '#8e5233', '#b97a4a', '#dfa673'],
  [M.STONE]: ['#1f1d26', '#3a3740', '#5d5a5d', '#8a8478', '#c2b8a0'],
  [M.EARTH]: ['#25150c', '#4b2d15', '#7c4e21', '#b27c35', '#e2b362'],
  [M.ROPE]: ['#4b3521', '#8b6b45', '#c9a979', '#edd8a6', '#fff7de'],
  [M.HIDE]: ['#170c0f', '#301719', '#522a22', '#7a452f', '#a36a44'],
  [M.BONE]: ['#3a2e25', '#6f5b45', '#a68b69', '#d4bd95', '#f7edd1'],
  // industrial tech and goods
  [M.COPPER]: ['#2b120d', '#5c2817', '#904426', '#c66f3c', '#eea76d'],
  [M.IRON]: ['#221a3c', '#3f3470', '#6556a6', '#9486d2', '#c8bdf2'],
  [M.GOLD]: ['#3d1f07', '#7c4a10', '#c98b1d', '#f4c443', '#fff2a6'],
  [M.GEM]: ['#2a0308', '#5c0712', '#9b0f1c', '#d0252a', '#ff6a55'],
  [M.BANNER]: ['#2b0611', '#5e0f1d', '#9e1d27', '#d43c35', '#f9795b'],
  [M.STEAM]: ['#1e1b3a', '#3b3864', '#6a6794', '#a5a3c4', '#e8e6f6'],
  // emissive: fire, magic glow, and the light pools drawn under the scene's light sources
  [M.FIRE]: ['#3b0805', '#931c08', '#e44a0c', '#ff9d20', '#fff275'],
  [M.GLOW]: ['#061d2d', '#0c4458', '#17818e', '#3acbc9', '#adfff1'],
  [M.LWARM]: ['#100503', '#22100a', '#381c10', '#522c18', '#704022'],
  [M.LGOLD]: ['#0f0a02', '#21180a', '#382a10', '#523e18', '#705622'],
  [M.LTEAL]: ['#020c0e', '#06191c', '#0c2a2e', '#143e42', '#1e5458'],
  [M.PANEL]: ['#07070e', '#0f0f1d', '#19192f', '#252843', '#353a5d'],
};

export const HEXRAMPS = HEX;
export const RAMPS = {};
for (const [k, v] of Object.entries(HEX)) RAMPS[k] = v.map(hexRgb);

// Emissive materials: never darkened by creases, no rim shift.
export const GLOW = new Set([M.FIRE, M.GLOW, M.LWARM, M.LGOLD, M.LTEAL]);

// Shorthand for a CSS colour of a ramp stop (for code-drawn UI and light, never for sprites).
export const C = (mat, shade) => HEX[mat][shade];

// Finishes: characters, buildings and props get the navy outline and the top rim; effects a
// self-coloured edge; ground tiles and light pools no outline at all.
export const FIN = { ramps: RAMPS, glow: GLOW, outline: '#0c1024', rim: 'top' };
export const FIN_FX = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: false, crease: false };
export const FIN_FLAT = { ramps: RAMPS, glow: GLOW, outline: null, rim: false, crease: false };
