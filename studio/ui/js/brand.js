// studio/ui/js/brand.js — Pixel Yak's mark in the top bar: the yak (icon.png, rendered from Yak
// Trail's `yak` art entry by tools/brand.mjs, so a repainted yak becomes the logo) and "PIXEL YAK"
// written in the engine's pixel font.
import { h } from './ui.js';
import { text, measure } from '../../../engine/shell/font.js';

const S = 2; // the wordmark's pixel size

export function brandMark() {
  const yak = h('img', { src: 'icon.png', alt: '', draggable: false, style: { width: '32px', height: '32px', imageRendering: 'pixelated' } });
  const w = (measure('PIXEL YAK') + 1) * S, hgt = 10 * S;
  const word = h('canvas', { width: w, height: hgt, 'aria-label': 'Pixel Yak', style: { width: `${w}px`, height: `${hgt}px`, imageRendering: 'pixelated', display: 'block' } });
  const g = word.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ink = '#0c1024';
  const x = text(g, 'PIXEL ', 0, 0, '#e8e6f6', { scale: S, shadow: ink });
  text(g, 'YAK', x + measure('PIXEL ', S) + S, 0, '#f4c443', { scale: S, shadow: ink });
  return [
    h('div.brand', { title: 'Pixel Yak' }, yak),
    h('div.brand-name', { style: { display: 'flex', alignItems: 'center' } }, word),
  ];
}
