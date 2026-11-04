// studio/data/edits.mjs — the user's pixel edits (one JSON file per edited asset + a generated index.js).
// Format: engine/art/edits.js (docs/contracts/ART.md). Never rewrites the user's pixels: it only stores what the studio saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, EDITS, assertId, isId, inside, within, nowIso, readJsonStrict, relRepo, markWrite, writeJsonMarked, writeTextMarked } from './core.mjs';
import { getProject, projectDir } from './games.mjs';
export async function editsDir(projectId) {
  const p = await getProject(projectId);
  if (!p) throw new Error(`project ${projectId} not found`);
  const abs = path.resolve(ROOT, p.editsDir);
  if (!inside(projectDir(projectId), abs)) throw new Error('editsDir must be inside the project folder');
  return abs;
}

// null when the asset has no edit file. A file that exists but can't be read THROWS (err.unreadable,
// err.why): the studio must never mistake the person's broken file for "no edits" and save over it.
export async function readEdit(projectId, assetId) {
  const dir = await editsDir(projectId);
  const v = await readJsonStrict(within(dir, `${assertId('asset', assetId)}.json`));
  return v === undefined ? null : v;
}

// Parsed edit files, re-read only when a file's size or modification time changes, so a save
// costs one stat per edit file plus one read — not a re-read of every file.
// abs editsDir -> Map(file name -> { mtimeMs, size, ed, ok, json? })
const editsCache = new Map();

async function cachedEdits(dir) {
  let names = [];
  try { names = (await fs.readdir(dir)).filter((f) => f.endsWith('.json') && isId('asset', f.slice(0, -5))); } catch { /* none */ }
  let cache = editsCache.get(dir);
  if (!cache) editsCache.set(dir, (cache = new Map()));
  const stats = await Promise.all(names.map((f) => fs.stat(path.join(dir, f)).catch(() => null)));
  await Promise.all(names.map(async (f, i) => {
    const st = stats[i];
    if (!st) { cache.delete(f); return; }
    const hit = cache.get(f);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return;
    let ed, why = '';
    try { ed = (await readJsonStrict(path.join(dir, f))) ?? { unreadable: true }; } catch (err) { ed = { unreadable: true }; why = err.why || err.message; }
    const errs = ed.unreadable ? [why || "it can't be read"] : EDITS.checkEdit(ed);
    cache.set(f, { mtimeMs: st.mtimeMs, size: st.size, ed, ok: !errs.length, why: errs.join('; ') });
  }));
  const keep = new Set(names);
  for (const f of cache.keys()) if (!keep.has(f)) cache.delete(f);
  return cache;
}

// includeInvalid: also return files that fail checkEdit (for `check`); the index never gets them.
// The returned objects are shared with the cache: read them, don't change them.
export async function readAllEdits(projectId, { includeInvalid = false } = {}) {
  const cache = await cachedEdits(await editsDir(projectId));
  const out = {};
  for (const [f, e] of [...cache].sort(([a], [b]) => a.localeCompare(b))) if (e.ok || includeInvalid) out[f.slice(0, -5)] = e.ed;
  return out;
}

// Light summary for lists: { assetId: { poses: { pose: { mode, changed } }, notes, updated } }
export async function listEdits(projectId) {
  const out = {};
  for (const [id, ed] of Object.entries(await readAllEdits(projectId))) out[id] = EDITS.summarizeEdit(ed);
  return out;
}

// Edit files that are there but can't be used (unreadable, or not a valid edit): [{ file, why }].
export async function brokenEdits(projectId) {
  const dir = await editsDir(projectId);
  return [...(await cachedEdits(dir))].filter(([, e]) => !e.ok).map(([f, e]) => ({ file: relRepo(path.join(dir, f)), why: e.why }));
}
function refuseIfBroken(dir, cache, what) {
  const bad = [...cache].filter(([, e]) => !e.ok);
  if (!bad.length) return;
  const list = bad.map(([f, e]) => `${relRepo(path.join(dir, f))} (${e.why})`).join('; ');
  const err = new Error(`${what} refused: ${list}. Those are the person's edits: fix the file (resolve the conflict), never delete it — then save again.`);
  err.unreadable = true;
  throw err;
}

// The index the game imports. It is never rebuilt while an edit file is broken: rebuilding would
// quietly drop that asset's edits from the game, so the old index stays until the file is fixed.
export async function rebuildEditsIndex(projectId) {
  const dir = await editsDir(projectId);
  const cache = await cachedEdits(dir);
  refuseIfBroken(dir, cache, 'Updating the edits index');
  const all = {};
  for (const [f, e] of cache) if (e.ok) all[f.slice(0, -5)] = e;
  // each entry's JSON is serialized once and reused until that file changes
  const src = EDITS.editsIndexSource(all, (id, e) => e.json || (e.json = JSON.stringify(e.ed)));
  await writeTextMarked(path.join(dir, 'index.js'), src);
  return Object.keys(all).length;
}

export async function writeEdit(projectId, assetId, edit) {
  assertId('asset', assetId);
  if (!edit || edit.asset !== assetId) throw new Error('edit.asset must match the asset id');
  edit.format = EDITS.EDITS_FORMAT;
  edit.project = projectId;
  const errs = EDITS.checkEdit(edit);
  if (errs.length) throw new Error(`invalid edit: ${errs.join('; ')}`);
  const size = JSON.stringify(edit).length;
  if (size > 4_000_000) throw new Error('edit file too large');
  const dir = await editsDir(projectId);
  refuseIfBroken(dir, await cachedEdits(dir), 'Saving'); // nothing half-done: the save waits for the broken file
  edit.updated = nowIso();
  if (!Object.keys(edit.poses || {}).length && !Object.keys(edit.anims || {}).length && !(edit.notes || []).length) {
    await deleteEdit(projectId, assetId);
    return null;
  }
  await writeJsonMarked(within(dir, `${assetId}.json`), edit);
  editsCache.get(dir)?.delete(`${assetId}.json`);
  await rebuildEditsIndex(projectId);
  return edit;
}

export async function deleteEdit(projectId, assetId) {
  const dir = await editsDir(projectId);
  refuseIfBroken(dir, await cachedEdits(dir), 'Reverting');
  const file = within(dir, `${assertId('asset', assetId)}.json`);
  markWrite(file);
  await fs.rm(file, { force: true });
  editsCache.get(dir)?.delete(`${assetId}.json`);
  await rebuildEditsIndex(projectId);
}

// How many assets the person has edited: a folder listing, no file read (the Games view, every game).
export async function countEdits(projectId) {
  try { return (await fs.readdir(await editsDir(projectId))).filter((f) => f.endsWith('.json')).length; } catch { return 0; }
}
