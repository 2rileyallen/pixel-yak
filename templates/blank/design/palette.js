// design/palette.js — this game's palette: the code twin of design/art.md. Materials are 5-stop
// ramps, dark → light; sprites paint material + shade (engine/art/pix.js), never raw colours, so
// changing a ramp here recolours every sprite (and the user's edits, which store material refs).
import { hexRgb } from '../engine/art/pix.js';

export const M = { INK: 1, SKIN: 2, HAIR: 3, CLOTH: 4, METAL: 5, GLOW: 6 };
export const HEXRAMPS = {
  [M.INK]: ['#06050d', '#0c1024', '#1b2040', '#2c345e', '#46507e'],
  [M.SKIN]: ['#6b2f30', '#a8513f', '#dc8a5e', '#f5b98a', '#ffe3bf'],
  [M.HAIR]: ['#5c1a0e', '#a63a10', '#e66716', '#ff9c2c', '#ffd57a'],
  [M.CLOTH]: ['#090b22', '#151c46', '#22316f', '#37509e', '#5c7cd0'],
  [M.METAL]: ['#292b3b', '#4c5168', '#7b829b', '#b3b9cd', '#eaeef7'],
  [M.GLOW]: ['#061d2d', '#0c4458', '#17818e', '#3acbc9', '#adfff1'],
};
export const RAMPS = {};
for (const [k, v] of Object.entries(HEXRAMPS)) RAMPS[k] = v.map(hexRgb);
export const GLOW = new Set([M.GLOW]);
export const FIN = { ramps: RAMPS, glow: GLOW, outline: '#0c1024', rim: 'top' };
