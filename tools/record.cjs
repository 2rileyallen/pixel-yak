// record.cjs — film a game in this repo to an MP4 (skill game-promo-clip). The game runs in an
// offscreen Electron window; every painted frame goes to ffmpeg as raw BGRA (x264, scaled up with
// nearest-neighbour so pixels stay crisp). It never touches the repo: `root` is a clean copy of the
// game (git archive, see SKILL.md), and the browser profile is a throwaway.
//
//   "<repo>/node_modules/.bin/electron" record.cjs <config.json> [probe|record]
//
// probe  — runs setup + shot and saves stills at `probeAt` seconds (look at them before recording)
// record — runs setup + shot and writes `out` (the MP4)
//
// config.json (relative paths are relative to the config file):
//   root      absolute path of the clean copy (the folder holding projects/, core/, styles/)
//   page      the game page under root, with its query: "projects/<id>/game/index.html?fixture=XL10"
//   ready     JS that is truthy once the game can be driven (polled every 100 ms, up to 60 s)
//   setup     JS file run once in the page before the shot (may return a Promise; awaited)
//   shot      JS file run in the page when filming starts: it drives the camera by its own clock
//             (requestAnimationFrame + performance.now()) and returns a small JSON-able summary
//   w, h      the window in CSS px (540×960 → the game picks its scale; the MP4 is outW×outH)
//   outW, outH, fps, seconds, crf   defaults 1080, 1920, 30, 15, 16
//   out       the MP4 path · probeAt  seconds for the probe's stills (default [0.5, 5, 10, 14.5])
//   Stills and the page's console log go to %TEMP%/promo-clip/probe/<mp4 name>/.
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('record.cjs')) + 1).filter((a) => !a.startsWith('--'));
const cfgPath = path.resolve(args[0] || '');
const MODE = args[1] || 'probe';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const rel = (p) => path.resolve(path.dirname(cfgPath), p);
const W = cfg.w || 540, H = cfg.h || 960, FPS = cfg.fps || 30, SECONDS = cfg.seconds || 15;
const OUTW = cfg.outW || 1080, OUTH = cfg.outH || 1920, CRF = String(cfg.crf ?? 16);
const OUT = rel(cfg.out);
const PROBE = path.join(os.tmpdir(), 'promo-clip', 'probe', path.basename(OUT, '.mp4')); // stills + console log: never next to the MP4
const SETUP = cfg.setup ? fs.readFileSync(rel(cfg.setup), 'utf8') : null;
const SHOT = fs.readFileSync(rel(cfg.shot), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'promo-clip-profile-')));

app.whenReady().then(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const logs = [];
  fs.mkdirSync(PROBE, { recursive: true });
  const saveLogs = () => fs.writeFileSync(path.join(PROBE, 'console.txt'), logs.join(String.fromCharCode(10)));
  const fail = (msg) => { logs.push(`[promo] ${msg}`); saveLogs(); console.error(msg); app.exit(1); };

  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(FPS);
  win.webContents.on('console-message', (e) => logs.push(`[${e.level}] ${e.message}`));
  const [file, query] = cfg.page.split('?');
  await win.loadFile(path.join(cfg.root, file), query ? { search: query } : undefined);
  const js = (s) => win.webContents.executeJavaScript(s);
  // a thrown error comes back as { err } instead of a vague "Script failed to execute"
  const run = (code) => js(`(async () => { try { return await (0, eval)(${JSON.stringify(code)}); } catch (e) { return { err: String(e && e.stack || e) }; } })()`);

  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) { ready = await js(`!!(${cfg.ready || 'document.readyState === "complete"'})`).catch(() => false); if (!ready) await wait(100); }
  if (!ready) return fail('the game never became ready');
  if (SETUP) { const r = await run(SETUP); if (r && r.err) return fail(`setup: ${r.err}`); console.log('setup', JSON.stringify(r)); }

  if (MODE === 'probe') {
    const r = await run(SHOT);
    if (r && r.err) return fail(`shot: ${r.err}`);
    console.log('shot', JSON.stringify(r));
    let t = 0;
    for (const at of cfg.probeAt || [0.5, 5, 10, 14.5]) {
      await wait(Math.max(0, at - t) * 1000); t = at;
      fs.writeFileSync(path.join(PROBE, `still-${String(at).replace('.', '_')}s.png`), (await win.webContents.capturePage()).toPNG());
    }
    saveLogs();
    console.log(JSON.stringify({ probe: PROBE }));
    app.exit(0);
    return;
  }

  // Frames are repeated or dropped against the wall clock so the clip plays at the game's own speed.
  let ff = null, written = 0, t0 = 0, done = false, size = null;
  win.webContents.on('paint', (e, dirty, image) => {
    if (done || !t0) return;
    if (!ff) {
      size = image.getSize();
      ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${size.width}x${size.height}`, '-r', String(FPS), '-i', '-',
        '-vf', `scale=${OUTW}:${OUTH}:flags=neighbor`, '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT],
        { stdio: ['pipe', 'inherit', 'inherit'] });
    }
    const due = Math.min(SECONDS * FPS, Math.floor(((Date.now() - t0) / 1000) * FPS) + 1);
    if (written >= due) return;
    const buf = image.toBitmap();
    while (written < due) { ff.stdin.write(buf); written++; }
    if (written >= SECONDS * FPS) done = true;
  });
  const r = await run(SHOT);
  if (r && r.err) return fail(`shot: ${r.err}`);
  console.log('shot', JSON.stringify(r));
  t0 = Date.now();
  win.webContents.invalidate();
  while (!done) await wait(100);
  await new Promise((res) => { ff.on('close', res); ff.stdin.end(); });
  saveLogs();
  console.log(JSON.stringify({ out: OUT, frames: written, window: size }));
  app.exit(0);
});
