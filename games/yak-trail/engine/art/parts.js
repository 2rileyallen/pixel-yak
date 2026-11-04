// engine/art/parts.js — stamp a style "part" (a small pixel cluster cut from the user's own art,
// see a design file's parts/ folder) into a Pix. Legend values use material NAMES so a part
// works in any game of the style; M maps names to the game's material ids.
export function stampPart(p, part, x, y, M, { flip = false } = {}) {
  const legend = {};
  for (const [ch, ref] of Object.entries(part.legend || {})) {
    if (!Array.isArray(ref)) continue;
    const id = M[ref[0]];
    if (id) legend[ch] = [id, ref[1]];
  }
  return p.stamp(part.rows, legend, x, y, flip);
}
