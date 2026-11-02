// tools/game-capture.cjs — play any game in this repo headless from a steps file and save
// screenshots + the console (the look-at-your-work loop for games). Pages are relative to the
// repo root, so every game can use it — or an http(s)
// address (a game's built site on a local server: skill publish).
//   electron tools/game-capture.cjs <steps.json> <outDir>
// steps.json: { "page": "games/<id>/game/index.html?slot=3&fresh=1", "w": 960, "h": 540,
//   "steps": [ {"wait": 500}, {"key": "Tab"}, {"hold": "ArrowRight", "ms": 400},
//              {"down": "ShiftLeft"}, {"up": "ShiftLeft"}, {"js": "1+1"}, {"shot": "a.png"},
//              {"waitFor": "window.game && game.ready", "ms": 5000},
//              {"expect": "game.sim.buildings.length", "equals": 12},
//              {"expect": "document.title.includes('Yak')", "label": "title set"} ] }
// Keys are KeyboardEvent.code values. {"js"} results are logged to console.txt as [js] lines.
// Checks: {"expect": js} passes when the value is truthy; with "equals" it must deep-equal that
// JSON value. {"waitFor": js, "ms": max} polls until truthy and fails on timeout. Any failed
// check is marked [FAIL] in console.txt, listed on stderr, written to result.json, and the run
// exits 1 (steps keep running so the screenshots still show what happened — unless the test has
// "failFast": true or the run gets --fail-fast: then it stops at the first failed check and saves
// fail-step-<n>.png of that moment). Format: docs/contracts/CHECKS.md.
// Run every test of a game: node tools/run-captures.mjs <gameId> [names…]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Each run gets its own throwaway browser profile (localStorage starts empty): parallel runs can't
// lock each other's storage, and no run ever touches a save made in the studio.
const PROFILE = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ppa-capture-'));
app.setPath('userData', PROFILE);
app.on('quit', () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* still locked: the OS temp cleaner gets it */ } });

// Order-insensitive for object keys, strict for arrays and primitives.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
const show = (v) => { const s = v === undefined ? 'undefined' : JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };

app.whenReady().then(async () => {
  const self = process.argv.findIndex((a) => a.endsWith('game-capture.cjs'));
  const argv = process.argv.slice(self + 1).filter((a) => !a.startsWith('--inspect'));
  const [stepsFile, outArg] = argv.filter((a) => !a.startsWith('--'));
  if (!stepsFile || !outArg) { console.error('usage: electron tools/game-capture.cjs <steps.json> <outDir> [--fail-fast]'); app.exit(2); return; }
  const t0 = Date.now();
  const job = JSON.parse(fs.readFileSync(path.resolve(stepsFile), 'utf8'));
  const failFast = argv.includes('--fail-fast') || job.failFast === true;
  const outDir = path.resolve(outArg);
  fs.mkdirSync(outDir, { recursive: true });
  const logs = [];
  const failures = [];
  let checks = 0, shots = 0, errors = 0;
  const finish = (code) => {
    fs.writeFileSync(path.join(outDir, 'console.txt'), logs.join('\n') || '(no console output)');
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ pass: !failures.length && code === 0, checks, failures, shots, consoleErrors: errors, ms: Date.now() - t0 }, null, 2));
    if (failures.length) console.error(`${failures.length} of ${checks} check(s) failed:\n${failures.map((f) => '  - ' + f).join('\n')}`);
    app.exit(code || (failures.length ? 1 : 0));
  };
  const win = new BrowserWindow({
    width: job.w || 960, height: job.h || 540, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (e) => {
    const m = e.message || '';
    if (/Security Warning|unsafe-eval|electronjs\.org|warning will not|once the app|willReadFrequently/.test(m)) return;
    if (e.level === 'error') errors++;
    logs.push(`[${e.level ?? ''}] ${m}`);
  });
  win.webContents.on('render-process-gone', (e, d) => { logs.push(`[crash] ${JSON.stringify(d)}`); failures.push(`page crashed: ${JSON.stringify(d)}`); });
  const [file, query] = job.page.split('?');
  try {
    if (/^https?:/.test(job.page)) await win.loadURL(job.page);
    else await win.loadFile(path.join(ROOT, file), query ? { search: query } : undefined);
  } catch (err) {
    logs.push(`[load-error] ${err.message}`);
    failures.push(`page did not load: ${err.message}`);
    finish(1);
    return;
  }
  const js = (s) => win.webContents.executeJavaScript(s).catch((err) => { logs.push(`[js-error] ${err.message}`); });
  // Like js() (statements allowed, the last value counts) but a thrown error comes back as a value
  // so the check can fail on it; the value is made JSON-safe in the page (DOM nodes, functions).
  const evalCheck = (s) => win.webContents.executeJavaScript(`(async () => { try {
      const v = await (0, eval)(${JSON.stringify(s)});
      let j; try { j = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch { j = String(v); }
      return { v: j, ok: !!v };
    } catch (e) { return { err: String(e && e.message || e) }; } })()`)
    .catch((err) => ({ err: err.message }));
  const fail = (i, what) => { failures.push(`step ${i + 1}: ${what}`); logs.push(`[FAIL] step ${i + 1}: ${what}`); };
  const key = (code, down) => js(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: ${JSON.stringify(code)}, bubbles: true }))`);
  // capturePage can hang forever when asked within ~100 ms of a page load: time it out (retried once below)
  const grab = () => Promise.race([win.webContents.capturePage(), wait(10000).then(() => null)]);
  for (const [i, s] of job.steps.entries()) {
    if (failFast && failures.length) { // stop here, with a picture of the moment it failed
      const img = await grab();
      if (img) { fs.writeFileSync(path.join(outDir, `fail-step-${i}.png`), img.toPNG()); shots++; }
      logs.push(`[fail-fast] stopped before step ${i + 1} of ${job.steps.length}`);
      break;
    }
    if (s.wait) await wait(s.wait);
    if (s.key) { await key(s.key, true); await wait(s.ms || 50); await key(s.key, false); await wait(40); }
    if (s.hold) { await key(s.hold, true); await wait(s.ms || 300); await key(s.hold, false); await wait(20); }
    if (s.down) await key(s.down, true);
    if (s.up) await key(s.up, false);
    if (s.js) { const r = await js(s.js); if (r !== undefined) logs.push(`[js] ${JSON.stringify(r)}`); }
    if (s.waitFor) {
      checks++;
      const max = s.ms || 5000, w0 = Date.now();
      let r = await evalCheck(s.waitFor);
      while (!r.ok && Date.now() - w0 < max) { await wait(50); r = await evalCheck(s.waitFor); }
      if (r.ok) logs.push(`[wait] ${s.label || s.waitFor} — ${Date.now() - w0} ms`);
      else fail(i, `waitFor ${s.label ? `"${s.label}" ` : ''}${show(s.waitFor)} timed out after ${max} ms${r.err ? ` (error: ${r.err})` : ` (last value ${show(r.v)})`}`);
    }
    if (s.expect) {
      checks++;
      const r = await evalCheck(s.expect);
      const name = s.label ? `"${s.label}" ` : '';
      if (r.err) fail(i, `expect ${name}${show(s.expect)} threw: ${r.err}`);
      else if ('equals' in s ? !deepEqual(r.v, s.equals) : !r.ok) fail(i, `expect ${name}${show(s.expect)} → got ${show(r.v)}, wanted ${'equals' in s ? show(s.equals) : 'a truthy value'}`);
      else logs.push(`[pass] ${s.label || s.expect}`);
    }
    if (s.shot) {
      await wait(34);
      let img = await grab();
      if (!img) { await wait(500); img = await grab(); }
      if (img) { fs.writeFileSync(path.join(outDir, s.shot), img.toPNG()); shots++; }
      else fail(i, `screenshot ${s.shot} timed out twice`);
    }
  }
  finish(0);
});
