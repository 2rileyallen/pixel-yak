// studio/data/edits.mjs — the user's pixel edits (one JSON file per edited asset + a generated index.js).
// Format: engine/art/edits.js (docs/contracts/ART.md). Never rewrites the user's pixels: it only stores what the studio saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, EDITS, assertId, isId, inside, within, nowIso, readJson, markWrite, writeJsonMarked, writeTextMarked } from './core.mjs';
import { getProject, projectDir } from './games.mjs';
export async function editsDir(projectId) {
  const p = await getProject(projectId);
  if (!p) throw new Error(`project ${projectId} not found`);
  const abs = path.resolve(ROOT, p.editsDir);
  if (!inside(projectDir(projectId), abs)) throw new Error('editsDir must be inside the project folder');
  return abs;
}

export async function readEdit(projectId, assetId) {
  const dir = await editsDir(projectId);
  return readJson(within(dir, `${assertId('asset', assetId)}.json`));
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
    const ed = (await readJson(path.join(dir, f), { unreadable: true })) ?? { unreadable: true };
    cache.set(f, { mtimeMs: st.mtimeMs, size: st.size, ed, ok: !ed.unreadable && !EDITS.checkEdit(ed).length });
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

export async function rebuildEditsIndex(projectId) {
  const dir = await editsDir(projectId);
  const cache = await cachedEdits(dir);
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
  const file = within(dir, `${assertId('asset', assetId)}.json`);
  markWrite(file);
  await fs.rm(file, { force: true });
  editsCache.get(dir)?.delete(`${assetId}.json`);
  await rebuildEditsIndex(projectId);
}
