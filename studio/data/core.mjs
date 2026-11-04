// studio/data/core.mjs — the plumbing every data module shares: where things live, id
// validation, safe paths, atomic writes, a list of files that exist but can't be read, and a record
// of the studio's own writes (so the file watcher can tell them from outside edits). Pure Node: the
// desktop app and the CLI both use it.
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
// Files that exist but could not be read or parsed (a merge conflict, a half-written file, a
// locked file). readJson keeps its quiet fallback for callers, but every such file is noted here
// so the studio (a warning + the Live log) and the CLI can say so out loud. Missing files are not
// errors. takeUnreadable() returns [{ path (repo-relative), error }] and clears the list.
const unreadable = new Map(); // repo-relative path -> error text
export function noteUnreadable(p, error) {
  const rel = path.isAbsolute(String(p)) ? relRepo(p) : String(p);
  unreadable.delete(rel); // newest last
  unreadable.set(rel, String((error && error.message) || error || 'unreadable').slice(0, 500));
  while (unreadable.size > 200) unreadable.delete(unreadable.keys().next().value);
}
export function takeUnreadable() {
  const out = [...unreadable].map(([p, error]) => ({ path: p, error }));
  unreadable.clear();
  return out;
}

const MISSING = new Set(['ENOENT', 'ENOTDIR']);
// Why a JSON file can't be read, in words a person can act on.
export function whyUnreadable(text, err) {
  if (typeof text === 'string') {
    const lines = text.split('\n');
    const at = lines.findIndex((l) => /^(<{7}|={7}|>{7})( |$)/.test(l));
    if (at >= 0) return `it has merge conflict markers (line ${at + 1}) — resolve the conflict first`;
    if (!text.trim()) return 'it is empty';
  }
  return `it is not valid JSON (${String((err && err.message) || err).slice(0, 200)})`;
}

// readJsonStrict: undefined when the file is missing; throws (err.unreadable = true, err.file)
// when it exists but can't be read or parsed — so a caller never mistakes a broken file for none.
export async function readJsonStrict(p) {
  let text;
  try { text = await fs.readFile(p, 'utf8'); } catch (err) {
    if (MISSING.has(err.code)) return undefined;
    throw unreadableError(p, `it could not be read (${err.code || err.message})`);
  }
  try { return JSON.parse(text); } catch (err) { throw unreadableError(p, whyUnreadable(text, err)); }
}
function unreadableError(p, why) {
  const e = new Error(`${relRepo(p)} can't be read: ${why}`);
  e.unreadable = true; e.file = relRepo(p); e.why = why;
  noteUnreadable(p, why);
  return e;
}

export async function readJson(p, fallback = null) {
  try {
    const v = await readJsonStrict(p);
    return v === undefined ? fallback : v;
  } catch { return fallback; } // noted in the unreadable list by readJsonStrict
}

// Run fn over items with at most n at a time (thousands of parallel reads fail with EMFILE).
export async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tmpSeq = 0;
// Retries for a rename that Windows refuses for a moment (an antivirus or indexer holding the file).
export const RENAME_RETRY = { codes: new Set(['EPERM', 'EBUSY', 'EACCES']), waits: [15, 40, 90, 200, 400] };
export async function renameRetry(from, to, rename = fs.rename) {
  for (let i = 0; ; i++) {
    try { return await rename(from, to); } catch (err) {
      if (!RENAME_RETRY.codes.has(err.code) || i >= RENAME_RETRY.waits.length) throw err;
      await sleep(RENAME_RETRY.waits[i]);
    }
  }
}
// Atomic write: a unique temp file next to the target (flushed to disk), then a rename over it.
// Writes to the same file from this process go one after another (Windows refuses a rename over a
// file another rename is replacing); between processes, renameRetry covers the moment.
const writeQueue = new Map(); // absolute path → the last write's promise
export function writeText(p, text) {
  const key = path.resolve(p);
  const prev = writeQueue.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeTextNow(p, text));
  writeQueue.set(key, next);
  next.catch(() => {}).then(() => { if (writeQueue.get(key) === next) writeQueue.delete(key); });
  return next;
}
async function writeTextNow(p, text) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now().toString(36)}${(++tmpSeq).toString(36)}${Math.random().toString(36).slice(2, 7)}.tmp`;
  try {
    const fh = await fs.open(tmp, 'wx');
    try { await fh.writeFile(text, 'utf8'); await fh.sync().catch(() => {}); } finally { await fh.close(); }
    await renameRetry(tmp, p);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}
export const writeJson = (p, data) => writeText(p, JSON.stringify(data, null, 2) + '\n');
export const exists = (p) => fss.existsSync(p);
export const existsAsync = (p) => fs.access(p).then(() => true, () => false);

// Append one JSON line to a JSON-lines log. If the file doesn't end with a newline (a crash
// mid-append), one is written first, so a broken line costs that line only — not the next too.
export async function appendLine(p, line) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  let lead = '';
  try {
    const fh = await fs.open(p, 'r');
    try {
      const { size } = await fh.stat();
      if (size > 0) {
        const b = Buffer.alloc(1);
        await fh.read(b, 0, 1, size - 1);
        if (b[0] !== 0x0a) lead = '\n';
      }
    } finally { await fh.close(); }
  } catch (err) { if (!MISSING.has(err.code)) throw err; }
  await fs.appendFile(p, lead + line + '\n', 'utf8');
}

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
