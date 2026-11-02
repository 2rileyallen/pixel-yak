// designs/art/8-bit-strict/palette.js — the 8-Bit Strict palette: the code twin of this DESIGN.md.
// Every colour is an entry of the classic 8-bit console's 64-colour table (NES below), picked by
// its index ($0F black, $30 white …), so the look can't drift into colours that era never had.
// Each material is a 5-stop ramp read the 8-bit way:
//   0 outline (black)  ·  1 shadow  ·  2 main  ·  3 highlight (shiny things only)  ·  4 hot core / white
// Sprites paint MATERIAL + SHADE, never RGB, and finish with nes() so cloth and skin keep two
// tones. A game copies this file into its design/ folder and makes it its own: game-only materials
// take ids >= 100.
//
// The studio reads a painted pixel back to its material by colour, so every hex in a palette must
// be unique. Many materials share black (stop 0) or white; distinct() nudges each repeat by one
// step of blue (#000000 → #000001 …) — invisible on screen, unambiguous for the studio.
import { hexRgb } from '../../../engine/art/pix.js';

export const NES = [
  '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
  '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10', '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#000000', '#000000', '#000000',
  '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044', '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878', '#000000', '#000000',
  '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8', '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8', '#000000', '#000000',
];
const K = 0x0f; // black

export const M = {
  INK: 1, SKIN: 2, HAIR: 3, CLOTH: 4, RED: 5, GREEN: 6, PURPLE: 7, WHITE: 8,
  STEEL: 9, GOLD: 10, WOOD: 11, BRICK: 12, STONE: 13, GRASS: 14, WATER: 15, SKY: 16,
  FIRE: 17, GLOW: 18, MAGIC: 19, PANEL: 20,
};

// material: NES indices for stops 0..4
const IDX = {
  [M.INK]: [K, K, 0x00, 0x10, 0x20],
  [M.SKIN]: [K, 0x27, 0x36, 0x37, 0x30],
  [M.HAIR]: [K, 0x08, 0x07, 0x17, 0x27],
  [M.CLOTH]: [K, 0x02, 0x12, 0x21, 0x31],
  [M.RED]: [K, 0x06, 0x16, 0x26, 0x36],
  [M.GREEN]: [K, 0x0a, 0x1a, 0x2a, 0x3a],
  [M.PURPLE]: [K, 0x03, 0x13, 0x23, 0x33],
  [M.WHITE]: [K, 0x10, 0x20, 0x30, 0x30],
  [M.STEEL]: [K, 0x00, 0x10, 0x20, 0x30],
  [M.GOLD]: [K, 0x18, 0x28, 0x38, 0x30],
  [M.WOOD]: [K, 0x08, 0x18, 0x27, 0x37],
  [M.BRICK]: [K, 0x07, 0x17, 0x27, 0x37],
  [M.STONE]: [K, 0x0c, 0x00, 0x10, 0x20],
  [M.GRASS]: [K, 0x09, 0x19, 0x29, 0x39],
  [M.WATER]: [K, 0x01, 0x11, 0x21, 0x31],
  [M.SKY]: [K, 0x02, 0x22, 0x31, 0x30],
  [M.FIRE]: [0x07, 0x16, 0x27, 0x38, 0x30],
  [M.GLOW]: [0x0c, 0x1c, 0x2c, 0x3c, 0x30],
  [M.MAGIC]: [0x03, 0x13, 0x24, 0x34, 0x30],
  [M.PANEL]: [K, K, 0x02, 0x12, 0x30],
};

// Make every hex in the palette unique by nudging repeats one step of blue (see the header).
function distinct(table) {
  const seen = new Set(), out = {};
  for (const [id, ramp] of Object.entries(table)) {
    out[id] = ramp.map((i) => {
      const [r, g, b0] = hexRgb(NES[i]);
      let b = b0;
      for (let step = 1; seen.has((r << 16) | (g << 8) | b); step++) b = b0 + step <= 255 ? b0 + step : b0 - step;
      seen.add((r << 16) | (g << 8) | b);
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    });
  }
  return out;
}

export const HEXRAMPS = distinct(IDX);
export const RAMPS = {};
for (const [k, v] of Object.entries(HEXRAMPS)) RAMPS[k] = v.map(hexRgb);

// Emissive materials: never darkened by creases, no rim shift, and nes() leaves their stops alone.
export const GLOW = new Set([M.FIRE, M.GLOW, M.MAGIC]);
// Shiny materials keep a highlight (stop 3); everything else collapses to two tones.
export const SHINY = new Set([M.STEEL, M.GOLD, M.WATER]);

// Shorthand for a CSS colour of a ramp stop (for code-drawn UI, never for sprites).
export const C = (mat, shade) => HEXRAMPS[mat][shade];

// The 8-bit shading rule, run on a Pix before finish(): cloth, skin and the world get shadow +
// main; shiny things get main + highlight instead (black, grey, white); glows keep every stop.
// Either way a material is black + two colours: three, the era's limit per sprite tile.
const TONES = { flat: [0, 1, 2, 2, 2], shiny: [0, 2, 2, 3, 3] };
export function nes(p) {
  return p.map((x, y, m, s) => (GLOW.has(m) ? null : [m, (SHINY.has(m) ? TONES.shiny : TONES.flat)[s]]));
}

// The strictness check: every tile×tile block of a finished sprite may use at most `colours`
// visible colours (transparent doesn't count). Returns the blocks over the limit, [] when strict.
export function overLimit(canvas, { tile = 8, colours = 3 } = {}) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = [];
  for (let ty = 0; ty < h; ty += tile) for (let tx = 0; tx < w; tx += tile) {
    const seen = new Set();
    for (let y = ty; y < Math.min(h, ty + tile); y++) for (let x = tx; x < Math.min(w, tx + tile); x++) {
      const k = (y * w + x) * 4;
      if (d[k + 3]) seen.add((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]);
    }
    if (seen.size > colours) out.push({ x: tx, y: ty, colours: seen.size });
  }
  return out;
}

// Finishes: a black outline (each ramp's stop 0), no rim, no crease — the 8-bit era had neither.
export const FIN = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: false, crease: false };
export const FIN_FX = { ramps: RAMPS, glow: GLOW, outline: 'self', rim: false, crease: false };
export const FIN_FLAT = { ramps: RAMPS, glow: GLOW, outline: null, rim: false, crease: false };
