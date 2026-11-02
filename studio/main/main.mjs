// studio/main/main.mjs — Pixel Yak's desktop app (main process). Launched as `npm start`
// (`electron .`, package.json "main") or launch.bat on Windows.
//
// - Serves the repo read-only over a private studio:// protocol (no caching, so code an AI
//   just wrote is what you see). studio://app/… is the studio UI; studio://play-<id>/… runs a
//   game in its own origin, so every game keeps its own saves.
// - Watches games/, designs/, local/ and engine/ and pushes changes to the UI:
//   new games, new assets and new requests appear without a restart.
// - Game windows get studio edits live (window.studioLink) and F9 sends the current moment
//   (screenshot + console, + state, save-state and the last seconds from engine/link) to the
//   studio as a request draft. F8 tuning lives in engine/link + studio/main/ipc-link.mjs.
// - `electron . --capture=<steps.json> --out=<dir>` drives the studio headless and saves
//   screenshots (the look-at-your-work loop for the studio itself, see docs/STUDIO.md).

import { app, BrowserWindow, ipcMain, protocol, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as D from '../data/index.mjs';
import { createWatcher } from './watch.mjs';

const ROOT = D.ROOT;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(ROOT, 'studio', 'ui', fs.existsSync(path.join(ROOT, 'studio', 'ui', 'icon.png')) ? 'icon.png' : 'icon.ico');
const CAPTURE = (() => {
  const a = process.argv.find((x) => x.startsWith('--capture='));
  const o = process.argv.find((x) => x.startsWith('--out='));
  return a ? { steps: path.resolve(a.slice(10)), out: path.resolve(o ? o.slice(6) : 'studio-capture') } : null;
})();

// --profile=<dir>: a separate profile (and single-instance lock) — lets a test instance run beside yours.
const PROFILE = process.argv.find((x) => x.startsWith('--profile='));
if (CAPTURE) {
  // every capture run gets its own throwaway profile, so parallel runs never share storage or locks
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-yak-capture-'));
  app.setPath('userData', tmp);
  app.on('quit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* locked: the OS temp cleaner gets it */ } });
} else if (PROFILE) app.setPath('userData', path.resolve(PROFILE.slice(10)));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([{
  scheme: 'studio',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

// ---------------------------------------------------------------- protocol ---
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mid': 'audio/midi',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function servePath(rel) {
  const parts = rel.split('/').filter(Boolean);
  // no dotfiles/dotfolders (.git, .wrangler, .env …); node_modules only for three.js
  if (parts.some((s) => s.startsWith('.'))) return null;
  if (parts[0] === 'node_modules' && parts[1] !== 'three') return null;
  const abs = path.resolve(ROOT, ...parts);
  return D.inside(ROOT, abs) ? abs : null;
}

// Every file each project's art host (studio://host-<id>) fetched since it last (re)started: its
// art module graph (assets.js → sprites.js → art modules, core/art, the style palette, plus any
// dynamic import or fetch). The Art view reloads the art only when a changed file is in here.
const hostFiles = new Map(); // projectId -> Set(repo-relative path)
function noteHostFile(host, rel) {
  const m = /^host-([a-z0-9][a-z0-9-]{0,47})$/.exec(host);
  if (!m) return;
  const p = rel.replace(/^\/+/, '');
  if (p === 'studio/ui/host.html') { hostFiles.set(m[1], new Set()); return; } // a fresh host frame
  if (p.startsWith('studio/')) return;
  let set = hostFiles.get(m[1]);
  if (!set) hostFiles.set(m[1], (set = new Set()));
  set.add(p);
}

async function handleProtocol(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
  let rel, url;
  try { url = new URL(req.url); rel = decodeURIComponent(url.pathname); } catch { return new Response('bad url', { status: 400 }); }
  let abs = servePath(rel);
  if (!abs) return new Response('forbidden', { status: 403 });
  noteHostFile(url.host, rel);
  try {
    let st = await fsp.stat(abs);
    if (st.isDirectory()) { abs = path.join(abs, 'index.html'); st = await fsp.stat(abs); }
    const data = await fsp.readFile(abs);
    return new Response(data, {
      status: 200,
      headers: { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' },
    });
  } catch {
    return new Response(`not found: ${rel}`, { status: 404 });
  }
}

// ----------------------------------------------------------------- windows ---
let studioWin = null;
const games = new Map(); // projectId -> { win, console: [] }

function windowStateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }
function loadBounds() {
  try { return JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')); } catch { return null; }
}
function saveBounds() {
  if (!studioWin || studioWin.isDestroyed() || CAPTURE) return;
  const b = studioWin.getNormalBounds();
  try { fs.writeFileSync(windowStateFile(), JSON.stringify({ ...b, maximized: studioWin.isMaximized() })); } catch {}
}

function lockNavigation(win, allowedPrefix) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(allowedPrefix)) e.preventDefault(); });
}

function createStudioWindow() {
  const saved = CAPTURE ? null : loadBounds();
  studioWin = new BrowserWindow({
    width: saved?.width || 1520, height: saved?.height || 960, x: saved?.x, y: saved?.y,
    minWidth: 1100, minHeight: 680,
    title: 'Pixel Yak', icon: ICON, backgroundColor: '#0b0d1a', show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      offscreen: !!CAPTURE, backgroundThrottling: false,
    },
  });
  if (saved?.maximized) studioWin.maximize();
  lockNavigation(studioWin, 'studio://app/studio/ui/');
  studioWin.loadURL('studio://app/studio/ui/index.html');
  if (!CAPTURE) studioWin.once('ready-to-show', () => studioWin.show());
  studioWin.on('close', saveBounds);
  studioWin.on('closed', () => {
    studioWin = null;
    for (const g of games.values()) if (!g.win.isDestroyed()) g.win.close();
    games.clear();
  });
  studioWin.webContents.on('console-message', (e) => {
    if (CAPTURE && !/Electron Security Warning|willReadFrequently/.test(e.message)) captureLog.push(`[studio ${e.level}] ${e.message}`);
  });
  studioWin.webContents.on('render-process-gone', (e, d) => captureLog.push(`[studio crash] ${JSON.stringify(d)}`));
}

const toStudio = (channel, payload) => {
  if (studioWin && !studioWin.isDestroyed()) studioWin.webContents.send(channel, payload);
};

async function launchGame(projectId) {
  D.assertId('project', projectId);
  const open = games.get(projectId);
  if (open && !open.win.isDestroyed()) {
    if (open.win.isMinimized()) open.win.restore();
    open.win.show(); open.win.focus();
    return { running: true, alreadyOpen: true };
  }
  const p = await D.getProject(projectId);
  if (!p) throw new Error(`project ${projectId} not found`);
  if (!p.hasGame) throw new Error(`${p.gamePath} does not exist yet`);
  const { width, height, pixelScale } = p.resolution;
  const win = new BrowserWindow({
    width: width * pixelScale, height: height * pixelScale, useContentSize: true,
    title: `${p.name} — Pixel Yak (F8: tune · F9: tell the AI about this moment · F5: restart)`,
    icon: ICON, backgroundColor: '#05040a', autoHideMenuBar: true, show: !CAPTURE,
    webPreferences: {
      preload: path.join(HERE, 'game-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      offscreen: !!CAPTURE, backgroundThrottling: false,
    },
  });
  const origin = `studio://play-${projectId}/`;
  lockNavigation(win, origin);
  const entry = { win, console: [] };
  games.set(projectId, entry);
  win.webContents.on('console-message', (e) => {
    if (/Electron Security Warning|willReadFrequently/.test(e.message)) return;
    entry.console.push(`[${e.level}] ${e.message}`);
    if (entry.console.length > 300) entry.console.splice(0, entry.console.length - 300);
    if (e.level === 'error' || e.level === 'warning') toStudio('game:console', { projectId, level: e.level, message: e.message });
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F9') { e.preventDefault(); captureMoment(projectId).catch((err) => console.error(err)); }
    if (input.key === 'F5') { e.preventDefault(); win.webContents.reload(); }
    if (input.key === 'F12') { e.preventDefault(); win.webContents.toggleDevTools(); }
  });
  win.on('closed', () => { games.delete(projectId); toStudio('game:status', { projectId, running: false }); });
  await win.loadURL(origin + p.gamePath);
  toStudio('game:status', { projectId, running: true });
  return { running: true };
}

// Feature modules add to an F9 moment: onMoment(async (projectId, win, moment) => ({ …more }))
// (studio/main/ipc-link.mjs: the game's state, a save-state and the last ~5 seconds).
const momentParts = [];
async function captureMoment(projectId) {
  const g = games.get(projectId);
  if (!g || g.win.isDestroyed()) throw new Error('game is not running');
  const at = new Date().toISOString();
  const img = await g.win.webContents.capturePage();
  const moment = { projectId, at, dataUrl: img.toDataURL(), state: null, console: g.console.slice(-40) };
  for (const add of momentParts) {
    try { Object.assign(moment, await add(projectId, g.win, moment)); } catch (err) { console.error('[studio] moment:', err.message); }
  }
  toStudio('game:moment', moment);
  if (studioWin && !studioWin.isDestroyed() && !CAPTURE) { studioWin.show(); studioWin.focus(); }
}

// ---------------------------------------------------------------- watching ---
const projectEdits = new Map(); // projectId -> repo-relative editsDir (forward slashes)
async function refreshProjectCache() {
  projectEdits.clear();
  for (const p of await D.listProjects()) projectEdits.set(p.id, p.editsDir);
}

const pending = new Map();
let flushTimer = null;
function queueChange(change) {
  const key = `${change.kind}:${change.project || ''}:${change.style || ''}${change.external ? ':ext' : ''}`;
  const cur = pending.get(key) || { ...change, files: [] };
  if (change.file && !cur.files.includes(change.file)) {
    if (cur.files.length < 30) cur.files.push(change.file);
    else cur.more = true; // the list is cut short: listeners that filter by file must assume the worst
  }
  pending.set(key, cur);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushChanges, 280);
}

// Tell a running game which assets' edits changed (null = re-read them all); its registry
// re-fetches just those edit files (core/art/registry.js).
function sendGameEdits(pid, ids) {
  const g = games.get(pid);
  if (g && !g.win.isDestroyed()) g.win.webContents.send('art-edits', { assets: ids ? [...ids] : null });
}
const assetOfEditFile = (file) => { const id = path.basename(file, '.json'); return D.isId('asset', id) ? id : null; };

async function flushChanges() {
  const changes = [...pending.values()];
  pending.clear();
  if (changes.some((c) => c.kind === 'projects')) await refreshProjectCache().catch(() => {});
  // The studio's own saves already told the game (IPC edits:write). Here: edits written by
  // someone else — an AI by hand, or the CLI (which rebuilds the index itself).
  const indexBy = new Set(changes.filter((c) => c.kind === 'edits-index' && c.external).map((c) => c.project));
  const notify = new Map(); // pid -> Set(asset ids) | null (everything)
  for (const c of changes) {
    if (c.kind !== 'edits' || !c.external) continue;
    if (!indexBy.has(c.project)) await D.rebuildEditsIndex(c.project).catch((err) => console.error('[studio] edits index:', err.message));
    const ids = c.more ? null : c.files.map(assetOfEditFile).filter(Boolean);
    if (!ids || notify.get(c.project) === null) { notify.set(c.project, null); continue; }
    const set = notify.get(c.project) || new Set();
    for (const id of ids) set.add(id);
    notify.set(c.project, set);
  }
  for (const pid of indexBy) if (!notify.has(pid)) notify.set(pid, null); // index rebuilt with no file named: re-read all
  for (const [pid, ids] of notify) sendGameEdits(pid, ids);
  toStudio('fs:changed', changes.map(({ external, ...c }) => c));
}

// A change's `file` is its repo-relative path (forward slashes).
function classify(top, rel) {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return null;
  const file = [top, ...parts].join('/');
  if (/\.tmp$/.test(file) || parts.includes('node_modules')) return null;
  const ext = path.extname(file).toLowerCase();
  if (top === 'engine') return { kind: 'code', project: '*', file };
  if (top === 'designs') return { kind: 'designs', file };
  if (top === 'local') {
    if (parts[0] === 'ideas') return { kind: 'ideas', file };
    if (parts[0] === 'inbox') return { kind: 'requests', project: '_studio', file };
    if (parts[0] === 'designs') return { kind: 'designs', file };
    return null;
  }
  // games/<id>/…
  const project = parts[0];
  if (!D.isId('project', project)) return null;
  if (parts.length === 1 || (parts.length === 2 && parts[1] === 'game.json')) return { kind: 'projects', project, file };
  if (parts[1] === 'requests') return { kind: 'requests', project, file };
  if (parts[1] === 'tuning') return { kind: 'tuning', project, file }; // F8 choices kept (studio/main/ipc-link.mjs)
  if (parts[1] === 'dev' && parts[2] === 'out') return null;
  // the game's own look: design/*.md + lessons → the Lessons view; design/*.js is art code (the palette)
  if (parts[1] === 'design') return ['.js', '.mjs'].includes(ext) ? { kind: 'code', project, file } : { kind: 'styles', style: project, project, file };
  const editsRel = projectEdits.get(project);
  if (editsRel && file.startsWith(editsRel + '/')) {
    if (file === `${editsRel}/index.js`) return { kind: 'edits-index', project, file, external: !D.wasRecentlyWritten(path.join(ROOT, file)) };
    if (file.endsWith('.json')) return { kind: 'edits', project, file, external: !D.wasRecentlyWritten(path.join(ROOT, file)) };
    return null;
  }
  if (['.js', '.mjs', '.html', '.css', '.json'].includes(ext)) return { kind: 'code', project, file };
  if (ext === '.md') return { kind: 'docs', project, file };
  return null;
}

// OS watchers + async scoped rescans + a slow async full sweep (studio/main/watch.mjs).
const TOPS = ['games', 'designs', 'local', 'engine'];
const watcher = createWatcher({ root: ROOT, tops: TOPS, classify, onChange: queueChange });
function startWatchers() { for (const d of [D.DIRS.games, D.DIRS.ideas, D.DIRS.inbox, D.DIRS.localDesigns]) fs.mkdirSync(d, { recursive: true }); return watcher.start().catch((err) => console.error('[studio] watcher start:', err.message)); }

// --------------------------------------------------------------------- IPC ---
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!studioWin || e.sender !== studioWin.webContents) return { ok: false, error: 'not allowed' };
    try { return { ok: true, data: await fn(...args) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
}

function registerIpc() {
  handle('app:info', () => ({ root: ROOT, version: app.getVersion(), electron: process.versions.electron, capture: !!CAPTURE, stages: D.STAGES, sizes: D.SIZES, kinds: D.REQUEST_KINDS }));
  handle('projects:list', () => D.listProjects());
  handle('projects:update', (id, patch) => D.updateProject(id, patch));
  handle('projects:create', async (opts) => { const r = await D.createProject(opts); await refreshProjectCache(); return r; });
  handle('projects:check', (id) => D.checkProject(id));
  handle('art:files', (id) => [...(hostFiles.get(D.assertId('project', id)) || [])]);

  handle('edits:list', (pid) => D.listEdits(pid));
  handle('edits:read', (pid, aid) => D.readEdit(pid, aid));
  // a save goes straight to the running game: just this asset re-renders
  handle('edits:write', async (pid, aid, edit) => { const r = await D.writeEdit(pid, aid, edit); sendGameEdits(pid, [aid]); return r; });
  handle('edits:delete', async (pid, aid) => { await D.deleteEdit(pid, aid); sendGameEdits(pid, [aid]); });

  // opts.archived: also return requests moved to requests/archive/ (the Inbox's Done / All filters)
  handle('requests:list', async (scope, opts) => {
    const o = { archived: !!(opts && opts.archived) };
    if (scope === 'all') {
      const ps = await D.listProjects();
      const lists = await Promise.all([...ps.map((p) => D.listRequests(p.id, o)), D.listRequests('_studio', o)]);
      return lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return D.listRequests(scope === '_studio' ? scope : D.assertId('project', scope), o);
  });
  handle('requests:create', (scope, req, attachments) => D.createRequest(scope === '_studio' ? scope : D.assertId('project', scope), req, attachments, 'user'));
  handle('requests:update', (scope, id, patch) => D.updateRequest(scope === '_studio' ? scope : D.assertId('project', scope), id, patch, 'user'));
  handle('requests:delete', (scope, id) => D.deleteRequest(scope === '_studio' ? scope : D.assertId('project', scope), id));

  handle('ideas:list', () => D.listIdeas());
  handle('ideas:save', (idea) => D.saveIdea(idea));
  handle('ideas:delete', (id) => D.deleteIdea(id));

  handle('styles:list', () => D.listStyles());
  handle('styles:read', (id) => D.readStyle(id));
  handle('lessons:append', (styleId, lesson, card) => { if (!styleId) throw new Error('this game has no design/ folder yet, so there is nowhere to keep the lesson'); return D.appendLesson(styleId, lesson, card); });
  handle('lessons:read', (styleId, opts) => D.readLessons(styleId, opts || {}));

  handle('designs:list', (opts) => D.listDesigns(opts || {}));
  handle('designs:read', (shelf, id) => D.readDesign(shelf, id));

  handle('game:launch', (pid) => launchGame(pid));
  handle('game:close', (pid) => { const g = games.get(D.assertId('project', pid)); if (g && !g.win.isDestroyed()) g.win.close(); return true; });
  handle('game:reload', (pid) => { const g = games.get(D.assertId('project', pid)); if (g && !g.win.isDestroyed()) g.win.webContents.reload(); return !!g; });
  handle('game:running', () => [...games.keys()]);
  handle('game:console', (pid) => (games.get(D.assertId('project', pid))?.console || []).slice(-80));

  // Open a repo folder/file in Explorer or the default app. Only paths inside the repo.
  handle('shell:open', async (rel, reveal) => {
    const abs = servePath(String(rel || '').replace(/\\/g, '/'));
    if (!abs || !fs.existsSync(abs)) throw new Error('not found');
    if (reveal) { shell.showItemInFolder(abs); return true; }
    const err = await shell.openPath(abs);
    if (err) throw new Error(err);
    return true;
  });
}

// Feature modules add their own IPC without touching this file: studio/main/ipc-<feature>.mjs
// exports register(ctx), called once at startup with the helpers below.
async function registerFeatureIpc() {
  const ctx = { handle, D, ROOT, games, toStudio, launchGame, CAPTURE, app, studioWindow: () => studioWin, onMoment: (fn) => momentParts.push(fn) };
  for (const f of fs.readdirSync(HERE).filter((n) => /^ipc-[a-z0-9-]+\.mjs$/.test(n)).sort()) {
    const m = await import(pathToFileURL(path.join(HERE, f)).href);
    await m.register(ctx);
  }
}

// ----------------------------------------------------------------- capture ---
const captureLog = [];
async function runCapture() {
  const job = JSON.parse(await fsp.readFile(CAPTURE.steps, 'utf8'));
  await fsp.mkdir(CAPTURE.out, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = studioWin.webContents;
  if (job.w && job.h) studioWin.setContentSize(job.w, job.h);
  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  const js = (code) => wc.executeJavaScript(code, true).catch((err) => { captureLog.push(`[js-error] ${err.message}`); });
  for (const s of job.steps || []) {
    if (s.wait) await wait(s.wait);
    if (s.until) {
      const t0 = Date.now();
      while (Date.now() - t0 < (s.timeout || 8000) && !(await js(s.until))) await wait(100);
    }
    if (s.js) { const r = await js(s.js); if (r !== undefined) captureLog.push(`[js] ${JSON.stringify(r)}`.slice(0, 4000)); }
    if (s.key) {
      for (const type of ['keyDown', 'char', 'keyUp']) {
        if (type === 'char' && (s.key.length !== 1 || (s.modifiers || []).length)) continue;
        wc.sendInputEvent({ type, keyCode: s.key, modifiers: s.modifiers || [] });
      }
      await wait(60);
    }
    if (s.click) {
      const [x, y] = s.click;
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await wait(60);
    }
    if (s.shot) {
      const img = await wc.capturePage();
      await fsp.writeFile(path.join(CAPTURE.out, s.shot), img.toPNG());
    }
    if (s.gameShot) {
      const g = games.get(s.gameShot.project);
      if (g) { const img = await g.win.webContents.capturePage(); await fsp.writeFile(path.join(CAPTURE.out, s.gameShot.file), img.toPNG()); }
      else captureLog.push(`[gameShot] ${s.gameShot.project} not running`);
    }
    if (s.gameKey) {
      const g = games.get(s.gameKey.project);
      if (g) { for (const type of ['keyDown', 'keyUp']) g.win.webContents.sendInputEvent({ type, keyCode: s.gameKey.key }); await wait(80); }
      else captureLog.push(`[gameKey] ${s.gameKey.project} not running`);
    }
    if (s.gameJs) {
      const g = games.get(s.gameJs.project);
      if (g) { const r = await g.win.webContents.executeJavaScript(s.gameJs.js, true).catch((err) => `[error] ${err.message}`); captureLog.push(`[gameJs] ${JSON.stringify(r)}`.slice(0, 4000)); }
    }
  }
  for (const [pid, g] of games) captureLog.push(...g.console.map((l) => `[game ${pid}] ${l}`));
  await fsp.writeFile(path.join(CAPTURE.out, 'console.txt'), captureLog.join('\n') || '(no console output)');
  app.exit(0);
}

// --------------------------------------------------------------------- app ---
if (!CAPTURE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (studioWin) { if (studioWin.isMinimized()) studioWin.restore(); studioWin.show(); studioWin.focus(); }
  });
  app.whenReady().then(async () => {
    protocol.handle('studio', handleProtocol);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Studio', submenu: [{ role: 'reload', label: 'Reload studio UI' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    ]));
    await refreshProjectCache();
    registerIpc();
    await registerFeatureIpc();
    startWatchers();
    createStudioWindow();
    if (CAPTURE) runCapture().catch((err) => { console.error(err); app.exit(1); });
  });
  app.on('window-all-closed', () => app.quit());
}
