// studio/data/games.mjs — games: any games/<id>/ folder with a game.json is a game (no registry).
// game.json paths (entry, assets, edits) are relative to the game's own folder, so a game is a
// self-contained repo that works wherever it is cloned into games/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, assertId, isId, inside, within, str, nowIso, relRepo, readJson, readJsonStrict, writeJsonMarked, exists, existsAsync, mapPool } from './core.mjs';

// Where a game is in its life. No gates: each game's ROADMAP.md says what "done" feels like.
export const STAGES = [
  null,
  { n: 1, name: 'Idea', gate: 'Is this the game?' },
  { n: 2, name: 'Prototype', gate: 'Is it fun? What changes?' },
  { n: 3, name: 'Production', gate: 'Is it all there?' },
  { n: 4, name: 'Polish', gate: 'Ready to share?' },
  { n: 5, name: 'Released', gate: 'What do players say?' },
];
export const SIZES = ['toy', 'demo', 'big'];
const STATUS = ['active', 'paused', 'archived'];

export const projectDir = (id) => within(DIRS.games, assertId('project', id));

// A game-relative path from game.json; must stay inside the game's folder.
function gamePath(dir, rel, fallback) {
  const p = typeof rel === 'string' && rel && !rel.includes('\0') ? path.resolve(dir, rel) : null;
  return p && inside(dir, p) ? p : path.join(dir, fallback);
}

// flags: the file checks, when the caller already did them (async); otherwise checked here (sync).
export function normalizeProject(id, raw, flags = null) {
  const dir = path.join(DIRS.games, id);
  const p = raw && typeof raw === 'object' ? raw : {};
  const res = p.resolution || {};
  const entry = gamePath(dir, p.entry, 'game/index.html');
  const assets = gamePath(dir, p.assets, 'assets.js');
  const edits = gamePath(dir, p.edits, 'game/art/edits');
  const designs = p.designs && typeof p.designs === 'object' ? p.designs : {};
  return {
    id,
    name: str(p.name, 120) || id,
    subtitle: str(p.subtitle, 200),
    description: str(p.description, 4000),
    genre: str(p.genre, 120),
    size: SIZES.includes(p.size) ? p.size : 'toy',
    // the game's own look: its design/ folder (art.md + palette.js); lessons land there too
    style: (flags ? flags.style : exists(path.join(dir, 'design', 'art.md')) || exists(path.join(dir, 'design', 'palette.js'))) ? id : null,
    designs: Object.fromEntries(['art', 'sound', 'game'].map((k) => [k, isId('design', designs[k]) ? designs[k] : null])),
    // systems it copied in from the library's systems shelf (designs.systems in game.json)
    systemsFrom: Array.isArray(designs.systems) ? designs.systems.filter((v) => isId('design', v)) : [],
    stage: Number.isInteger(p.stage) && p.stage >= 1 && p.stage < STAGES.length ? p.stage : null,
    status: STATUS.includes(p.status) ? p.status : 'active',
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string').slice(0, 30) : [],
    resolution: {
      width: Number(res.width) || 320, height: Number(res.height) || 180, pixelScale: Number(res.pixelScale) || 3,
    },
    engine: str(p.engine, 40),
    gamePath: relRepo(entry),
    assetsPath: relRepo(assets),
    editsDir: relRepo(edits),
    createdAt: str(p.createdAt, 40),
    updatedAt: str(p.updatedAt, 40),
    hasGame: flags ? flags.hasGame : exists(entry),
    hasAssets: flags ? flags.hasAssets : exists(assets),
    isRepo: flags ? flags.isRepo : exists(path.join(dir, '.git')),
  };
}

async function projectFlags(id, raw) {
  const dir = path.join(DIRS.games, id);
  const p = raw && typeof raw === 'object' ? raw : {};
  const [art, palette, hasGame, hasAssets, isRepo] = await Promise.all([
    path.join(dir, 'design', 'art.md'), path.join(dir, 'design', 'palette.js'),
    gamePath(dir, p.entry, 'game/index.html'), gamePath(dir, p.assets, 'assets.js'), path.join(dir, '.git'),
  ].map(existsAsync));
  return { style: art || palette, hasGame, hasAssets, isRepo };
}

async function loadProject(id) {
  const file = path.join(DIRS.games, id, 'game.json');
  try {
    const raw = await readJsonStrict(file);
    if (raw === undefined) return null; // no game.json: not a game
    return normalizeProject(id, raw, await projectFlags(id, raw));
  } catch (err) {
    // the folder is still a game: list it, marked broken, so nothing that has it open is lost
    return { ...normalizeProject(id, {}, await projectFlags(id, {})), broken: err.why || err.message };
  }
}

// Every game. A game whose game.json exists but can't be read is left out (and noted as
// unreadable) unless broken: true — then it is listed with `broken: "<why>"` (the studio keeps
// it open and shows the problem). The studio turns on a short memo (cacheProjects) so the calls
// of one moment share one scan; its watcher and every write call invalidateProjects().
let projectsMemo = null; // { at, promise }
let memoMs = 0; // 0 = every call scans (the CLI)
export function cacheProjects(ms) { memoMs = Math.max(0, Number(ms) || 0); projectsMemo = null; }
export function invalidateProjects() { projectsMemo = null; }
export async function listProjects({ broken = false } = {}) {
  let all;
  if (memoMs) {
    if (!projectsMemo || Date.now() - projectsMemo.at > memoMs) projectsMemo = { at: Date.now(), promise: scanProjects() };
    const memo = projectsMemo;
    try { all = await memo.promise; } catch (err) { if (projectsMemo === memo) projectsMemo = null; throw err; }
  } else all = await scanProjects();
  return broken ? all.slice() : all.filter((p) => !p.broken);
}
async function scanProjects() {
  let names = [];
  try { names = await fs.readdir(DIRS.games, { withFileTypes: true }); } catch { return []; }
  const ids = names.filter((d) => d.isDirectory() && isId('project', d.name)).map((d) => d.name);
  const out = (await mapPool(ids, 16, loadProject)).filter(Boolean);
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id));
}

export async function getProject(id) {
  const raw = await readJson(path.join(projectDir(id), 'game.json'));
  return raw ? normalizeProject(id, raw) : null;
}

const EDITABLE = ['name', 'subtitle', 'description', 'genre', 'size', 'stage', 'status', 'tags'];
export async function updateProject(id, patch) {
  const file = path.join(projectDir(id), 'game.json');
  const raw = await readJsonStrict(file); // a broken game.json throws: it is never written over
  if (!raw || typeof raw !== 'object') throw new Error(`game ${id} not found`);
  for (const k of EDITABLE) {
    if (!(k in (patch || {}))) continue;
    const v = patch[k];
    if (k === 'stage') { if (Number.isInteger(v) && v >= 1 && v < STAGES.length) raw.stage = v; continue; }
    if (k === 'size') { if (SIZES.includes(v)) raw.size = v; continue; }
    if (k === 'tags') { if (Array.isArray(v)) raw.tags = v.filter((t) => typeof t === 'string').slice(0, 30); continue; }
    if (k === 'status') { if (STATUS.includes(v)) raw.status = v; continue; }
    raw[k] = str(v, k === 'description' ? 4000 : 200);
  }
  raw.updatedAt = nowIso();
  await writeJsonMarked(file, raw);
  invalidateProjects();
  return normalizeProject(id, raw);
}
