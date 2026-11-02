// studio/ui/js/tools.js — headless analysis for the AI-facing CLI (cli/yak.mjs context /
// propagate). Runs the project's real art code, applies the user's edits with the same
// functions the game uses, prints `TOOLRESULT <json>` and draws a picture of what it found.
import {
  makePalette, canvasToRefs, applyPatchToCanvas, bakedToCanvas, effectivePoses, canvasHash, buildLegend, gridToRows, hexToRgb, refToHex,
} from '../../../engine/art/edits.js';
import { propagateEdit, describePropagation } from '../../../engine/art/propagate.js';

const q = new URLSearchParams(location.search);
const task = q.get('task');
const root = document.getElementById('root');
const done = (obj) => { console.log('TOOLRESULT ' + JSON.stringify(obj)); window.__ready = true; };
const key = (r) => (r == null ? '.' : typeof r === 'string' ? r : `${r[0]}:${r[1]}`);

function draw(refs, w, h, pal, z) {
  const c = document.createElement('canvas');
  c.width = w * z; c.height = h * z;
  const g = c.getContext('2d');
  refs.forEach((r, i) => {
    const hex = refToHex(r, pal);
    if (!hex) return;
    g.fillStyle = hex;
    g.fillRect((i % w) * z, ((i / w) | 0) * z, z, z);
  });
  return c;
}
const cell = (title, sub, ...canvases) => {
  const d = document.createElement('div');
  d.className = 'cell';
  const p = document.createElement('div'); p.className = 'pair'; p.append(...canvases);
  const b = document.createElement('b'); b.textContent = title;
  const s = document.createElement('span'); s.textContent = sub;
  d.append(p, b, s);
  return d;
};

try {
  const mod = await import(`../../../${q.get('entry')}`);
  let EDITS = {};
  try { EDITS = (await import(`../../../${q.get('edits')}/index.js`)).EDITS || {}; } catch { /* no edits yet */ }
  const pal = makePalette(mod.STUDIO && mod.STUDIO.palette);
  const a = (mod.ASSETS || []).find((x) => x.id === q.get('asset'));
  if (!a) throw new Error(`no asset "${q.get('asset')}" in ${q.get('entry')}`);
  const ed = EDITS[a.id] || null;
  const rawCanvas = (pose) => (a.poses.includes(pose) ? (typeof a.getRaw === 'function' ? a.getRaw(pose) : a.getCanvas(pose)) : null);
  const poses = effectivePoses(a.poses, ed);
  const frames = {};
  for (const pose of poses) {
    const rc = rawCanvas(pose);
    const pe = ed && ed.poses && ed.poses[pose];
    const fc = pe ? (pe.mode === 'baked' ? bakedToCanvas(pe, ed.legend || {}, pal, a.fw, a.fh) : applyPatchToCanvas(rc, pe, ed.legend || {}, pal)) : rc;
    const w = (fc || rc).width, hh = (fc || rc).height;
    const raw = rc ? canvasToRefs(rc, pal) : null, fin = canvasToRefs(fc, pal);
    const changed = raw ? fin.reduce((n, r, i) => n + (key(r) !== key(raw[i]) ? 1 : 0), 0) : fin.filter(Boolean).length;
    frames[pose] = {
      w, h: hh, raw, final: fin, rawHash: rc ? canvasHash(rc) : null,
      status: pe ? (pe.mode === 'baked' ? (rc ? 'baked' : 'added') : 'patch') : 'generated',
      changed, via: pe && pe.via || null, drift: !!(pe && pe.mode === 'patch' && pe.base && rc && pe.base !== canvasHash(rc)),
    };
  }
  const w = a.fw || frames[poses[0]].w, hh = a.fh || frames[poses[0]].h;
  const z = Math.max(2, Math.min(8, Math.floor(200 / Math.max(w, hh))));

  if (task === 'context') {
    // crop text grids to where the user changed something (+3 px), or the whole frame if small
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (const f of Object.values(frames)) if (f.raw) f.final.forEach((r, i) => { if (key(r) !== key(f.raw[i])) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
    let region = x1 >= 0 ? [Math.max(0, x0 - 3), Math.max(0, y0 - 3), Math.min(w - 1, x1 + 3), Math.min(hh - 1, y1 + 3)] : (w * hh <= 64 * 64 ? [0, 0, w - 1, hh - 1] : null);
    const crop = (arr) => { const out = []; for (let y = region[1]; y <= region[3]; y++) for (let x = region[0]; x <= region[2]; x++) out.push(arr[y * w + x]); return out; };
    let grids = null, legend = null;
    if (region) {
      const cw = region[2] - region[0] + 1, ch = region[3] - region[1] + 1;
      const used = new Map();
      for (const f of Object.values(frames)) for (const arr of [f.raw, f.final]) if (arr) for (const r of crop(arr)) if (r) used.set(key(r), r);
      const L = buildLegend([...used.values()]);
      legend = L.legend;
      grids = {};
      for (const [pose, f] of Object.entries(frames)) grids[pose] = { raw: f.raw ? gridToRows(crop(f.raw), cw, ch, L.keyOf) : null, final: f.status === 'generated' ? null : gridToRows(crop(f.final), cw, ch, L.keyOf) };
    }
    const h3 = document.createElement('h3'); h3.textContent = `${a.id} — top: what the game shows (with the user's edits) · bottom: the AI generator's own output`;
    const row = document.createElement('div'); row.className = 'row';
    for (const [pose, f] of Object.entries(frames)) {
      const pics = [draw(f.final, w, hh, pal, z)];
      if (f.raw && f.status !== 'generated') pics.push(draw(f.raw, w, hh, pal, z));
      const col = cell(pose, `${f.status}${f.changed ? ` · ${f.changed}px` : ''}`, ...pics);
      col.querySelector('.pair').style.flexDirection = 'column';
      row.append(col);
    }
    root.append(h3, row);
    done({
      asset: { id: a.id, name: a.name, category: a.category, fw: a.fw, fh: a.fh, ax: a.ax ?? null, ay: a.ay ?? null, poses: a.poses, anims: a.anims, gen: a.gen || null, description: a.description || '' },
      poses, frames: Object.fromEntries(Object.entries(frames).map(([p, f]) => [p, { status: f.status, changed: f.changed, via: f.via, drift: f.drift }])),
      region, legend, grids, notes: ed ? ed.notes || [] : [],
    });
  } else if (task === 'propagate') {
    const from = q.get('from');
    const src = frames[from];
    if (!src) throw new Error(`no pose "${from}" in ${a.id}`);
    if (!src.raw) throw new Error(`${from} was added in the studio (no AI version) — propagate from a generated frame`);
    const to = q.get('to') ? q.get('to').split(',') : poses.filter((p) => p !== from);
    const targets = [];
    const h3 = document.createElement('h3'); h3.textContent = `${a.id}: the user's ${from} fix carried to each frame — now → after`;
    const row = document.createElement('div'); row.className = 'row';
    row.append(cell(from, 'source: AI → user', draw(src.raw, w, hh, pal, z), draw(src.final, w, hh, pal, z)));
    for (const pose of to) {
      const f = frames[pose];
      if (!f || pose === from || f.w !== src.w || f.h !== src.h) continue;
      const tgtRaw = f.raw || f.final;
      const r = propagateEdit({ w, h: hh, srcRaw: src.raw, srcFinal: src.final, tgtRaw, tgtCurrent: f.final });
      const enc = (arr) => { const used = new Map(); for (const x of arr) if (x) used.set(key(x), x); const L = buildLegend([...used.values()]); return { legend: L.legend, rows: gridToRows(arr, w, hh, L.keyOf) }; };
      targets.push({
        pose, status: r.status, says: describePropagation(r), applied: r.applied, conflicts: r.conflicts.length, blocked: r.blocked,
        pieces: r.pieces, userEdited: f.status !== 'generated', rawHash: f.rawHash, hasRaw: !!f.raw,
        raw: f.raw ? enc(f.raw) : null, result: enc(r.result),
      });
      row.append(cell(pose, r.status, draw(f.final, w, hh, pal, z), draw(r.result, w, hh, pal, z)));
    }
    root.append(h3, row);
    done({ asset: a.id, from, w, h: hh, changedInSource: src.changed, targets });
  } else {
    throw new Error(`unknown task ${task}`);
  }
} catch (err) {
  const d = document.createElement('div'); d.className = 'err'; d.textContent = String(err.stack || err.message || err);
  root.append(d);
  done({ error: String(err.message || err) });
}
