// studio/ui/js/lessons.js — every save becomes a lesson for the style the project uses:
// metrics of what the user changed (by material, shade direction, silhouette, outline),
// the before/after pixel rows, and a lesson card image (AI | before | after | changes) that
// a model looks at when it distills the style (see .agents/skills/art-learn).
import { buildLegend, gridToRows } from '../../../engine/art/edits.js';
import { gridCanvas, gridToRefs, refKey, Grid } from './pixels.js';

const LABEL = (ref) => (ref == null ? 'clear' : typeof ref === 'string' ? ref : `${ref[0]}${ref[1]}`);
const MAX_ROWS_PX = 128 * 128;

function isOutline(g, i) {
  if (!g.data[i]) return false;
  const x = i % g.w, y = (i / g.w) | 0;
  return !g.get(x - 1, y) || !g.get(x + 1, y) || !g.get(x, y - 1) || !g.get(x, y + 1) || x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1;
}

// before may be null (a brand-new frame). Grids share one ColorTable.
export function diffMetrics(before, after, table) {
  const w = after.w, h = after.h;
  const b0 = before || new Grid(w, h);
  let changed = 0, added = 0, removed = 0, recolored = 0, lighter = 0, darker = 0, opaqueB = 0, opaqueA = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const trans = new Map();
  const mats = new Map(); // material → { added, removed, lighter, darker, swapped }
  const bump = (m, k) => { if (!m) return; const o = mats.get(m) || { added: 0, removed: 0, lighter: 0, darker: 0, swapped: 0 }; o[k]++; mats.set(m, o); };
  let outlineB = 0, outlineA = 0;
  for (let i = 0; i < after.data.length; i++) {
    const b = b0.data[i], a = after.data[i];
    if (b) opaqueB++;
    if (a) opaqueA++;
    if (isOutline(b0, i) && Array.isArray(table.ref(b)) && table.ref(b)[0] === 'INK') outlineB++;
    if (isOutline(after, i) && Array.isArray(table.ref(a)) && table.ref(a)[0] === 'INK') outlineA++;
    if (a === b) continue;
    changed++;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    const rb = table.ref(b), ra = table.ref(a);
    const mb = Array.isArray(rb) ? rb[0] : rb, ma = Array.isArray(ra) ? ra[0] : ra;
    if (!b) { added++; bump(ma, 'added'); }
    else if (!a) { removed++; bump(mb, 'removed'); }
    else {
      recolored++;
      if (Array.isArray(rb) && Array.isArray(ra) && rb[0] === ra[0]) { if (ra[1] > rb[1]) { lighter++; bump(ma, 'lighter'); } else { darker++; bump(ma, 'darker'); } }
      else bump(mb, 'swapped');
    }
    const k = `${LABEL(rb)}→${LABEL(ra)}`;
    trans.set(k, (trans.get(k) || 0) + 1);
  }
  const base = Math.max(opaqueB, opaqueA, 1);
  return {
    changed, added, removed, recolored, lighter, darker,
    opaqueBefore: opaqueB, opaqueAfter: opaqueA,
    repaintPct: Math.round((changed / base) * 1000) / 10,
    bbox: changed ? [x0, y0, x1, y1] : null,
    outline: { before: outlineB, after: outlineA },
    materials: Object.fromEntries([...mats.entries()].sort((p, q) => sum(q[1]) - sum(p[1])).slice(0, 12)),
    transitions: [...trans.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14),
  };
}
const sum = (o) => o.added + o.removed + o.lighter + o.darker + o.swapped;

// One-line human summary of a metrics object.
export function describe(m) {
  if (!m || !m.changed) return 'no pixel changes';
  const parts = [`${m.changed} px (${m.repaintPct}%)`];
  if (m.added) parts.push(`+${m.added} silhouette`);
  if (m.removed) parts.push(`−${m.removed} silhouette`);
  if (m.lighter) parts.push(`${m.lighter} lighter`);
  if (m.darker) parts.push(`${m.darker} darker`);
  const swapped = m.recolored - m.lighter - m.darker;
  if (swapped > 0) parts.push(`${swapped} recolored`);
  if (m.outline && m.outline.after !== m.outline.before) parts.push(`outline ${m.outline.after - m.outline.before > 0 ? '+' : ''}${m.outline.after - m.outline.before}`);
  return parts.join(' · ');
}

// Lesson card PNG: [AI generated] [before this save] [after] [changes highlighted]
export function lessonCard({ gen, before, after, table, title }) {
  const w = after.w, h = after.h;
  const z = Math.max(1, Math.min(8, Math.floor(168 / Math.max(w, h))));
  const cols = [['AI generated', gen], ['before', before], ['after', after], ['changes', 'diff']].filter((c) => c[1]);
  const pad = 10, head = 28, lab = 16;
  const cw = w * z, chh = h * z;
  const c = document.createElement('canvas');
  c.width = pad + cols.length * (cw + pad);
  c.height = head + lab + chh + pad;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#0d0f1d'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e7e9f3'; g.font = '600 12px Segoe UI, sans-serif'; g.textBaseline = 'middle';
  g.fillText(title.slice(0, 90), pad, head / 2 + 2);
  cols.forEach(([label, grid], i) => {
    const x = pad + i * (cw + pad), y = head + lab;
    g.fillStyle = '#a6abcc'; g.font = '11px Segoe UI, sans-serif';
    g.fillText(label, x, head + lab / 2 - 2);
    g.fillStyle = '#171a2e'; g.fillRect(x, y, cw, chh);
    if (grid === 'diff') {
      g.globalAlpha = 0.35; g.drawImage(gridCanvas(after, table), x, y, cw, chh); g.globalAlpha = 1;
      const b0 = before || gen;
      g.fillStyle = '#ff3fd0';
      for (let p = 0; p < after.data.length; p++) {
        if (b0 && after.data[p] === b0.data[p]) continue;
        if (!b0 && !after.data[p]) continue;
        g.fillRect(x + (p % w) * z, y + ((p / w) | 0) * z, z, z);
      }
    } else {
      g.drawImage(gridCanvas(grid, table), x, y, cw, chh);
    }
  });
  return c.toDataURL('image/png');
}

const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_');
export function lessonId(asset, pose, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `L-${stamp}-${safe(asset)}-${safe(pose)}`.slice(0, 118);
}

// Build the lesson object the main process appends to games/<id>/design/lessons/log.jsonl.
export function buildLesson({ project, asset, pose, kind, note, styleVersion, gen, before, after, table }) {
  const id = lessonId(asset.id, pose);
  const save = diffMetrics(before, after, table);
  const total = gen ? diffMetrics(gen, after, table) : null;
  const lesson = {
    id, ts: new Date().toISOString(), project, asset: asset.id, pose, kind,
    note: note || '', styleVersion: styleVersion || null, gen: asset.gen || null,
    size: [after.w, after.h], save, total, card: `cards/${id}.png`,
  };
  if (after.w * after.h <= MAX_ROWS_PX) {
    const grids = { gen, before, after };
    const refs = new Map();
    for (const gr of Object.values(grids)) if (gr) for (const r of gridToRefs(gr, table)) if (r) refs.set(refKey(r), r);
    const { legend, keyOf } = buildLegend([...refs.values()]);
    lesson.legend = legend;
    lesson.rows = {};
    for (const [k, gr] of Object.entries(grids)) if (gr) lesson.rows[k] = gridToRows(gridToRefs(gr, table), gr.w, gr.h, keyOf);
  }
  // skip the "before" column when it is just the AI's version (first edit of a frame)
  const showBefore = kind !== 'add-frame' && before && !(gen && before.equals(gen));
  const card = lessonCard({ gen, before: showBefore ? before : null, after, table, title: `${project} · ${asset.id} · ${pose}${note ? ` — “${note}”` : ''}` });
  return { lesson, card };
}
