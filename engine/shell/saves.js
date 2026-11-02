// engine/shell/saves.js — save slots for any game: as many slots as the game wants (the default is
// three), auto-save friendly, full state kept. Two flavours, same slots:
//   slotStore(prefix, opts)        — synchronous, plain JSON in localStorage, one key per slot.
//   await openSlots(prefix, opts)  — asynchronous, IndexedDB: no size wall, backups, failures reported.
// A game that outgrows localStorage moves to openSlots; its first open copies the old slots in.

// ------------------------------------------------------------------------------- slotStore ---
// One key per slot, plus the last slot played so a title screen can preselect it.
//   const saves = slotStore('my-game', { version: 1 });   // or { version: 2, migrate: (old) => newOrNull }
//   saves.write(1, state); saves.read(1); saves.last(); saves.erase(1);
export function slotStore(prefix, { slots = [1, 2, 3], version = 1, migrate = null } = {}) {
  const key = (n) => `${prefix}.slot${n}`;
  const lastKey = `${prefix}.last`;
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
  const valid = (n) => slots.includes(n);

  return {
    SLOTS: slots,
    // The stored object (with savedAt / v) or null when empty, unreadable or from another version
    // (a game that passes `migrate` gets older saves brought up to date instead; null = can't).
    read(n) {
      if (!valid(n)) return null;
      const raw = get(key(n));
      if (!raw) return null;
      try {
        const d = JSON.parse(raw);
        if (d && d.v === version) return d;
        return d && migrate ? migrate(d) || null : null;
      } catch (_) { return null; }
    },
    write(n, data) {
      if (!valid(n)) return false;
      const ok = set(key(n), JSON.stringify({ ...data, v: version, savedAt: Date.now() }));
      if (ok) set(lastKey, String(n));
      return ok;
    },
    erase(n) {
      if (!valid(n)) return;
      try { localStorage.removeItem(key(n)); } catch (_) { /* storage blocked: nothing to erase */ }
      if (this.last() === n) { try { localStorage.removeItem(lastKey); } catch (_) { /* ignore */ } }
    },
    last() { const n = Number(get(lastKey)); return valid(n) ? n : null; },
  };
}

// ------------------------------------------------------------------------------- openSlots ---
// The same slots in IndexedDB (one database per game, `${prefix}.saves`): no ~5–10 MB localStorage
// wall shared by every game opened from files, and storing never blocks a frame — the caller
// serializes (a snapshot, at once), the store writes it in the background.
// Backups: each slot has two records and a small head saying which is current; a save goes into the
// other record and moves the head, in one transaction. So the previous save is always kept, and a
// write that fails leaves the slot exactly as it was.
// Reading: a save that can't be read — bad JSON, a version `migrate` can't bring forward, or one
// `accept` throws on — falls back to the backup and says so ({ backup: true }); with neither readable
// the slot is { damaged: true }, never empty. The next save then goes over the bad record.
// Failures are never silent: write() resolves false and `failed` says which slot and why, until a
// write succeeds. First open: saves the game made with slotStore are copied in (its localStorage keys
// are left as they were — an older build still finds them).
// Summaries (a title's slot cards): with `summary: (data) => small object`, each save's summary is kept
// in its slot's head, next to it (and the backup's too), written in the same transaction — so a title
// shows every slot without reading a save (multi-MB at scale). Heads from before summaries get theirs
// the first time they're opened (each save read once). info(n) answers from the head at once; check(n)
// also looks at the stored save's length (read, never parsed; once a session): a save cut short shows
// its backup's summary, or damaged. Anything else wrong with a save is found when it's loaded.
// Without IndexedDB (or when it won't open) the same rules run on localStorage.
//   const saves = await openSlots('my-game', { version: 2, migrate, summary: (d) => ({ level: d.level }) });
//   await saves.load(n, (data) => new Game(data))  → null (empty) or { value, data, backup, damaged, error }
//   await saves.write(n, state)                    → true, or false with saves.failed = { slot, error }
//   saves.info(n) / await saves.check(n)           → null (empty) or { sum, savedAt, backup, damaged }
//   await saves.erase(n); saves.last(); saves.has(n); saves.SLOTS; saves.kind ('indexeddb' | 'localstorage' | 'memory')
export async function openSlots(prefix, { slots = [1, 2, 3], version = 1, migrate = null, legacy = true, summary = null } = {}) {
  let kv = (await openIdb(`${prefix}.saves`)) || lsKv(`${prefix}.saves.`);
  const valid = (n) => slots.includes(n);
  const rec = (n, i) => `slot${n}.${i}`, headKey = (n) => `head${n}`;
  // slot → { cur: 0 | 1, savedAt, bytes, sum, prev }: `sum` the current save's summary, `prev` the other
  // record (the backup) as { savedAt, bytes, sum } or null
  const heads = new Map();
  const bad = new Map();       // slot → the record found unreadable (the next save goes over it)
  const damaged = new Set();   // slots found with neither record readable
  const checked = new Map();   // slot → the head whose records check() (or a write) has vouched for
  let meta = { last: null, migrated: 0 };

  const loadHeads = async () => {
    const got = await kv.get(['meta', ...slots.map(headKey)]);
    if (got[0]) meta = got[0];
    heads.clear();
    slots.forEach((n, i) => { if (got[i + 1]) heads.set(n, got[i + 1]); });
  };
  // IndexedDB that opens but can't be read: don't guess at its slots (a new save could go over a
  // good one) — run on localStorage this session and leave the database as it is.
  try { await loadHeads(); } catch (e) {
    console.warn(`[saves] ${prefix}: the save database can't be read (${e && e.message}); using localStorage this time`);
    kv = lsKv(`${prefix}.saves.`);
    await loadHeads().catch(() => {});
  }

  // First open: copy the slotStore saves in (only into slots this store doesn't have yet).
  if (legacy && !meta.migrated) {
    const ls = localStore();
    const puts = [];
    let last = meta.last;
    if (ls) {
      for (const n of slots) {
        const raw = ls.getItem(`${prefix}.slot${n}`);
        if (!raw || heads.has(n)) continue;
        let savedAt = 0;
        try { savedAt = JSON.parse(raw).savedAt || 0; } catch (_) { /* copied as it is: reading it falls back or says damaged */ }
        const h = { cur: 0, savedAt, bytes: raw.length };
        puts.push([rec(n, 0), raw], [headKey(n), h]);
        heads.set(n, h);
      }
      const l = Number(ls.getItem(`${prefix}.last`));
      if (last === null && valid(l) && heads.has(l)) last = l;
    }
    const next = { ...meta, last, migrated: Date.now(), copied: puts.length / 2 };
    try { await kv.put([...puts, ['meta', next]]); meta = next; } catch (_) { await loadHeads().catch(() => {}); } // try again next open
  }

  const parse = (raw) => {
    if (typeof raw !== 'string') throw new Error('no save there');
    const d = JSON.parse(raw);
    if (d && d.v === version) return d;
    const m = d && migrate ? migrate(d) : null;
    if (!m) throw new Error(`a save of version ${d && d.v} that can't be brought forward`);
    return m;
  };
  const attempt = async (n, i, accept) => { const [raw] = await kv.get([rec(n, i)]); const data = parse(raw); return { value: accept(data), data }; };
  const summed = (data) => { try { return summary(data); } catch (e) { console.warn(`[saves] ${prefix}: no summary (${e && e.message})`); return null; } };

  // Heads from before summaries (or copied in above): each record read once, its summary kept in the head.
  // A slot whose save can't be read keeps its head as it is (asked again next open) and shows its backup.
  if (summary) {
    const puts = [];
    for (const n of slots) {
      const h = heads.get(n);
      if (!h || 'sum' in h) continue;
      const read = async (i) => {
        const [raw] = await kv.get([rec(n, i)]);
        try { const d = parse(raw); return { savedAt: d.savedAt || 0, bytes: raw.length, sum: summed(d) }; } catch (_) { return null; }
      };
      const a = await read(h.cur).catch(() => null), b = await read(1 - h.cur).catch(() => null);
      if (a) { const nh = { ...h, sum: a.sum, prev: b }; heads.set(n, nh); puts.push([headKey(n), nh]); }
      else if (b) { bad.set(n, h.cur); heads.set(n, { ...h, prev: b }); }
      else damaged.add(n);
      checked.set(n, heads.get(n));
    }
    if (puts.length) await kv.put(puts).catch(() => {}); // not stored: done again next open
  }
  const fail = (n, e) => {
    store.failed = { slot: n, error: String((e && (e.message || e.name)) || e), at: Date.now() };
    console.warn(`[saves] ${prefix}: slot ${n} was not saved: ${store.failed.error}`);
    return false;
  };

  const store = {
    SLOTS: slots, kind: kv.kind,
    failed: null,   // { slot, error, at } while the last write failed
    stats: null,    // the last write: { slot, bytes, encodeMs, storeMs }
    breakWrites: false, // tests only: every write fails (as a full disk would) while this is true
    has(n) { return heads.has(n); },
    last() { return valid(meta.last) && heads.has(meta.last) ? meta.last : null; },
    // What a slot holds, from its head alone (no save read): null (empty) or { sum, savedAt, backup, damaged }
    // — the backup's summary once the current save is known to be unreadable.
    info(n) {
      const h = valid(n) && heads.get(n);
      if (!h) return null;
      if (damaged.has(n)) return { sum: null, savedAt: 0, backup: false, damaged: true };
      if (bad.get(n) !== h.cur) return { sum: h.sum === undefined ? null : h.sum, savedAt: h.savedAt || 0, backup: false, damaged: false };
      const p = h.prev;
      return p ? { sum: p.sum === undefined ? null : p.sum, savedAt: p.savedAt || 0, backup: true, damaged: false } : { sum: null, savedAt: 0, backup: false, damaged: true };
    },
    // info(n) after a look at the stored save's length against its head's (read, not parsed; once per
    // head): a save cut short is unreadable — its backup is looked at the same way.
    async check(n) {
      const h = valid(n) && heads.get(n);
      if (!h || checked.get(n) === h) return store.info(n);
      checked.set(n, h);
      const fits = async (i, want) => { const [raw] = await kv.get([rec(n, i)]); return typeof raw === 'string' && raw.length === want; };
      try {
        if (!(await fits(h.cur, h.bytes)) && heads.get(n) === h) {
          bad.set(n, h.cur);
          if (!(h.prev && (await fits(1 - h.cur, h.prev.bytes))) && heads.get(n) === h) { bad.delete(n); damaged.add(n); }
        }
      } catch (_) { checked.delete(n); } // couldn't read: look again next time
      return store.info(n);
    },
    async load(n, accept = (d) => d) {
      const h = heads.get(n);
      if (!valid(n) || !h) return null;
      let first;
      try { const r = { ...(await attempt(n, h.cur, accept)), backup: false, damaged: false }; bad.delete(n); damaged.delete(n); return r; } catch (e) { first = e; }
      bad.set(n, h.cur); damaged.delete(n);
      try { return { ...(await attempt(n, 1 - h.cur, accept)), backup: true, damaged: false, error: String(first && first.message) }; } catch (e) {
        bad.delete(n); damaged.add(n); // neither: the next save goes into the other record, keeping this one
        return { value: null, data: null, backup: false, damaged: true, error: String(first && first.message) };
      }
    },
    // Issues the whole transaction now (so a save made as the page closes still goes out), resolves
    // when it's stored. Two writes in a row go to alternate records: the backup is the one before.
    // The head carries the new save's summary and the backup's (the record left as it was).
    write(n, data) {
      if (!valid(n)) return Promise.resolve(false);
      const t0 = performance.now(), savedAt = Date.now();
      let json;
      try { json = JSON.stringify({ ...data, v: version, savedAt }); } catch (e) { return Promise.resolve(fail(n, e)); }
      const h = heads.get(n), wasBad = bad.get(n), wasDamaged = damaged.has(n), to = wasBad !== undefined ? wasBad : h ? 1 - h.cur : 0;
      const prev = !h || wasDamaged ? null : wasBad !== undefined ? h.prev || null : { savedAt: h.savedAt || 0, bytes: h.bytes, sum: h.sum === undefined ? null : h.sum };
      const nh = { cur: to, savedAt, bytes: json.length, sum: summary ? summed(data) : null, prev }, nm = { ...meta, last: n };
      heads.set(n, nh); bad.delete(n); damaged.delete(n); checked.set(n, nh); // at once: a second write before this one lands goes to the other record
      const t1 = performance.now();
      let p;
      if (store.breakWrites) p = Promise.reject(new Error('writes switched off (breakWrites)'));
      else try { p = kv.put([[rec(n, to), json], [headKey(n), nh], ['meta', nm]]); } catch (e) { p = Promise.reject(e); }
      return p.then(() => {
        meta = nm;
        store.stats = { slot: n, bytes: json.length, encodeMs: t1 - t0, storeMs: performance.now() - t1 };
        store.failed = null;
        return true;
      }, async (e) => {
        await loadHeads().catch(() => {}); // what's really stored (a failed transaction changed nothing)
        if (wasBad !== undefined && !bad.has(n)) bad.set(n, wasBad);
        if (wasDamaged) damaged.add(n);
        return fail(n, e);
      });
    },
    async erase(n) {
      if (!valid(n)) return;
      heads.delete(n); bad.delete(n); damaged.delete(n); checked.delete(n);
      if (meta.last === n) meta = { ...meta, last: null };
      try { await kv.put([['meta', meta]], [headKey(n), rec(n, 0), rec(n, 1)]); } catch (e) { console.warn(`[saves] ${prefix}: slot ${n} was not erased: ${e && e.message}`); await loadHeads().catch(() => {}); }
    },
  };
  return store;
}

function localStore() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }

// IndexedDB as a tiny key → value store: get(keys) → values; put(entries, deletes) in one transaction.
function openIdb(name) {
  return new Promise((resolve) => {
    let req;
    try { if (typeof indexedDB === 'undefined') { resolve(null); return; } req = indexedDB.open(name, 1); } catch (_) { resolve(null); return; }
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // a newer version or a delete elsewhere: let it through
      resolve({
        kind: 'indexeddb',
        get: (keys) => new Promise((res, rej) => {
          const tx = db.transaction('kv', 'readonly'), s = tx.objectStore('kv'), out = new Array(keys.length);
          keys.forEach((k, i) => { const r = s.get(k); r.onsuccess = () => { out[i] = r.result; }; });
          tx.oncomplete = () => res(out);
          tx.onabort = () => rej(tx.error || new Error('read aborted'));
        }),
        put: (entries, dels = []) => new Promise((res, rej) => {
          // durability strict: done means on disk. commit() sends it at once — a save made while the
          // page closes doesn't wait for the page to come back to the event loop.
          const tx = db.transaction('kv', 'readwrite', { durability: 'strict' }), s = tx.objectStore('kv');
          for (const [k, v] of entries) s.put(v, k);
          for (const k of dels) s.delete(k);
          tx.oncomplete = () => res(true);
          tx.onabort = () => rej(tx.error || new Error('write aborted'));
          if (tx.commit) tx.commit();
        }),
      });
    };
  });
}

// The same over localStorage (strings kept as they are, anything else as JSON); in memory without it.
function lsKv(prefix) {
  const ls = localStore(), mem = new Map();
  const enc = (v) => (typeof v === 'string' ? `s${v}` : `j${JSON.stringify(v)}`);
  const dec = (raw) => (raw == null ? undefined : raw[0] === 's' ? raw.slice(1) : JSON.parse(raw.slice(1)));
  return {
    kind: ls ? 'localstorage' : 'memory',
    get: async (keys) => keys.map((k) => { try { return dec(ls ? ls.getItem(prefix + k) : mem.get(k)); } catch (_) { return undefined; } }),
    // entries in order (records before heads): a write that fails part way leaves the head where it was
    put: async (entries, dels = []) => {
      for (const [k, v] of entries) { if (ls) ls.setItem(prefix + k, enc(v)); else mem.set(k, enc(v)); }
      for (const k of dels) { if (ls) ls.removeItem(prefix + k); else mem.delete(k); }
      return true;
    },
  };
}
