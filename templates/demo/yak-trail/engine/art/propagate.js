// engine/art/propagate.js — carry the user's fix on one frame over to its sibling frames.
// Pure functions over flat arrays of legend refs (null = transparent; [MATERIAL, shade] or
// '#rrggbb'), so the studio (browser) and the CLI tools page share one implementation.
//
// The changed pixels of the source frame (its final image vs. the generator's own output) are
// split into connected pieces. Each piece is carried over with the first strategy that fits:
//   exact   — the target frame has the same generator pixels there → apply the user's pixels as-is
//   moved   — the same generator pixels sit at a small offset in the target (an animation moved
//             that part) → apply them at that offset
//   adapted — the user copied another part of the same frame (e.g. drew one eye like the other):
//             the target gets ITS OWN version of that part, copied the same way. Background
//             pixels (the surrounding material, e.g. skin) are only written where they replace
//             something, so the target keeps its own shading.
//   conflict— none fits → those pixels are left for the user or the AI to decide.
// Pixels the user already edited in the target are never overwritten.

const key = (r) => (r == null ? '.' : typeof r === 'string' ? r.toLowerCase() : `${r[0]}:${r[1]}`);
const mat = (r) => (r == null ? '.' : typeof r === 'string' ? r.toLowerCase() : r[0]);

// 8-connected pieces of a set of pixel indices.
function components(idx, w, h) {
  const set = new Set(idx);
  const seen = new Set();
  const out = [];
  for (const start of idx) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}

function bbox(comp, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of comp) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// Most common material in the 1px ring around a box (the "background" the part sits on).
function ringMaterial(arr, b, w, h) {
  const counts = new Map();
  for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) continue;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const m = mat(arr[y * w + x]);
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let best = null, n = -1;
  for (const [m, c] of counts) if (c > n) { best = m; n = c; }
  return best;
}

function distinct(arr, idx) { return new Set(idx.map((i) => key(arr[i]))).size; }

// srcRaw/srcFinal: the source frame (generator output / user's version).
// tgtRaw/tgtCurrent: a sibling frame (generator output / what it looks like now, incl. user edits).
export function propagateEdit({ w, h, srcRaw, srcFinal, tgtRaw, tgtCurrent, maxShift = 8 }) {
  const n = w * h;
  const changed = [];
  for (let i = 0; i < n; i++) if (key(srcFinal[i]) !== key(srcRaw[i])) changed.push(i);
  const result = tgtCurrent.slice();
  const report = { status: 'none', changedInSource: changed.length, applied: 0, conflicts: [], pieces: [] };
  if (!changed.length) return { result, ...report };
  const changedSet = new Set(changed);
  const userEditedTarget = (i) => key(tgtCurrent[i]) !== key(tgtRaw[i]);
  const write = (i, v, piece) => {
    if (key(result[i]) === key(v)) return;
    if (userEditedTarget(i)) { piece.blocked++; return; }
    result[i] = v;
    piece.written++;
  };

  for (const comp of components(changed, w, h)) {
    const b = bbox(comp, w);
    const piece = { size: comp.length, box: [b.x0, b.y0, b.x1, b.y1], strategy: 'conflict', offset: null, written: 0, blocked: 0 };
    const boxIdx = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) boxIdx.push(y * w + x);

    // exact: the generator drew the same thing here in the target
    if (boxIdx.every((i) => key(tgtRaw[i]) === key(srcRaw[i]))) {
      piece.strategy = 'exact';
      for (const i of comp) write(i, srcFinal[i], piece);
      report.pieces.push(piece);
      continue;
    }

    // moved: the same generator pixels at a small offset (needs some texture to be unambiguous)
    if (distinct(srcRaw, boxIdx) >= 2) {
      const hits = [];
      for (let dy = -maxShift; dy <= maxShift && hits.length < 2; dy++) for (let dx = -maxShift; dx <= maxShift; dx++) {
        if (!dx && !dy) continue;
        if (b.x0 + dx < 0 || b.y0 + dy < 0 || b.x1 + dx >= w || b.y1 + dy >= h) continue;
        let ok = true;
        for (const i of boxIdx) { if (key(tgtRaw[i + dy * w + dx]) !== key(srcRaw[i])) { ok = false; break; } }
        if (ok) { hits.push([dx, dy]); if (hits.length > 1) break; }
      }
      if (hits.length === 1) {
        const [dx, dy] = hits[0];
        piece.strategy = 'moved'; piece.offset = [dx, dy];
        for (const i of comp) write(i + dy * w + dx, srcFinal[i], piece);
        report.pieces.push(piece);
        continue;
      }
    }

    // adapted: the user's new pixels are a copy of another (unchanged) part of the same frame
    if (comp.length >= 4 && distinct(srcFinal, comp) >= 2) {
      let best = null;
      for (let dy = -h + 1; dy < h; dy++) for (let dx = -w + 1; dx < w; dx++) {
        if (!dx && !dy) continue;
        if (b.x0 + dx < 0 || b.y0 + dy < 0 || b.x1 + dx >= w || b.y1 + dy >= h) continue;
        let ok = true;
        for (const i of comp) {
          const j = i + dy * w + dx;
          if (changedSet.has(j) || key(srcFinal[j]) !== key(srcFinal[i])) { ok = false; break; }
        }
        if (ok && (!best || Math.abs(dx) + Math.abs(dy) < Math.abs(best[0]) + Math.abs(best[1]))) best = [dx, dy];
      }
      if (best) {
        const [dx, dy] = best;
        const bg = ringMaterial(tgtCurrent, b, w, h);
        piece.strategy = 'adapted'; piece.offset = [dx, dy]; piece.background = bg;
        for (const i of comp) {
          const v = tgtCurrent[i + dy * w + dx];
          if (mat(v) === bg && mat(tgtCurrent[i]) === bg) continue; // background stays the target's own
          write(i, v, piece);
        }
        report.pieces.push(piece);
        continue;
      }
    }

    for (const i of comp) report.conflicts.push(i);
    report.pieces.push(piece);
  }

  report.applied = report.pieces.reduce((s, p) => s + p.written, 0);
  const blocked = report.pieces.reduce((s, p) => s + p.blocked, 0);
  const strategies = new Set(report.pieces.map((p) => p.strategy));
  if (report.conflicts.length === changed.length) report.status = 'conflict';
  else if (report.conflicts.length || blocked) report.status = 'partial';
  else if (!report.applied) report.status = 'already';
  else if (strategies.size === 1 && strategies.has('exact')) report.status = 'exact';
  else report.status = 'adapted';
  report.blocked = blocked;
  return { result, ...report };
}

export function describePropagation(r) {
  const how = r.pieces.filter((p) => p.strategy !== 'conflict').map((p) => (
    p.strategy === 'exact' ? `${p.size} px as-is`
      : p.strategy === 'moved' ? `${p.size} px moved by ${p.offset[0]},${p.offset[1]}`
        : `${p.size} px rebuilt from this frame's own part ${p.offset[0] > 0 ? p.offset[0] + 'px right' : p.offset[0] < 0 ? -p.offset[0] + 'px left' : ''}${p.offset[1] ? ` ${Math.abs(p.offset[1])}px ${p.offset[1] > 0 ? 'down' : 'up'}` : ''} (the way you copied it)`));
  const parts = [];
  if (r.status === 'already') return 'already matches — nothing to do';
  if (how.length) parts.push(how.join('; '));
  if (r.conflicts.length) parts.push(`${r.conflicts.length} px differ here and need a decision`);
  if (r.blocked) parts.push(`${r.blocked} px kept because you already edited them`);
  return parts.join(' · ');
}
