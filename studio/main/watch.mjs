// studio/main/watch.mjs — the studio's file watching (pure Node, so it can be tested and timed
// outside Electron). Used by electron/main.mjs.
//
// - One recursive OS watcher per top folder reports changes as they happen. Windows also reports
//   plain *reads* (access times), so a report only counts when the file's modification time is new,
//   it is new, or it is gone.
// - Scoped rescan: every folder the OS watcher mentioned is re-read shortly after (async), so a
//   sibling change the watcher coalesced or dropped is still caught — without scanning the repo.
// - Slow full sweep (default every 30 s, async, one folder at a time) as the last safety net, e.g.
//   for a watcher that died. It never blocks the main thread for long: every folder read yields.
//   With `focus()` (the games open in the studio or running), only those games are swept in full;
//   every other game is swept shallowly (its own folder and requests/), so 200 games cost little.
// - A watcher overflow (Windows drops events under a burst and reports a change with no name) is a
//   sign events were lost: a sweep runs at once instead of waiting for the next one.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const POLL_EXT = new Set(['.js', '.mjs', '.json', '.jsonl', '.html', '.css', '.md']);

// Folders never watched or scanned: dot folders, node_modules, history (archive/: old plans, archived
// requests and design copies), generated output (dev/out, clips/out), lesson cards (pictures) and
// local/saves (save backups).
const OUT_PARENTS = new Set(['dev', 'clips']);
function skipEntry(name, parentDir) {
  const parent = path.basename(parentDir);
  return name.startsWith('.') || name === 'node_modules' || name === 'archive'
    || (name === 'out' && OUT_PARENTS.has(parent)) || (name === 'cards' && parent === 'lessons')
    || (name === 'saves' && parent === 'local'); // save backups (studio/main/save-backup.mjs): nothing shows them
}
function skipRel(rel) {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  return parts.some((p, i) => skipEntry(p, i ? parts[i - 1] : ''));
}

// root: repo root · tops: folder names under it · classify(top, relPath) → change | null ·
// onChange(change) for every real change (scans add viaPoll: true).
export function createWatcher({ root, tops, classify, onChange, sweepMs = 30000, scopedDelayMs = 500, focus = null, log = console }) {
  const START = Date.now();
  const mtimes = new Map(); // abs file → mtimeMs (POLL_EXT files seen by scans and events)
  const dirFiles = new Map(); // abs dir → Set(abs files) seen there by the last scan
  const dirty = new Set(); // dirs the OS watcher mentioned, waiting for a scoped rescan
  const watchers = new Map();
  let primed = false, sweeping = null, scanTimer = null, sweepTimer = null, closed = false;
  const stats = { sweeps: 0, lastSweepMs: 0, lastSweepFiles: 0, scopedScans: 0, scopedDirs: 0, lastScopedMs: 0 };

  const topOf = (abs) => tops.find((t) => { const rel = path.relative(path.join(root, t), abs); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); });

  function report(abs) {
    const top = topOf(abs);
    const c = top && classify(top, path.relative(path.join(root, top), abs));
    if (c) onChange({ ...c, viaPoll: true });
  }

  // Did this reported path really change? (async stat; directories get a scoped rescan instead)
  async function reallyChanged(abs) {
    let st;
    try { st = await fsp.stat(abs); } catch {
      const had = mtimes.delete(abs);
      dirFiles.get(path.dirname(abs))?.delete(abs); // reported now; the scoped rescan mustn't repeat it
      return had || true;
    }
    if (st.isDirectory()) { markDirty(abs); return false; }
    const prev = mtimes.get(abs);
    mtimes.set(abs, st.mtimeMs);
    return prev === undefined ? st.mtimeMs >= START - 2000 : prev !== st.mtimeMs;
  }

  function markDirty(dir) {
    if (closed || !topOf(dir) && !tops.some((t) => path.join(root, t) === dir)) return;
    dirty.add(dir);
    if (!scanTimer) scanTimer = setTimeout(scanDirty, scopedDelayMs);
  }

  async function scanDirty() {
    scanTimer = null;
    if (sweeping) await sweeping; // the sweep covers them; rescan afterwards anyway (cheap)
    const dirs = [...dirty];
    dirty.clear();
    const t0 = performance.now();
    for (const d of dirs) await scanDir(d, 'new', null);
    stats.scopedScans++; stats.scopedDirs += dirs.length; stats.lastScopedMs = performance.now() - t0;
  }

  // mode 'all' recurses into every subfolder (full sweep); 'new' only into folders never seen
  // before (a folder created since the last scan). sweep: { dirs: Set, files: n } for full sweeps.
  // A game folder that isn't in focus: its own files (game.json…) and its requests, nothing deeper.
  async function scanShallow(gameDir, sweep) {
    await scanDir(gameDir, 'flat', sweep);
    await scanDir(path.join(gameDir, 'requests'), 'flat', sweep);
    sweep.skipped.push(gameDir + path.sep);
  }

  async function scanDir(dir, mode, sweep) {
    let entries = null;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { /* gone */ }
    if (!entries) {
      for (const [d, files] of [...dirFiles]) {
        if (d !== dir && !d.startsWith(dir + path.sep)) continue;
        for (const f of files) { mtimes.delete(f); if (primed) report(f); }
        dirFiles.delete(d);
      }
      return;
    }
    if (sweep) sweep.dirs.add(dir);
    const files = [], subdirs = [];
    for (const d of entries) {
      if (skipEntry(d.name, dir)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) subdirs.push(p);
      else if (POLL_EXT.has(path.extname(d.name).toLowerCase()) && !d.name.endsWith('.tmp')) files.push(p);
    }
    const ms = await Promise.all(files.map((f) => fsp.stat(f).then((s) => s.mtimeMs, () => null)));
    const now = new Set();
    files.forEach((f, i) => {
      const m = ms[i];
      if (m == null) return;
      now.add(f);
      const prev = mtimes.get(f);
      mtimes.set(f, m);
      if (primed && (prev === undefined ? m >= START : prev !== m)) report(f);
    });
    const before = dirFiles.get(dir);
    if (before && primed) for (const f of before) if (!now.has(f)) { mtimes.delete(f); report(f); }
    dirFiles.set(dir, now);
    if (sweep) sweep.files += now.size;
    if (mode === 'flat') return;
    const games = sweep && focus && dir === path.join(root, 'games') ? focus() : null;
    for (const s of subdirs) {
      if (games && !games.has(path.basename(s))) { await scanShallow(s, sweep); continue; }
      if (mode === 'all' || !dirFiles.has(s)) await scanDir(s, mode, sweep);
    }
  }

  function fullSweep() {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      const t0 = performance.now();
      const sweep = { dirs: new Set(), files: 0, skipped: [] };
      for (const top of tops) await scanDir(path.join(root, top), 'all', sweep);
      for (const [d, files] of [...dirFiles]) {
        if (sweep.dirs.has(d) || sweep.skipped.some((p) => d.startsWith(p))) continue; // not swept this time ≠ gone
        for (const f of files) { mtimes.delete(f); if (primed) report(f); }
        dirFiles.delete(d);
      }
      primed = true;
      stats.sweeps++; stats.lastSweepMs = performance.now() - t0; stats.lastSweepFiles = sweep.files;
    })().finally(() => { sweeping = null; });
    return sweeping;
  }

  function scheduleSweep(ms = sweepMs) {
    clearTimeout(sweepTimer);
    if (!closed) sweepTimer = setTimeout(() => fullSweep().catch((err) => log.error('[studio] sweep:', err.message)).finally(() => scheduleSweep()), ms);
  }

  function watchTop(top) {
    const dir = path.join(root, top);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const w = fs.watch(dir, { recursive: true }, (evt, name) => {
        if (!name) { scheduleSweep(300); return; } // an overflow: events were dropped, so look now
        const rel = name.toString();
        if (skipRel(rel)) return;
        const abs = path.join(dir, rel);
        markDirty(path.dirname(abs));
        const c = classify(top, rel);
        if (!c) return;
        if (c.kind === 'projects') { onChange(c); return; }
        reallyChanged(abs).then((yes) => { if (yes) onChange(c); }, () => {});
      });
      watchers.set(top, w);
      // Windows can error a recursive watcher (e.g. a folder deleted inside it): restart it and
      // sweep soon, since events may have been lost meanwhile.
      w.on('error', (err) => {
        log.error(`[studio] watcher ${top}/ failed (${err.code || err.message}); restarting`);
        try { w.close(); } catch {}
        watchers.delete(top);
        if (!closed) setTimeout(() => { watchTop(top); scheduleSweep(1500); }, 1000);
      });
    } catch (err) {
      log.error(`[studio] cannot watch ${top}/:`, err.message);
      if (!closed) setTimeout(() => watchTop(top), 5000);
    }
  }

  return {
    async start() {
      for (const top of tops) watchTop(top);
      await fullSweep(); // primes the known state; nothing is reported yet
      scheduleSweep();
    },
    close() {
      closed = true;
      clearTimeout(scanTimer); clearTimeout(sweepTimer);
      for (const w of watchers.values()) try { w.close(); } catch {}
      watchers.clear();
    },
    fullSweep,
    stats: () => ({ ...stats, files: mtimes.size, dirs: dirFiles.size }),
  };
}
