// studio/ui/js/edit-file.js — builds the edit file (core/art/edits.js format) from the editor's
// frames. Untouched poses keep their rows; legend keys are reused so saves diff cleanly.
import { EDITS_FORMAT, buildLegend, diffToPatch, gridToRows, refsInEdit } from '../../../engine/art/edits.js';
import { gridToRefs, refKey } from './pixels.js';

export function emptyEdit(project, asset) {
  return {
    format: EDITS_FORMAT,
    project,
    asset: asset.id,
    contract: { fw: asset.fw, fh: asset.fh, ax: asset.ax, ay: asset.ay },
    legend: {},
    poses: {},
    anims: {},
    notes: [],
  };
}

// session: { edit, table, poses, anims, genAnims, frames: Map(pose → frame), removed: Set }
// frame:   { raw: Grid|null, rawHash, grid, forceBake, isNew, after, from }
// Returns { edit, saved: [poses written], removed: [poses dropped] }.
export function encodeForSave(session, note) {
  const { table } = session;
  const ed = JSON.parse(JSON.stringify(session.edit));
  ed.format = EDITS_FORMAT;
  ed.poses = ed.poses || {};
  const work = new Map(); // pose → { entry, refs, rawRefs?, need: refs[] }
  const removed = [];

  for (const pose of session.removed || []) { if (ed.poses[pose]) { delete ed.poses[pose]; removed.push(pose); } }

  for (const [pose, fr] of session.frames) {
    if (!fr || !session.poses.includes(pose)) continue;
    const touched = fr.isNew || fr.forceBake || fr.unbake || !fr.grid.equals(fr.saved);
    if (!touched) continue;
    const prev = ed.poses[pose] || {};
    const refs = gridToRefs(fr.grid, table);
    if (!fr.raw) {
      work.set(pose, { entry: { mode: 'baked', ...(prev.after || fr.after ? { after: prev.after || fr.after } : {}), ...(prev.from || fr.from ? { from: prev.from || fr.from } : {}) }, refs, need: refs.filter(Boolean) });
      continue;
    }
    if (!fr.unbake && (fr.forceBake || prev.mode === 'baked')) {
      work.set(pose, { entry: { mode: 'baked', base: fr.rawHash }, refs, need: refs.filter(Boolean) });
      continue;
    }
    if (fr.grid.equals(fr.raw)) { if (ed.poses[pose]) { delete ed.poses[pose]; removed.push(pose); } continue; }
    const rawRefs = gridToRefs(fr.raw, table);
    const need = [];
    for (let i = 0; i < refs.length; i++) if (refs[i] && refKey(refs[i]) !== refKey(rawRefs[i])) need.push(refs[i]);
    work.set(pose, { entry: { mode: 'patch', base: fr.rawHash }, refs, rawRefs, need });
  }

  // legend = everything still referenced by untouched poses + what the new rows need
  const untouched = { legend: ed.legend || {}, poses: Object.fromEntries(Object.entries(ed.poses).filter(([p]) => !work.has(p))) };
  const used = new Map();
  for (const r of refsInEdit(untouched)) used.set(refKey(r), r);
  for (const w of work.values()) for (const r of w.need) used.set(refKey(r), r);
  const { legend, keyOf } = buildLegend([...used.values()], ed.legend || {});
  ed.legend = legend;

  const now = new Date().toISOString();
  const saved = [];
  for (const [pose, w] of work) {
    const fr = session.frames.get(pose);
    const g = fr.grid;
    if (fr.via) w.entry.via = fr.via;
    if (w.entry.mode === 'baked') {
      ed.poses[pose] = { ...w.entry, rows: gridToRows(w.refs, g.w, g.h, keyOf), changed: fr.raw ? g.countDiff(fr.raw) : g.opaque(), updated: now };
    } else {
      const p = diffToPatch(w.rawRefs, w.refs, g.w, g.h, keyOf);
      ed.poses[pose] = { ...w.entry, at: p.at, rows: p.rows, changed: p.changed, updated: now };
    }
    saved.push(pose);
  }

  // anim overrides: keep only those that differ from the generator's anims
  const anims = {};
  for (const [k, seq] of Object.entries(session.anims || {})) {
    const gen = session.genAnims[k];
    if (!gen || gen.length !== seq.length || gen.some((p, i) => p !== seq[i])) anims[k] = [...seq];
  }
  ed.anims = anims;
  if (note && note.trim()) {
    ed.notes = [...(ed.notes || []), { ts: now, pose: saved[0] || null, text: note.trim().slice(0, 500) }].slice(-200);
  }
  return { edit: ed, saved, removed };
}
