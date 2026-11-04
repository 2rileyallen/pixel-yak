// tests/electron/save-roundtrip.cjs — run by tests/save-backup.test.mjs (or: electron tests/electron/save-roundtrip.cjs).
// Saves made by the engine's own openSlots/slotStore (plus odd IndexedDB values) survive the studio's
// backup: copy → wipe the profile → restore → load, every value as it was. Exits 0 when all pass.
const { app, BrowserWindow, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'yak-save-test-')); // a throwaway profile, never yours
app.setPath('userData', PROFILE);
app.on('quit', () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* locked: the OS temp cleaner gets it */ } });
protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const PAGE = `<!doctype html><script type="module">
import { openSlots, slotStore } from '/engine/shell/saves.js';
window.make = async () => {
  const s = await openSlots('t-game', { version: 2, summary: (d) => ({ gold: d.gold }) });
  await s.write(1, { gold: 7, map: [1, 2, 3] });
  await s.write(1, { gold: 9, map: [1, 2, 3, 4] });
  slotStore('t-old').write(2, { level: 3 });
  localStorage.setItem('t-settings', JSON.stringify({ light: 'smooth' }));
  const db = await new Promise((res) => { const r = indexedDB.open('odd', 3); r.onupgradeneeded = () => {
    const a = r.result.createObjectStore('inline', { keyPath: 'id', autoIncrement: true }); a.createIndex('by-name', 'name', { unique: false });
    r.result.createObjectStore('out'); }; r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const tx = db.transaction(['inline', 'out'], 'readwrite');
    tx.objectStore('inline').put({ name: 'a', when: new Date(5), bytes: new Uint8Array([1, 2, 255]), f: new Float64Array([1.5, NaN]), m: new Map([['k', new Set([1])]]), weird: { $y: 'not a tag' }, u: undefined });
    tx.objectStore('out').put(new Blob(['hello'], { type: 'text/plain' }), [1, 'two']);
    tx.objectStore('out').put(new ArrayBuffer(4), 'ab');
    tx.oncomplete = res; });
  db.close();
  return true;
};
window.check = async () => {
  const s = await openSlots('t-game', { version: 2, summary: (d) => ({ gold: d.gold }) });
  const r = await s.load(1); const backup = s.info(1);
  const old = slotStore('t-old').read(2);
  const db = await new Promise((res) => { const q = indexedDB.open('odd'); q.onsuccess = () => res(q.result); });
  const get = (st, k) => new Promise((res) => { const q = db.transaction(st).objectStore(st).get(k); q.onsuccess = () => res(q.result); });
  const row = await get('inline', 1), blob = await get('out', [1, 'two']), ab = await get('out', 'ab');
  const idx = await new Promise((res) => { const q = db.transaction('inline').objectStore('inline').index('by-name').get('a'); q.onsuccess = () => res(q.result); });
  return JSON.stringify({ gold: r && r.data.gold, sum: backup && backup.sum, slots: s.SLOTS.length, old: old && old.level, settings: localStorage.getItem('t-settings'), dbVersion: db.version,
    date: row.when instanceof Date && row.when.getTime(), bytes: [...row.bytes], f: [row.f[0], String(row.f[1])], map: row.m instanceof Map && row.m.get('k') instanceof Set && row.m.get('k').has(1),
    weird: row.weird, hasU: 'u' in row, blob: blob instanceof Blob ? await blob.text() : null, ab: ab instanceof ArrayBuffer && ab.byteLength, idx: idx && idx.name });
};
</script>`;

app.whenReady().then(run).catch((err) => { console.log('FAIL', err.stack || err); app.exit(1); });
async function run() {
  const B = await import(pathToFileURL(path.join(ROOT, 'studio', 'main', 'save-backup.mjs')).href);
  protocol.handle('studio', (req) => {
    const u = new URL(req.url);
    if (u.pathname === '/page.html') return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (u.pathname === '/studio/ui/storage.html' || u.pathname.startsWith('/engine/')) return new Response(fs.readFileSync(f), { headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' } });
    return new Response('no', { status: 404 });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const origin = 'studio://play-t-game/';
  const js = (s) => win.webContents.executeJavaScript(s, true);
  let ok = true;
  const expect = (what, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'} ${what}${pass ? '' : `: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
  try {
    await win.loadURL(origin + 'page.html');
    await js('window.make()');
    const before = await js('window.check()');
    const dump = await js(B.DUMP_JS);
    const d = JSON.parse(dump);
    expect('dump has both databases + localStorage', [d.indexedDB.map((x) => x.name).sort(), Object.keys(d.localStorage).length > 0], [['odd', 't-game.saves'], true]);
    await session.defaultSession.clearStorageData({ origin: 'studio://play-t-game' });
    await win.loadURL(origin + 'studio/ui/storage.html');
    expect('wiped origin reads as empty', await js(B.EMPTY_JS), true);
    await js(B.restoreJs(dump));
    await win.loadURL(origin + 'page.html');
    expect('every value comes back as it was', JSON.parse(await js('window.check()')), JSON.parse(before));
    console.log('  values:', before);
    await win.loadURL(origin + 'studio/ui/storage.html');
    expect('a restored origin is not empty (no second offer)', await js(B.EMPTY_JS), false);
    const redump = JSON.parse(await js(B.DUMP_JS));
    expect('a second dump equals the first', [redump.localStorage, redump.indexedDB], [d.localStorage, d.indexedDB]);
  } catch (err) { ok = false; console.log('FAIL', err.stack || err); }
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
}
