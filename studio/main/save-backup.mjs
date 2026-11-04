// studio/main/save-backup.mjs — the person's playtest saves, kept as plain files.
// A game window keeps its saves in the studio's browser profile (IndexedDB and localStorage of its
// origin, studio://play-<id>), which a reinstall, a new computer or a cleaned profile loses. So the
// studio copies that storage, whole and as it is, to local/saves/<id>/<time>.json: when the window
// closes and every few minutes while it runs (only when something changed). When a game opens with
// no saves at all on this computer and a copy exists, the studio offers to put it back. It never
// writes over saves that are there. The copy is read from inside the game's own page (its origin),
// and only ever written back into that same origin.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as D from '../data/index.mjs';

export const SAVES_FORMAT = 'pixel-yak-origin-saves@1';
const KEEP_LATEST = 10;  // the newest copies…
const KEEP_DAYS = 30;    // …plus the last copy of each of the last 30 days
const MAX_BYTES = 200_000_000;
export const EVERY_MS = 5 * 60 * 1000;

// PIXEL_YAK_SAVES_DIR: tests only (a studio capture run that checks backups, away from your local/).
export const TEST_DIR = process.env.PIXEL_YAK_SAVES_DIR ? path.resolve(process.env.PIXEL_YAK_SAVES_DIR) : null;
export const backupDir = (pid) => path.join(TEST_DIR || path.join(D.DIRS.local, 'saves'), D.assertId('project', pid));

// Runs in the game's page: its whole storage as JSON text. Values IndexedDB can hold that JSON can't
// (dates, binary, Map/Set, blobs, undefined, NaN) are tagged { $y: … } so they come back as they were.
export const DUMP_JS = `(async () => {
  const pending = [];
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const enc = (v) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $y: 'num', v: String(v) };
    if (v === undefined) return { $y: 'undef' };
    if (typeof v === 'bigint') return { $y: 'big', v: String(v) };
    if (v instanceof Date) return { $y: 'date', v: v.getTime() };
    if (v instanceof ArrayBuffer) return { $y: 'ab', v: b64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) return { $y: 'ta', t: v.constructor.name, v: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (typeof Blob !== 'undefined' && v instanceof Blob) { const o = { $y: 'blob', type: v.type, v: '' }; pending.push(v.arrayBuffer().then((ab) => { o.v = b64(new Uint8Array(ab)); })); return o; }
    if (v instanceof Map) return { $y: 'map', v: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    if (v instanceof Set) return { $y: 'set', v: [...v].map(enc) };
    if (Array.isArray(v)) return v.map(enc);
    if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = enc(v[k]); return '$y' in v ? { $y: 'obj', v: o } : o; }
    return null;
  };
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = { format: '${SAVES_FORMAT}', at: new Date().toISOString(), origin: location.origin, localStorage: {}, indexedDB: [] };
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out.localStorage[k] = localStorage.getItem(k); } } catch (_) {}
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  for (const { name } of dbs) {
    if (!name) continue;
    const db = await new Promise((res) => {
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => r.transaction.abort(); // gone since it was listed: never create one
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    });
    if (!db) continue;
    const entry = { name, version: db.version, stores: [] };
    for (const sn of db.objectStoreNames) {
      const s = db.transaction(sn, 'readonly').objectStore(sn);
      const kr = s.getAllKeys(), vr = s.getAll(); // both asked at once: the transaction ends after them
      const [keys, values] = await Promise.all([req(kr), req(vr)]);
      entry.stores.push({
        name: sn, keyPath: s.keyPath, autoIncrement: s.autoIncrement,
        indexes: [...s.indexNames].map((n) => { const ix = s.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }),
        records: keys.map((k, i) => [enc(k), enc(values[i])]),
      });
    }
    db.close();
    out.indexedDB.push(entry);
  }
  await Promise.all(pending);
  return JSON.stringify(out);
})()`;

// Runs in a blank page of the game's origin: is there no saved data at all?
export const EMPTY_JS = `(async () => {
  let n = 0; try { n = localStorage.length; } catch (_) {}
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  return n === 0 && dbs.length === 0;
})()`;

// Runs in a blank page of the game's origin: puts a copy back (only called when it has no saved data).
export const restoreJs = (text) => `(async (text) => {
  const data = JSON.parse(text);
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const dec = (v) => {
    if (Array.isArray(v)) return v.map(dec);
    if (!v || typeof v !== 'object') return v;
    if (!('$y' in v)) { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
    switch (v.$y) {
      case 'num': return Number(v.v);
      case 'undef': return undefined;
      case 'big': return BigInt(v.v);
      case 'date': return new Date(v.v);
      case 'ab': return unb64(v.v).buffer;
      case 'ta': { const u8 = unb64(v.v), T = globalThis[v.t]; return v.t === 'DataView' ? new DataView(u8.buffer) : T && T.BYTES_PER_ELEMENT ? new T(u8.buffer, 0, u8.byteLength / T.BYTES_PER_ELEMENT) : u8; }
      case 'blob': return new Blob([unb64(v.v)], { type: v.type });
      case 'map': return new Map(v.v.map(([k, x]) => [dec(k), dec(x)]));
      case 'set': return new Set(v.v.map(dec));
      case 'obj': { const o = {}; for (const k of Object.keys(v.v)) o[k] = dec(v.v[k]); return o; }
      default: return null;
    }
  };
  for (const [k, v] of Object.entries(data.localStorage || {})) localStorage.setItem(k, v);
  for (const e of data.indexedDB || []) {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(e.name, e.version || 1);
      r.onupgradeneeded = () => {
        for (const s of e.stores) {
          const os = r.result.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: !!s.autoIncrement });
          for (const ix of s.indexes || []) os.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry });
        }
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    for (const s of e.stores) {
      if (!s.records.length) continue;
      await new Promise((res, rej) => {
        const tx = db.transaction(s.name, 'readwrite', { durability: 'strict' }), os = tx.objectStore(s.name);
        for (const [k, v] of s.records) { if (s.keyPath == null) os.put(dec(v), dec(k)); else os.put(dec(v)); }
        tx.oncomplete = () => res(); tx.onabort = () => rej(tx.error || new Error('restore aborted'));
      });
    }
    db.close();
  }
  return true;
})(${JSON.stringify(text)})`;

// ------------------------------------------------------------------- files ---
const lastHash = new Map(); // pid -> hash of the newest copy on disk (so an unchanged game writes nothing)
const contentHash = (d) => crypto.createHash('sha1').update(JSON.stringify([d.localStorage, d.indexedDB])).digest('hex');
const stampOf = (iso) => iso.replace(/[:.]/g, '-');
async function copies(dir) {
  try { return (await fs.readdir(dir)).filter((f) => /^\d{4}-\d\d-\d\dT[\d-]+Z\.json$/.test(f)).sort(); } catch { return []; }
}

// A dump from DUMP_JS → its file (or null: not a dump, nothing saved yet, or the same as the newest copy).
export async function writeBackup(pid, text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || d.format !== SAVES_FORMAT || typeof d.localStorage !== 'object' || !Array.isArray(d.indexedDB)) return null;
  if (!Object.keys(d.localStorage || {}).length && !d.indexedDB.length) return null; // this game has saved nothing
  const dir = backupDir(pid);
  const hash = contentHash(d);
  if (!lastHash.has(pid)) {
    const list = await copies(dir);
    const newest = list.length ? await D.readJson(path.join(dir, list[list.length - 1])) : null;
    lastHash.set(pid, newest ? contentHash(newest) : null);
  }
  if (lastHash.get(pid) === hash) return null;
  const at = new Date().toISOString();
  const file = path.join(dir, `${stampOf(at)}.json`);
  await D.writeText(file, JSON.stringify({ ...d, at, game: pid }));
  lastHash.set(pid, hash);
  await prune(dir);
  return file;
}

// Keep the newest copies and the last copy of each recent day; older ones go.
async function prune(dir) {
  const list = await copies(dir);
  const keep = new Set(list.slice(-KEEP_LATEST));
  const byDay = new Map();
  for (const f of list) byDay.set(f.slice(0, 10), f); // sorted: the day's last copy wins
  const days = [...byDay.keys()].sort().slice(-KEEP_DAYS);
  for (const day of days) keep.add(byDay.get(day));
  for (const f of list) if (!keep.has(f)) await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
}

// The newest copy: { file, text, at } or null.
export async function latestBackup(pid) {
  const dir = backupDir(pid);
  const list = await copies(dir);
  for (let i = list.length - 1; i >= 0; i--) {
    const file = path.join(dir, list[i]);
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    let d = null;
    try { d = JSON.parse(text); } catch { /* a broken copy: try the one before */ }
    if (d && d.format === SAVES_FORMAT) return { file, text, at: d.at || '' };
  }
  return null;
}

// Copy a running game window's saves to disk (a few seconds at most; failures are only logged).
export async function backupWindow(pid, win, log = console) {
  if (!win || win.isDestroyed()) return null;
  try {
    const text = await Promise.race([
      win.webContents.executeJavaScript(DUMP_JS, true),
      new Promise((r) => setTimeout(() => r(null), 4000)),
    ]);
    return await writeBackup(pid, text);
  } catch (err) {
    log.warn(`[studio] ${pid}: saves not backed up (${err.message})`);
    return null;
  }
}
