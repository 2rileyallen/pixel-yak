// studio/data/requests.mjs — requests (tickets) between the user and the AI, both directions (docs/contracts/REQUESTS.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, assertId, isId, within, str, nowIso, readJson, markWrite, writeJsonMarked, exists } from './core.mjs';
import { projectDir } from './games.mjs';

export const REQUEST_KINDS = ['art', 'frames', 'animation', 'audio', 'gameplay', 'level', 'story', 'bug', 'style', 'design', 'tuning', 'promo', 'kickoff', 'review', 'studio', 'other'];
// Brief me first: open (waiting for the AI's brief) → planned (briefed, waiting on the user) →
// approved (the user said go) → in-progress → done | wontfix | parked (the user said "not now").
export const REQUEST_STATUS = ['open', 'planned', 'approved', 'in-progress', 'done', 'wontfix', 'parked'];
export const REQUEST_FORMAT = 'pixel-yak-request@1'; // also reads the older 'pixel-studio-request@1' (same fields, fewer of them)
// Live = still on someone's plate (counted as "open" in badges and lists).
export const isLiveRequest = (r) => !!r && r.status !== 'done' && r.status !== 'wontfix' && r.status !== 'parked';
const NOTE_BY = ['user', 'ai', 'web'];
const cleanName = (v) => str(v, 60).replace(/[^\w .@+-]/g, '').trim();
// scope: a game id, or '_studio' for requests about Pixel Yak itself (local/inbox/).
// Closed requests can be moved to <dir>/archive/ (archiveRequests) so the live folder stays
// small; every lookup by id still finds them, and lists include them when asked.
function requestsDir(scope, archived = false) {
  const base = scope === '_studio' ? DIRS.inbox : path.join(projectDir(scope), 'requests');
  return archived ? path.join(base, 'archive') : base;
}
const CLOSED = new Set(['done', 'wontfix']);

// Where a request's JSON lives now: { dir, file, archived } or null.
function locateRequest(scope, id) {
  assertId('request', id);
  for (const archived of [false, true]) {
    const dir = requestsDir(scope, archived);
    const file = within(dir, `${id}.json`);
    if (exists(file)) return { dir, file, archived };
  }
  return null;
}

// Move a request's JSON + attachments between the live folder and archive/.
async function moveRequest(scope, r, toArchive) {
  const from = requestsDir(scope, !toArchive), to = requestsDir(scope, toArchive);
  await fs.mkdir(to, { recursive: true });
  for (const name of [...r.attachments, `${r.id}.json`]) {
    const a = within(from, name), b = within(to, name);
    if (!exists(a)) continue;
    markWrite(a); markWrite(b);
    await fs.rename(a, b);
  }
}

export function newRequestId(now = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const stamp = `${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `R-${stamp}-${Math.random().toString(36).slice(2, 5)}`;
}

function normRequest(scope, r) {
  const t = r.target && typeof r.target === 'object' ? r.target : null;
  const createdBy = ['ai', 'web'].includes(r.createdBy) ? r.createdBy : 'user'; // web = a player, from an online build
  return {
    format: REQUEST_FORMAT,
    id: r.id,
    scope,
    kind: REQUEST_KINDS.includes(r.kind) ? r.kind : 'other',
    tier: ['smart', 'builder', 'any'].includes(r.tier) ? r.tier : 'any',
    assignee: r.assignee === 'user' ? 'user' : 'ai',
    status: REQUEST_STATUS.includes(r.status) ? r.status : 'open',
    title: str(r.title, 200) || '(untitled)',
    body: str(r.body, 20000),
    target: t ? {
      asset: isId('asset', t.asset) ? t.asset : null,
      pose: isId('asset', t.pose) ? t.pose : null,
      anim: isId('asset', t.anim) ? t.anim : null,
      box: t.box && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(t.box[k])) ? { x: t.box.x | 0, y: t.box.y | 0, w: t.box.w | 0, h: t.box.h | 0 } : null,
      // a song or sound effect (the Sound view), optionally a section and bars of it
      song: isId('asset', t.song) ? t.song : null, sfx: isId('asset', t.sfx) ? t.sfx : null,
      section: isId('asset', t.section) ? t.section : null, bars: Array.isArray(t.bars) ? t.bars.filter(Number.isInteger).slice(0, 2) : null,
    } : null,
    attachments: Array.isArray(r.attachments) ? r.attachments.filter((a) => isId('file', a)) : [],
    createdBy,
    createdAt: str(r.createdAt, 40) || nowIso(),
    updatedAt: str(r.updatedAt, 40) || nowIso(),
    resolution: str(r.resolution, 8000),
    plan: str(r.plan, 8000), // the AI's brief: you asked / I'd change / unsure / size
    plannedAt: str(r.plannedAt, 40),
    notes: Array.isArray(r.notes) ? r.notes.slice(-100).map((n) => ({
      ts: str(n && n.ts, 40), by: NOTE_BY.includes(n && n.by) ? n.by : 'user', text: str(n && n.text, 4000),
    })).filter((n) => n.text) : [], // the user's notes on the brief, oldest first
    claimedBy: cleanName(r.claimedBy), // who is working it (start --by / YAK_AGENT)
    goNow: r.goNow === true && createdBy !== 'web', // "just do it": filed without a brief; never for a player's ticket
    history: Array.isArray(r.history) ? r.history.slice(-50).map((h) => ({
      ts: str(h.ts, 40), by: ['ai', 'web'].includes(h.by) ? h.by : 'user', status: REQUEST_STATUS.includes(h.status) ? h.status : undefined, note: str(h.note, 4000),
      ...(h.who ? { who: cleanName(h.who) } : {}),
    })) : [],
  };
}

// Can the AI start this request now? null = yes; otherwise why not:
// 'user' (it's for the user) · 'closed' · 'parked' · 'player' (a player's ticket with no brief —
// never skipped) · 'open' (not briefed yet) · 'planned' (briefed, waiting on the user's go).
// anyway: the user said "just do it" in chat. Kickoffs are briefed by the new-game pitch itself.
export function startBlock(r, { anyway = false } = {}) {
  if (r.assignee === 'user') return 'user';
  if (r.status === 'done' || r.status === 'wontfix') return 'closed';
  if (r.status === 'approved' || r.status === 'in-progress') return null;
  if (r.createdBy === 'web' && !r.plan) return 'player';
  if (r.status === 'parked') return anyway ? null : 'parked';
  if (r.goNow || r.kind === 'kickoff' || anyway) return null;
  return r.status === 'planned' ? 'planned' : 'open';
}

async function readRequestsIn(scope, archived) {
  const dir = requestsDir(scope, archived);
  let files = [];
  try { files = await fs.readdir(dir); } catch { return []; }
  const ids = files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => isId('request', id));
  const raws = await Promise.all(ids.map((id) => readJson(path.join(dir, `${id}.json`))));
  const out = [];
  raws.forEach((r, i) => { if (r) out.push(archived ? { ...normRequest(scope, { ...r, id: ids[i] }), archived: true } : normRequest(scope, { ...r, id: ids[i] })); });
  return out;
}

// archived: also list requests moved to archive/ (they carry archived: true).
export async function listRequests(scope, { archived = false } = {}) {
  const out = await readRequestsIn(scope, false);
  if (archived) out.push(...(await readRequestsIn(scope, true)));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRequest(scope, id) {
  const loc = locateRequest(scope, id);
  const r = loc && (await readJson(loc.file));
  if (!r) return null;
  const n = normRequest(scope, { ...r, id });
  return loc.archived ? { ...n, archived: true } : n;
}

// Move every closed (done / wontfix) request of a scope into archive/. Returns the ids moved.
export async function archiveRequests(scope) {
  const moved = [];
  for (const r of await readRequestsIn(scope, false)) {
    if (!CLOSED.has(r.status)) continue;
    await moveRequest(scope, r, true);
    moved.push(r.id);
  }
  return moved;
}

const AUDIO_EXT = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/midi': 'mid', 'audio/x-midi': 'mid', 'audio/mid': 'mid' };
// attachments: [{ name: 'shot.png', dataUrl: 'data:image/png;base64,…' }] (or audio/* for a reference recording)
export async function createRequest(scope, req, attachments = [], by = 'user') {
  const id = newRequestId();
  const dir = requestsDir(scope);
  const names = [];
  for (const [i, a] of attachments.slice(0, 6).entries()) {
    // a picture, or a recording the user attached as a reference (the Sound view; never shipped in a game)
    const m = /^data:(image\/png|audio\/[a-z0-9.+-]{2,24});base64,([A-Za-z0-9+/=]+)$/.exec(String(a && a.dataUrl || ''));
    const ext = m && (m[1] === 'image/png' ? 'png' : AUDIO_EXT[m[1]]);
    if (!ext) continue;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > (ext === 'png' ? 8_000_000 : 30_000_000)) continue;
    const name = `${id}-${i + 1}.${ext}`;
    const file = within(dir, name);
    markWrite(file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, buf);
    names.push(name);
  }
  // "Just do it" (goNow) skips the brief: the request starts approved. Never for a player's ticket.
  const goNow = req.goNow === true && by !== 'web' && req.assignee !== 'user';
  const status = goNow ? 'approved' : 'open';
  const r = normRequest(scope, {
    ...req, id, status, goNow, plan: '', plannedAt: '', notes: [], claimedBy: '', createdBy: by, createdAt: nowIso(), updatedAt: nowIso(),
    attachments: names, history: [{ ts: nowIso(), by, status, note: goNow ? 'created — just do it (no brief)' : 'created' }],
  });
  await writeJsonMarked(within(dir, `${id}.json`), r);
  return r;
}

// patch: any of title, body, kind, tier, assignee, resolution, target, status, goNow, claimedBy;
//   plan: the AI's brief (stamps plannedAt) · addNote: text appended to notes (the user's notes on
//   the brief, kept apart from history so none get trimmed) · note: a line for the history ·
//   who: the agent's name for the history entry.
export async function updateRequest(scope, id, patch, by = 'user') {
  const loc = locateRequest(scope, id);
  const cur = loc && (await readJson(loc.file));
  if (!cur) throw new Error(`request ${id} not found`);
  patch = patch || {};
  let file = loc.file;
  // reopening an archived request brings it (and its attachments) back to the live folder
  if (loc.archived && patch.status && !CLOSED.has(patch.status) && REQUEST_STATUS.includes(patch.status)) {
    await moveRequest(scope, normRequest(scope, { ...cur, id }), false);
    file = within(requestsDir(scope), `${id}.json`);
  }
  const next = { ...cur };
  for (const k of ['title', 'body', 'kind', 'tier', 'assignee', 'resolution', 'target', 'goNow', 'claimedBy']) if (k in patch) next[k] = patch[k];
  if ('plan' in patch) { next.plan = str(patch.plan, 8000); next.plannedAt = nowIso(); }
  const noteText = str(patch.addNote, 4000).trim();
  if (noteText) next.notes = [...(Array.isArray(cur.notes) ? cur.notes : []), { ts: nowIso(), by, text: noteText }];
  const statusChanged = patch.status && patch.status !== cur.status && REQUEST_STATUS.includes(patch.status);
  if (statusChanged) next.status = patch.status;
  next.history = [...(cur.history || [])];
  if (statusChanged || patch.note) next.history.push({ ts: nowIso(), by, status: statusChanged ? patch.status : undefined, note: str(patch.note, 4000), ...(patch.who ? { who: patch.who } : {}) });
  next.updatedAt = nowIso();
  const r = normRequest(scope, { ...next, id });
  await writeJsonMarked(file, r);
  return file === loc.file && loc.archived ? { ...r, archived: true } : r;
}

export async function deleteRequest(scope, id) {
  const loc = locateRequest(scope, id);
  const r = loc && (await getRequest(scope, id));
  if (!r) return;
  for (const a of r.attachments) { const f = within(loc.dir, a); markWrite(f); await fs.rm(f, { force: true }); }
  markWrite(loc.file);
  await fs.rm(loc.file, { force: true });
}

export function attachmentPath(scope, name, archived = false) {
  return within(requestsDir(scope, archived), assertId('file', name));
}
