// studio/data/core.mjs — the plumbing every data module shares: where things live, id
// validation, safe paths, atomic writes, and a record of the studio's own writes (so the file
// watcher can tell them from outside edits). Pure Node: the desktop app and the CLI both use it.
//
// Everything lives in plain files (docs/STUDIO.md):
//   games/<id>/game.json                     a game (any folder with one is listed — no registry)
//   games/<id>/<edits>/<asset>.json          the user's pixel edits (+ generated index.js)
//   games/<id>/design/                       the game's own design files + lessons/ (what the AI learns)
//   games/<id>/requests/<R-id>.json          requests between the user and the AI (+ attachments)
//   designs/<shelf>/<id>/DESIGN.md           the design library (art, sound, game)
//   local/                                   the user's private profile: ideas/, inbox/, designs/
//
// Every id from the outside is validated and every path is checked to stay inside its folder.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIRS = {
  games: path.join(ROOT, 'games'),
  designs: path.join(ROOT, 'designs'),
  templates: path.join(ROOT, 'templates'),
  engine: path.join(ROOT, 'engine'),
  local: path.join(ROOT, 'local'),
  ideas: path.join(ROOT, 'local', 'ideas'),
  inbox: path.join(ROOT, 'local', 'inbox'),
  localDesigns: path.join(ROOT, 'local', 'designs'),
};

export const EDITS = await import(pathToFileURL(path.join(ROOT, 'engine', 'art', 'edits.js')).href);

// ------------------------------------------------------------- validation ---
const RE = {
  project: /^[a-z0-9][a-z0-9-]{0,47}$/,
  style: /^[a-z0-9][a-z0-9-]{0,47}$/,
  design: /^[a-z0-9][a-z0-9-]{0,47}$/,
  asset: /^[A-Za-z0-9_.-]{1,96}$/,
  request: /^R-[A-Za-z0-9-]{4,60}$/,
  idea: /^[a-z0-9][a-z0-9-]{0,63}$/,
  file: /^[A-Za-z0-9_.-]{1,120}$/,
};
export function isId(kind, v) { return typeof v === 'string' && RE[kind].test(v) && !v.includes('..'); }
export function assertId(kind, v) {
  if (!isId(kind, v)) throw new Error(`invalid ${kind} id: ${JSON.stringify(v)}`);
  return v;
}
export function inside(base, p) {
  const rel = path.relative(base, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
export function within(base, ...parts) {
  const p = path.resolve(base, ...parts);
  if (!inside(base, p)) throw new Error(`path escapes ${path.relative(ROOT, base) || '.'}: ${parts.join('/')}`);
  return p;
}
export const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
export const nowIso = () => new Date().toISOString();
export const relRepo = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ------------------------------------------------------------------ files ---
export async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}
export async function writeText(p, text) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, p);
}
export const writeJson = (p, data) => writeText(p, JSON.stringify(data, null, 2) + '\n');
export const exists = (p) => fss.existsSync(p);

// Recently written files, so the watcher can tell the studio's own writes from outside edits.
// Entries older than a minute are dropped as new ones arrive, so the map stays small.
export const recentWrites = new Map();
export function markWrite(p) {
  const now = Date.now();
  if (recentWrites.size > 500) for (const [k, t] of recentWrites) if (now - t > 60000) recentWrites.delete(k);
  recentWrites.set(path.resolve(p), now);
}
export function wasRecentlyWritten(p, ms = 1500) {
  const t = recentWrites.get(path.resolve(p));
  return !!t && Date.now() - t < ms;
}
export async function writeJsonMarked(p, data) { markWrite(p); await writeJson(p, data); }
export async function writeTextMarked(p, text) { markWrite(p); await writeText(p, text); }
