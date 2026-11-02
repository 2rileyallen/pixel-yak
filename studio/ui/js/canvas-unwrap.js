// studio/ui/js/canvas-unwrap.js — the canvas inside whatever a game's asset getter returns (a canvas,
// { canvas }, { image }, a frame array, a three.js texture …). Shared by the art host and `check`.
export function unwrapCanvas(res, i = 0) {
  if (!res) return null;
  if (res instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && res instanceof OffscreenCanvas)) return res;
  if (res.canvas instanceof HTMLCanvasElement) return res.canvas;
  if (res.image instanceof HTMLCanvasElement) return res.image;
  if (Array.isArray(res) && res.length) return unwrapCanvas(res[i % res.length] || res[0]);
  if (res.texture) return unwrapCanvas(res.texture, i);
  return null;
}
