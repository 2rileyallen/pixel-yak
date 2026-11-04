// studio/data/lessons.mjs — what the AI learns from the user. Each game owns its look: its
// design/ folder holds art.md (the art design file), palette.js, and lessons/ — one JSON line per
// studio save (log.jsonl + a card image each) and the distillations a smart model made of them
// (distilled.jsonl; skill art-learn). The studio calls a game's look a "style": its id is the game id.
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertId, isId, within, str, nowIso, readJson, markWrite, exists, appendLine } from './core.mjs';
import { projectDir, listProjects } from './games.mjs';

export const styleDir = (id) => path.join(projectDir(assertId('style', id)), 'design');

// JSON-lines logs (lessons/log.jsonl, distilled.jsonl) are append-only, so they're read
// incrementally: cached by size + mtime, and when a file grew only the new bytes are parsed
// (after checking the bytes we stopped at are unchanged — otherwise it's re-read whole).
// In memory each line is kept light (the pixel rows and legend are dropped) with its byte
// range, so readLogFull() can fetch the complete lines that are actually asked for.
// file -> { end, mtimeMs, tail: Buffer, items: [{ v: light object, at, len }] }
const logCache = new Map();
const TAIL = 64;
const HEAVY = ['rows', 'legend'];

export async function readLog(file) {
  let st;
  try { st = await fs.stat(file); } catch { logCache.delete(file); return []; }
  let c = logCache.get(file);
  if (c && c.end === st.size && c.mtimeMs === st.mtimeMs) return c.items;
  let buf = null, base = 0;
  if (c && st.size > c.end) {
    const k = Math.min(TAIL, c.end);
    const fh = await fs.open(file, 'r');
    try {
      const b = Buffer.alloc(st.size - c.end + k);
      const { bytesRead } = await fh.read(b, 0, b.length, c.end - k);
      if (b.subarray(0, k).equals(c.tail)) { buf = b.subarray(k, bytesRead); base = c.end; }
    } finally { await fh.close(); }
  }
  if (!buf) { buf = await fs.readFile(file).catch(() => Buffer.alloc(0)); base = 0; c = null; }
  const used = buf.lastIndexOf(0x0a) + 1; // complete lines only: a line being appended waits
  const items = c ? c.items : [];
  let at = base;
  for (let i = 0; i < used;) {
    const j = buf.indexOf(0x0a, i);
    const line = buf.subarray(i, j);
    if (line.length) {
      try {
        const v = JSON.parse(line.toString('utf8'));
        if (v && typeof v === 'object') { for (const k of HEAVY) delete v[k]; items.push({ v, at, len: line.length }); }
      } catch { /* a broken line is skipped */ }
    }
    at += j + 1 - i;
    i = j + 1;
  }
  const tail = Buffer.concat([c ? c.tail : Buffer.alloc(0), buf.subarray(0, used)]);
  logCache.set(file, { end: base + used, mtimeMs: st.mtimeMs, tail: Buffer.from(tail.subarray(Math.max(0, tail.length - TAIL))), items });
  return items;
}

// Light records of a log (shared with the cache: read them, don't change them).
export async function readLines(file) { return (await readLog(file)).map((x) => x.v); }

// Complete lines (with rows + legend) for chosen items of a log.
async function readLogFull(file, items) {
  if (!items.length) return [];
  const fh = await fs.open(file, 'r');
  try {
    return await Promise.all(items.map(async (x) => {
      const b = Buffer.alloc(x.len);
      await fh.read(b, 0, x.len, x.at);
      try { return JSON.parse(b.toString('utf8')); } catch { return x.v; }
    }));
  } finally { await fh.close(); }
}

// Every game that has a look of its own (a design/ folder).
export async function listStyles() {
  const out = [];
  for (const p of await listProjects()) if (p.style) out.push(await styleSummary(p.id));
  return out;
}

export async function styleSummary(id) {
  const dir = styleDir(id);
  const game = (await readJson(path.join(dir, '..', 'game.json'))) || {};
  const lessons = await readLog(path.join(dir, 'lessons', 'log.jsonl'));
  const distilled = await readLog(path.join(dir, 'lessons', 'distilled.jsonl'));
  const last = distilled.length ? distilled[distilled.length - 1].v : null;
  let lastIdx = -1;
  if (last && last.through) for (let i = lessons.length - 1; i >= 0; i--) if (lessons[i].v.id === last.through) { lastIdx = i; break; }
  return {
    id,
    name: `${game.name || id} look`,
    version: (last && Number(last.version)) || 1,
    from: game.designs && isId('design', game.designs.art) ? game.designs.art : null, // the library entry it started from
    lessons: lessons.length,
    undistilled: lastIdx >= 0 ? lessons.length - lastIdx - 1 : lessons.length,
    lastDistilled: last || null,
    hasStyleMd: exists(path.join(dir, 'art.md')),
    styleFile: `games/${id}/design/art.md`,
  };
}

export async function readStyle(id) {
  const dir = styleDir(id);
  const read = (f) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '');
  return {
    ...(await styleSummary(id)),
    styleMd: await read('art.md'),
    distilled: await readLines(path.join(dir, 'lessons', 'distilled.jsonl')),
  };
}

// lesson: the object built by the studio (docs/contracts/LESSONS.md). card: optional PNG data URL.
export async function appendLesson(styleId, lesson, cardDataUrl = null) {
  const dir = styleDir(styleId);
  const id = str(lesson.id, 120);
  if (!/^L-[A-Za-z0-9_.-]{4,118}$/.test(id)) throw new Error('bad lesson id');
  const line = JSON.stringify({ ...lesson, id });
  if (line.length > 2_000_000) throw new Error('lesson too large');
  if (cardDataUrl) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(cardDataUrl));
    if (m) {
      const file = within(path.join(dir, 'lessons', 'cards'), `${id}.png`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      markWrite(file);
      await fs.writeFile(file, Buffer.from(m[1], 'base64'));
    }
  }
  const log = path.join(dir, 'lessons', 'log.jsonl');
  await fs.mkdir(path.dirname(log), { recursive: true });
  markWrite(log);
  await appendLine(log, line); // a line cut short by a crash costs only itself
  return id;
}

// Newest first. Light records (no pixel rows/legend) unless full: true.
export async function readLessons(styleId, { limit = 200, project = null, full = false } = {}) {
  const file = path.join(styleDir(styleId), 'lessons', 'log.jsonl');
  const all = await readLog(file);
  const picked = (project ? all.filter((x) => x.v.project === project) : all).slice(-limit).reverse();
  return full ? readLogFull(file, picked) : picked.map((x) => x.v);
}

export async function addDistilled(styleId, { version, through, summary, by = 'ai' }) {
  const dir = styleDir(styleId);
  const entry = { ts: nowIso(), version: Number(version) || null, through: str(through, 120), summary: str(summary, 8000), by };
  const file = path.join(dir, 'lessons', 'distilled.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  markWrite(file);
  await appendLine(file, JSON.stringify(entry));
  return entry;
}
