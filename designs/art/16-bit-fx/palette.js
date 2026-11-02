// designs/art/16-bit-fx/palette.js — the 16-Bit FX palette: the code twin of this DESIGN.md.
// A dark, moody 16-bit world lit by its own fires and magic: shadows lean blue-violet, lights lean
// warm, the stone is near-black so light pools carry the room. Emissive materials (EMBER, CRYSTAL,
// MAGIC, RUNE, GLOW) paint their own light and feed the pixel-FX light pass (fx.js); LWARM and
// LCOOL are the colours that pass adds. Every material is a 5-stop ramp (0 line/crevice, 1 shadow,
// 2 base, 3 lit, 4 highlight); sprites paint MATERIAL + SHADE, never RGB. A game copies this file
// into its design/ folder and makes it its own: game-only materials take ids >= 100. Keep every hex
// unique (the studio reads painted pixels back by colour).
import { hexRgb } from '../../../engine/art/pix.js';

export const M = {
  INK: 1, SKIN: 2, HAIR: 3, CLOTH: 4, RED: 5, TEAL: 6, DARK: 7, WHITE: 8,
  LEATHER: 9, STEEL: 10, GOLD: 11, BONE: 12, WOOD: 13,
  WALL: 14, FLOOR: 15, ROCK: 16, MOSS: 17, WATER: 18, FOG: 19,
  EMBER: 20, CRYSTAL: 21, MAGIC: 22, RUNE: 23, GLOW: 24, LWARM: 25, LCOOL: 26, PANEL: 27,
};

const HEX = {
  [M.INK]: ['#040309', '#0b0a18', '#17152c', '#262444', '#3b3962'],
  [M.SKIN]: ['#2b1519', '#6e3f45', '#b37a6a', '#e3b195', '#f8dcc4'],
  [M.HAIR]: ['#0e0806', '#24140e', '#43271a', '#6a412a', '#966242'],
  [M.CLOTH]: ['#070a1b', '#121a3b', '#202d5f', '#34498b', '#5672b6'],
  [M.RED]: ['#2b0409', '#5f0b13', '#9d1521', '#d52b31', '#ff6b5b'],
  [M.TEAL]: ['#051311', '#0b2b27', '#134741', '#206b5f', '#3b9b87'],
  [M.DARK]: ['#040407', '#0d0d15', '#1a1a27', '#2e2f41', '#4b4d67'],
  [M.WHITE]: ['#2c303e', '#6a7089', '#afb5c8', '#e0e4ef', '#fafbff'],
  [M.LEATHER]: ['#130a07', '#2b170f', '#4b2919', '#6f4127', '#99613d'],
  [M.STEEL]: ['#191c25', '#3a404f', '#6a7285', '#a9b1c2', '#e6ebf3'],
  [M.GOLD]: ['#2b1b07', '#634110', '#a1701f', '#dcab45', '#fde7a1'],
  [M.BONE]: ['#3b2f26', '#705c46', '#a98e6b', '#d6c196', '#f8efd3'],
  [M.WOOD]: ['#120a07', '#28180f', '#462a18', '#694026', '#8f5d39'],
  // the world: near-black stone so the light carries the room
  [M.WALL]: ['#08070b', '#16131b', '#272129', '#3d3539', '#5b4f4d'],
  [M.FLOOR]: ['#070609', '#131119', '#1f1b25', '#2f2935', '#473f49'],
  [M.ROCK]: ['#030307', '#0a090f', '#14121a', '#201c26', '#2d2733'],
  [M.MOSS]: ['#050c09', '#0e1f16', '#1a3424', '#2c4f33', '#476e45'],
  [M.WATER]: ['#030a12', '#071a2a', '#0f3046', '#1d4f68', '#3a7a90'],
  [M.FOG]: ['#0b0d17', '#181c2e', '#272d45', '#3b4361', '#576181'],
  // emissive: fire, crystal, magic, runes, spirit glow; and the light-pass colours
  [M.EMBER]: ['#3c0906', '#941d09', '#e54b0d', '#ff9e21', '#fff376'],
  [M.CRYSTAL]: ['#0a1f3f', '#14438a', '#2b7fd6', '#7ccaff', '#e3f7ff'],
  [M.MAGIC]: ['#1f0c4b', '#4b1f9d', '#7d46e7', '#b58dff', '#f0e3ff'],
  [M.RUNE]: ['#210305', '#4b070b', '#8b0f15', '#d1292b', '#ff7159'],
  [M.GLOW]: ['#04312d', '#087b6d', '#1bd1b5', '#7dffe1', '#e1fff9'],
  [M.LWARM]: ['#140703', '#2a1208', '#45200d', '#653214', '#ffb062'],
  [M.LCOOL]: ['#03070f', '#08111f', '#0f1d33', '#1a2d4a', '#7fa8ff'],
  [M.PANEL]: ['#06060c', '#0e0d18', '#181627', '#25223a', '#363352'],
};

export const HEXRAMPS = HEX;
export const RAMPS = {};
for (const [k, v] of Object.entries(HEX)) RAMPS[k] = v.map(hexRgb);

// Emissive materials: never darkened by creases, no rim shift, and never dimmed by the light pass.
export const GLOW = new Set([M.EMBER, M.CRYSTAL, M.MAGIC, M.RUNE, M.GLOW, M.LWARM, M.LCOOL]);

// Shorthand for a CSS colour of a ramp stop (for code-drawn UI and light, never for sprites).
export const C = (mat, shade) => HEX[mat][shade];

// Finishes: a selective outline (each edge pixel takes the darkest stop of what it touches) and the
// top rim for solid things; effects get a self-coloured edge; tiles and haze no outline.
export const FIN = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: 'top' };
export const FIN_FX = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: false, crease: false };
export const FIN_FLAT = { ramps: RAMPS, glow: GLOW, outline: null, rim: false, crease: false };
