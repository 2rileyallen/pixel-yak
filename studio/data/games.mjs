// studio/data/games.mjs — games: any games/<id>/ folder with a game.json is a game (no registry).
// game.json paths (entry, assets, edits) are relative to the game's own folder, so a game is a
// self-contained repo that works wherever it is cloned into games/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, assertId, isId, inside, within, str, nowIso, relRepo, readJson, writeJsonMarked, exists } from './core.mjs';

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

export function normalizeProject(id, raw) {
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
    style: exists(path.join(dir, 'design', 'art.md')) || exists(path.join(dir, 'design', 'palette.js')) ? id : null,
    designs: Object.fromEntries(['art', 'sound', 'game'].map((k) => [k, isId('design', designs[k]) ? designs[k] : null])),
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
    hasGame: exists(entry),
    hasAssets: exists(assets),
    isRepo: exists(path.join(dir, '.git')),
  };
}

export async function listProjects() {
  let names = [];
  try { names = await fs.readdir(DIRS.games, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of names) {
    if (!d.isDirectory() || !isId('project', d.name)) continue;
    const raw = await readJson(path.join(DIRS.games, d.name, 'game.json'));
    if (!raw) continue;
    out.push(normalizeProject(d.name, raw));
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id));
}

export async function getProject(id) {
  const raw = await readJson(path.join(projectDir(id), 'game.json'));
  return raw ? normalizeProject(id, raw) : null;
}

const EDITABLE = ['name', 'subtitle', 'description', 'genre', 'size', 'stage', 'status', 'tags'];
export async function updateProject(id, patch) {
  const file = path.join(projectDir(id), 'game.json');
  const raw = await readJson(file);
  if (!raw) throw new Error(`game ${id} not found`);
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
  return normalizeProject(id, raw);
}
