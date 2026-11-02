// design/palette.js — Yak Trail's palette: the code twin of design/art.md. Started from the GBA Bright
// library palette (designs/art/gba-bright); Yak Trail's own materials are the ids from 100 up.
// Every sprite paints MATERIAL ids from M; each material is a 5-stop ramp (dark → light) with
// cool shadows / warm highlights. Sprite code never holds RGB: it paints materials, and C(mat, shade)
// gives UI code a ramp stop as a CSS colour.

import { hexRgb } from '../../../engine/art/pix.js';

export const M = {
  INK: 1, SKIN: 2, HAIR: 3, TUNIC: 4, WHITE: 5, NAVY: 6, RUST: 7, GOLD: 8, BOOT: 9,
  ZHAIR: 10, SILK: 11, FUR: 12, ABLUE: 13, ASKIN: 14, SILVER: 15, EYE: 16, BONE: 17,
  STONE: 18, STONE2: 19, MOSS: 20, LEAF: 21, ORCHID: 22, HAZE: 23, WATER: 24, FIRE: 25,
  ICE: 26, THUNDER: 27, EARTH: 28, SOUL: 29, JADE: 30, PAPER: 31, LACQ: 32, PANEL: 33,
  SKY: 34, DUSK: 35, SHELL: 36, WOOD: 37, BLOOD: 38, IRIS: 39, CLOUD: 40,
  // Yak Trail
  YAK: 100, DAY: 101, PEAKS: 102, RIDGE: 103, GRASS: 104, FLAG: 105,
};

const HEX = {
  [M.INK]: ['#06050d', '#0c1024', '#1b2040', '#2c345e', '#46507e'],
  [M.SKIN]: ['#6b2f30', '#a8513f', '#dc8a5e', '#f5b98a', '#ffe3bf'],
  [M.HAIR]: ['#5c1a0e', '#a63a10', '#e66716', '#ff9c2c', '#ffd57a'],
  [M.TUNIC]: ['#3a0b18', '#78151e', '#bc2f1e', '#e8592a', '#ff8f4c'],
  [M.WHITE]: ['#383c62', '#767ba3', '#b6bbd0', '#e4e7f0', '#ffffff'],
  [M.NAVY]: ['#090b22', '#151c46', '#22316f', '#37509e', '#5c7cd0'],
  [M.RUST]: ['#2a0f12', '#4f1e19', '#7f3521', '#aa5531', '#d27f4a'],
  [M.GOLD]: ['#3d1f07', '#7c4a10', '#c98b1d', '#f4c443', '#fff2a6'],
  [M.BOOT]: ['#170c0f', '#301719', '#522a22', '#7a452f', '#a36a44'],
  [M.ZHAIR]: ['#1d0b33', '#3f176a', '#6b2ba8', '#9d55d8', '#d39cff'],
  [M.SILK]: ['#3a2c5c', '#6c5c96', '#a69dc9', '#ddd5f1', '#fffbff'],
  [M.FUR]: ['#121126', '#232543', '#383c63', '#555d87', '#7b86ad'],
  [M.ABLUE]: ['#0a173c', '#113478', '#1d5fba', '#3b93e8', '#8dd0ff'],
  [M.ASKIN]: ['#2d1925', '#56343d', '#84565b', '#b27f7b', '#dbaca2'],
  [M.SILVER]: ['#292b3b', '#4c5168', '#7b829b', '#b3b9cd', '#eaeef7'],
  [M.EYE]: ['#4a0610', '#930d18', '#e51e26', '#ff6a3c', '#ffd08a'],
  [M.BONE]: ['#3a2e25', '#6f5b45', '#a68b69', '#d4bd95', '#f7edd1'],
  [M.STONE]: ['#121520', '#232b34', '#38454c', '#566861', '#839280'],
  [M.STONE2]: ['#1f1d26', '#3a3740', '#5d5a5d', '#8a8478', '#c2b8a0'],
  [M.MOSS]: ['#0b1a13', '#153323', '#234f2f', '#3d7a39', '#6cae4b'],
  [M.LEAF]: ['#0a1711', '#15311b', '#295627', '#4a8c31', '#8ac74c'],
  [M.ORCHID]: ['#2b0c31', '#5b1b5e', '#9b3492', '#da63c3', '#ffaeea'],
  [M.HAZE]: ['#1d0c3b', '#3b1a70', '#6b36b3', '#a46cf0', '#e4bfff'],
  [M.WATER]: ['#06131e', '#0c2a3d', '#14506b', '#2a869c', '#77cdcf'],
  [M.FIRE]: ['#3b0805', '#931c08', '#e44a0c', '#ff9d20', '#fff275'],
  [M.ICE]: ['#0e2449', '#1f4f8c', '#3b8ed2', '#88d3f6', '#eeffff'],
  [M.THUNDER]: ['#2a1447', '#5c2b90', '#a462e2', '#f3e463', '#ffffdc'],
  [M.EARTH]: ['#25150c', '#4b2d15', '#7c4e21', '#b27c35', '#e2b362'],
  [M.SOUL]: ['#061d2d', '#0c4458', '#17818e', '#3acbc9', '#adfff1'],
  [M.JADE]: ['#062418', '#0d4b2f', '#17834c', '#31cb7b', '#a6ffcb'],
  [M.PAPER]: ['#4b3521', '#8b6b45', '#c9a979', '#edd8a6', '#fff7de'],
  [M.LACQ]: ['#2b0611', '#5e0f1d', '#9e1d27', '#d43c35', '#f9795b'],
  [M.PANEL]: ['#07070e', '#0f0f1d', '#19192f', '#252843', '#353a5d'],
  [M.SKY]: ['#0b0a1f', '#16173a', '#252d5a', '#3b4f7e', '#6688a6'],
  [M.DUSK]: ['#3a1640', '#6e2453', '#b0405a', '#e8705a', '#ffb070'],
  [M.SHELL]: ['#1a1a1c', '#33312f', '#575249', '#857c6a', '#b8ad91'],
  [M.WOOD]: ['#1c0f0b', '#3a1f14', '#5e3420', '#8a5430', '#b88152'],
  [M.BLOOD]: ['#2a0308', '#5c0712', '#9b0f1c', '#d0252a', '#ff6a55'],
  [M.IRIS]: ['#071533', '#123a74', '#2368b8', '#4fa2ea', '#b0e2ff'],
  [M.CLOUD]: ['#1e1b3a', '#3b3864', '#6a6794', '#a5a3c4', '#e8e6f6'],
  // Yak Trail
  [M.YAK]: ['#1a0c0c', '#341a15', '#55301f', '#80492c', '#ad6d40'],     // the yak's coat
  [M.DAY]: ['#2c5aa8', '#4479c8', '#6a9fe0', '#98c6f0', '#cbe6fa'],     // the daytime sky, top → horizon
  [M.PEAKS]: ['#3b4380', '#4e5c9c', '#6a7cba', '#8ca0d2', '#b4c6e8'],   // far mountains in the haze
  [M.RIDGE]: ['#1d2c48', '#2a405e', '#3b5876', '#55748e', '#7a9aac'],   // the nearer ridge
  [M.GRASS]: ['#143820', '#215e29', '#38872e', '#64b23a', '#a4db5a'],   // meadow grass
  [M.FLAG]: ['#3a1030', '#7a1f4a', '#c8385a', '#f06a6a', '#ffb0a0'],    // the summit bunting
};

export const RAMPS = {};
export const HEXRAMPS = HEX;
for (const [k, v] of Object.entries(HEX)) RAMPS[k] = v.map(hexRgb);

// Emissive materials: never darkened by creases, no rim shift.
export const GLOW = new Set([M.EYE, M.FIRE, M.ICE, M.THUNDER, M.SOUL, M.JADE, M.HAZE]);

// Shorthand for a CSS color of a ramp stop.
export const C = (mat, shade) => HEX[mat][shade];

// Standard finish options for characters / props / effects.
export const FIN = { ramps: RAMPS, glow: GLOW, outline: '#0c1024', rim: 'top' };
export const FIN_FX = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: false, crease: false };
export const FIN_FLAT = { ramps: RAMPS, glow: GLOW, outline: null, rim: false, crease: false };
