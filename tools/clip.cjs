// tools/clip.cjs — the clip recorder (docs/contracts/CLIPS.md, skill promo): films a promo clip of a
// game from its recipe, games/<id>/clips/<name>.clip.json, into an MP4.
//
//   <electron> tools/clip.cjs <game> <clip> [--probe] [--ref <rev>] [--music-file <wav>] [--cancel-file <path>] [--keep]
//   (usually through `node cli/yak.mjs clip <game> <clip> [--probe]` or the studio's Clips view)
//
// 1. A clean copy of a COMMITTED version, never the working tree (another agent may be mid-edit):
//    `git archive` of the game at <rev> (default HEAD; the game's own repo, or the harness when the game
//    is committed there) + the harness's engine/, cli/ and studio/data/ into a temp folder. The recipe
//    and its setup/shot scripts are read from the clips folder as they are now: they direct the film,
//    they are not the game.
// 2. Music: `node cli/yak.mjs render-song <game> <song> --out <wav> --seconds <length>` run in the copy
//    (skipped with a note when that command doesn't exist yet). --music-file uses a WAV you made instead.
// 3. The game boots in an offscreen window with a throwaway browser profile (the user's saves are never
//    touched), `ready` is awaited, the words overlay (tools/clip-overlay.js) is laid over the page, the
//    setup script runs, then the film clock starts and the shot script runs.
// 4. Record: every painted frame goes to ffmpeg as raw BGRA, paced by the wall clock (a frame is
//    repeated or dropped so the clip plays at the game's own speed), scaled up with nearest-neighbour to
//    the aspect's frame (1080x1920 · 1920x1080 · 1080x1080), x264, the music as AAC with a fade-out.
//    --probe: stills at a few times into clips/out/<name>-probe/ instead, nothing encoded.
// Output: games/<id>/clips/out/<out>.mp4 + <name>.json (what was filmed), also copied into the
// folder named by local/clips.json { "copyTo": … } when set. Progress: one `CLIP {json}` line per step
// on stdout. ffmpeg: the FFMPEG environment variable (the program or its folder), else `ffmpeg` on the
// PATH. --cancel-file: when that file appears the run stops and removes what it made (the studio's
// Cancel; stdin doesn't reach an Electron main process on Windows).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const relRoot = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ------------------------------------------------------------------ args ---
const argv = process.argv.slice(process.argv.findIndex((a) => a.endsWith('clip.cjs')) + 1);
const pos = [], opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--inspect')) continue;
  if (a.startsWith('--')) { const next = argv[i + 1]; if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true; else { opt[a.slice(2)] = next; i++; } }
  else pos.push(a);
}
const [GAME, NAME] = pos;
const PROBE = !!opt.probe;
const REF = typeof opt.ref === 'string' ? opt.ref : 'HEAD';

// Everything this run makes outside the game's clips/out/ lives in one temp folder, removed at the end
// (the browser profile stays locked until the process is gone: earlier runs' leftovers are swept here).
for (const n of fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('pixel-yak-clip-'))) {
  const p = path.join(os.tmpdir(), n);
  try { if (Date.now() - fs.statSync(p).mtimeMs > 3 * 3600 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch {}
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-yak-clip-'));
const SRC = path.join(TMP, 'src'), WORK = path.join(TMP, 'work');
fs.mkdirSync(WORK, { recursive: true });
app.setPath('userData', path.join(TMP, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1'); // one window pixel = one frame pixel
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const emit = (o) => process.stdout.write(`CLIP ${JSON.stringify(o)}\n`);
const notes = [];
const note = (text) => { notes.push(text); emit({ note: text }); };
const logs = [];
let ff = null, cancelled = false;

function cleanup() {
  if (ff) { try { ff.kill(); } catch {} }
  if (!opt.keep) for (const d of [SRC, WORK]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}
app.on('quit', () => { if (!opt.keep) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the profile is still locked: the OS temp cleaner gets it */ } });
function fail(msg) {
  const tail = logs.filter((l) => /^\[(error|warning)/.test(l)).slice(-12);
  emit({ error: msg, console: tail });
  process.stderr.write(`clip: ${msg}\n${tail.length ? `page console:\n  ${tail.join('\n  ')}\n` : ''}`);
  cleanup();
  app.exit(1);
}

// The studio's Cancel button: it creates the --cancel-file, the run stops and cleans up.
if (typeof opt['cancel-file'] === 'string') {
  const flag = path.resolve(opt['cancel-file']);
  setInterval(() => {
    if (cancelled || !fs.existsSync(flag)) return;
    cancelled = true;
    emit({ cancelled: true });
    cleanup();
    app.exit(2);
  }, 200);
}

// ------------------------------------------------------------------- git ---
function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// git archive <ref> [paths] → dest (tar unpacks with a relative file name: no drive-letter trouble)
function archive(repo, ref, paths, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tar = path.join(dest, '__copy.tar');
  const a = spawnSync('git', ['-C', repo, 'archive', '--format=tar', '-o', tar, ref, '--', ...paths], { encoding: 'utf8' });
  if (a.error || a.status !== 0) throw new Error(`git archive ${ref} failed in ${relRoot(repo) || '.'}: ${(a.stderr || String(a.error)).trim()}`);
  const x = spawnSync('tar', ['-xf', '__copy.tar'], { cwd: dest, encoding: 'utf8' });
  if (x.error || x.status !== 0) throw new Error(`could not unpack the copy (tar): ${(x.stderr || String(x.error)).trim()}`);
  fs.rmSync(tar, { force: true });
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (p) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(p) });
}

// The clean copy: the harness parts a game and the CLI need, then the game itself at REF.
function makeCopy() {
  const harness = ['engine', 'cli', 'studio/data', 'tools/checks.mjs', 'package.json']; // tools/checks.mjs: the CLI's checks command imports it
  const harnessCommit = git(ROOT, ['rev-parse', '--short', 'HEAD']);
  if (harnessCommit) archive(ROOT, 'HEAD', harness, SRC);
  else {
    for (const p of harness) { const from = path.join(ROOT, p); if (fs.existsSync(from)) fs.cpSync(from, path.join(SRC, p), { recursive: true }); }
    note('Pixel Yak itself is not a git checkout, so the engine was copied as it is on disk');
  }
  const gameDir = path.join(ROOT, 'games', GAME);
  const dest = path.join(SRC, 'games', GAME);
  let repo, paths, base, status;
  if (fs.existsSync(path.join(gameDir, '.git'))) { repo = gameDir; paths = []; base = dest; status = git(gameDir, ['status', '--porcelain', '--', '.', ':(exclude)clips', ':(exclude)requests']); }
  else if (harnessCommit && git(ROOT, ['ls-files', '--', `games/${GAME}/game.json`])) {
    repo = ROOT; paths = [`games/${GAME}`]; base = SRC; status = git(ROOT, ['status', '--porcelain', '--', `games/${GAME}`, `:(exclude)games/${GAME}/clips`, `:(exclude)games/${GAME}/requests`]);
  } else {
    throw new Error(`games/${GAME} has no commit to film. The recorder films a committed version, never the files as they are mid-edit. ` +
      `Make the game its own git repo and commit it: git -C games/${GAME} init && git -C games/${GAME} add -A && git -C games/${GAME} commit -m "First version"`);
  }
  const commit = git(repo, ['rev-parse', '--short', `${REF}^{commit}`]);
  if (!commit) throw new Error(`games/${GAME}: no commit "${REF}" to film${REF === 'HEAD' ? ' (nothing committed yet?)' : ''}`);
  const subject = git(repo, ['log', '-1', '--format=%s', commit]) || '';
  archive(repo, commit, paths, base);
  if (!fs.existsSync(path.join(dest, 'game.json'))) throw new Error(`the commit ${commit} has no games/${GAME}/game.json`);
  // (clips/ and requests/ don't count: recipes and shot scripts are read as they are now, tickets aren't the game)
  if (status) note(`games/${GAME} has uncommitted changes: they are not in this clip (it films commit ${commit} "${subject.slice(0, 60)}")`);
  // the recorder's own overlay, next to the engine it imports
  fs.mkdirSync(path.join(SRC, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'clip-overlay.js'), path.join(SRC, 'tools', 'clip-overlay.js'));
  return { game: { commit, subject, dirty: !!status }, harness: harnessCommit };
}

// ---------------------------------------------------------------- ffmpeg ---
function tool(name) {
  const env = process.env.FFMPEG;
  if (!env) return name;
  const isDir = (() => { try { return fs.statSync(env).isDirectory(); } catch { return false; } })();
  if (isDir) return path.join(env, name + (process.platform === 'win32' ? '.exe' : ''));
  return name === 'ffmpeg' ? env : path.join(path.dirname(env), name + path.extname(env));
}
const works = (cmd) => { const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' }); return !r.error && r.status === 0; };

function probeFile(file) {
  const fp = tool('ffprobe');
  const r = spawnSync(fp, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
    const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
    return { duration: Math.round(Number(j.format && j.format.duration) * 100) / 100, width: v.width, height: v.height, fps: d ? Math.round((n / d) * 100) / 100 : null, audio: (j.streams || []).some((s) => s.codec_type === 'audio') };
  } catch { return null; }
}

// ----------------------------------------------------------------- music ---
function renderMusic(clip) {
  if (opt['music-file']) {
    const f = path.resolve(String(opt['music-file']));
    if (!fs.existsSync(f)) throw new Error(`--music-file ${f} does not exist`);
    return { file: f, song: path.basename(f), from: 'file' };
  }
  if (!clip.music) return null;
  const wav = path.join(WORK, 'music.wav');
  const cli = path.join(SRC, 'cli', 'yak.mjs');
  const r = spawnSync(process.execPath, [cli, 'render-song', GAME, clip.music.song, '--out', wav, '--seconds', String(clip.length)],
    { cwd: SRC, encoding: 'utf8', timeout: 180000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  const err = `${r.stderr || ''}${r.error ? String(r.error) : ''}`.trim();
  if (/unknown command/i.test(err)) { note(`no music: this version of Pixel Yak has no render-song command yet (song "${clip.music.song}")`); return null; }
  if (r.status !== 0 || !fs.existsSync(wav) || fs.statSync(wav).size < 100) { note(`no music: render-song ${clip.music.song} failed — ${err.split('\n')[0] || `exit ${r.status}`}`); return null; }
  return { file: wav, song: clip.music.song, from: 'song' };
}

// ------------------------------------------------------------------ main ---
app.whenReady().then(async () => {
  let D;
  try {
    D = await import(pathToFileURL(path.join(ROOT, 'studio', 'data', 'index.mjs')).href);
    D.assertId('project', GAME || '');
    D.assertClipName(NAME || '');
  } catch (err) { return fail(GAME && NAME ? err.message : 'usage: electron tools/clip.cjs <game> <clip> [--probe] [--ref <rev>] [--music-file <wav>]'); }

  let clip, copy, music = null;
  const FF = tool('ffmpeg');
  try {
    clip = await D.readClip(GAME, NAME);
    if (!PROBE && !works(FF)) {
      throw new Error('ffmpeg was not found. Pixel Yak needs it to make videos (it is free: https://ffmpeg.org/download.html). ' +
        'Install it and put it on the PATH, or set the FFMPEG environment variable to the ffmpeg program (or its folder).');
    }
    emit({ stage: 'copy', text: 'Making a clean copy of the last commit' });
    copy = makeCopy();
    if (!PROBE && (clip.music || opt['music-file'])) { emit({ stage: 'music', text: 'Rendering the music' }); music = renderMusic(clip); }
  } catch (err) { return fail(err.message); }

  const gameJson = JSON.parse(fs.readFileSync(path.join(SRC, 'games', GAME, 'game.json'), 'utf8'));
  const res = gameJson.resolution || {};
  const plan = D.clipFrame(clip.aspect, { width: res.width, height: res.height });
  const page = clip.page || (typeof gameJson.entry === 'string' ? gameJson.entry : 'game/index.html');
  const [pageFile, query] = page.split('?');
  const gameRoot = path.join(SRC, 'games', GAME);
  const pageAbs = path.resolve(gameRoot, pageFile);
  if (path.relative(gameRoot, pageAbs).startsWith('..') || !fs.existsSync(pageAbs)) return fail(`the page ${page} is not in games/${GAME} at commit ${copy.game.commit}`);
  const readScript = (f) => (f ? fs.readFileSync(path.join(D.clipsDir(GAME), f), 'utf8') : null);
  let setupCode, shotCode;
  try { setupCode = readScript(clip.setup); shotCode = readScript(clip.shot); } catch (err) { return fail(`a script named in the recipe is missing: ${err.message}`); }

  emit({ stage: 'boot', text: `Booting ${gameJson.name || GAME} offscreen`, plan });
  const win = new BrowserWindow({
    width: plan.winW, height: plan.winH, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.setFrameRate(clip.fps);
  win.webContents.on('console-message', (e) => {
    const m = e.message || '';
    if (/Security Warning|willReadFrequently/.test(m)) return;
    logs.push(`[${e.level}] ${m}`);
    if (logs.length > 500) logs.splice(0, 100);
  });
  win.webContents.on('render-process-gone', (e, d) => fail(`the game page crashed (${d.reason})`));
  try { await win.loadFile(pageAbs, query ? { search: query } : undefined); } catch (err) { return fail(`the game page did not load: ${err.message}`); }

  const js = (code) => win.webContents.executeJavaScript(code, true);
  // a thrown error comes back as { err } instead of a vague "Script failed to execute"
  const run = (code, ms = 120000) => Promise.race([
    js(`(async () => { try { const v = await (0, eval)(${JSON.stringify(code)}); try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch { return String(v); } } catch (e) { return { err: String(e && e.stack || e) }; } })()`),
    wait(ms).then(() => ({ err: `timed out after ${ms / 1000} s` })),
  ]);

  const ready = clip.ready || "document.readyState === 'complete'";
  let ok = false;
  for (let i = 0; i < 600 && !ok; i++) { ok = await js(`!!(${ready})`).catch(() => false); if (!ok) await wait(100); }
  if (!ok) return fail(`the game never became ready (${ready}) within 60 s`);
  if (clip.settle) await wait(clip.settle);

  const cfg = { length: clip.length, fps: clip.fps, aspect: clip.aspect, overlay: plan.overlay, fontScale: plan.fontScale, safe: plan.safe, titleCard: clip.titleCard, captions: clip.captions, endCard: clip.endCard, colors: clip.colors };
  const inst = await run(`import(${JSON.stringify(pathToFileURL(path.join(SRC, 'tools', 'clip-overlay.js')).href)}).then((m) => m.install(${JSON.stringify(cfg)}))`, 20000);
  if (inst && inst.err) return fail(`the words overlay failed: ${inst.err}`);
  if (setupCode) {
    emit({ stage: 'setup', text: `Setting the scene (${clip.setup})` });
    const r = await run(setupCode);
    if (r && r.err) return fail(`setup ${clip.setup}: ${r.err}`);
    emit({ stage: 'setup', result: r });
  }
  const startCode = `window.__clip.start();\n${shotCode || 'null'}`;
  const outDir = D.clipOutDir(GAME);
  fs.mkdirSync(outDir, { recursive: true });
  const total = Math.round(clip.length * clip.fps);

  // ------------------------------------------------------------------ probe ---
  if (PROBE) {
    const dir = path.join(outDir, `${NAME}-probe`);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^still-.*\.png$|^probe\.json$|^console\.txt$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    const times = D.probeTimes(clip);
    emit({ stage: 'film', text: 'Taking stills', frame: 0, of: times.length });
    const t0 = Date.now();
    const shot = await run(startCode, 20000);
    if (shot && shot.err) return fail(`shot ${clip.shot}: ${shot.err}`);
    const stills = [];
    for (const t of times) {
      const ms = t0 + t * 1000 - Date.now();
      if (ms > 0) await wait(ms);
      const img = await Promise.race([win.webContents.capturePage(), wait(10000).then(() => null)]);
      if (!img) { note(`the still at ${t} s timed out`); continue; }
      const f = path.join(dir, `still-${t.toFixed(1).padStart(5, '0')}s.png`);
      fs.writeFileSync(f, img.toPNG());
      stills.push(relRoot(f));
      emit({ stage: 'film', frame: stills.length, of: times.length });
    }
    fs.writeFileSync(path.join(dir, 'console.txt'), logs.join('\n') || '(no console output)');
    fs.writeFileSync(path.join(dir, 'probe.json'), JSON.stringify({ at: new Date().toISOString(), times, stills, window: [plan.winW, plan.winH], frame: [plan.outW, plan.outH], game: copy.game, shot, notes }, null, 2) + '\n');
    emit({ done: true, probe: true, dir: relRoot(dir), stills, shot, notes, consoleErrors: logs.filter((l) => l.startsWith('[error')).length });
    cleanup();
    app.exit(0);
    return;
  }

  // ----------------------------------------------------------------- record ---
  const part = path.join(WORK, 'clip.mp4');
  let latest = null, size = null, written = 0, t0 = 0, ffErr = '';
  const startFfmpeg = ({ width, height }) => {
    if (width !== plan.winW || height !== plan.winH) note(`the window painted ${width}x${height}, not ${plan.winW}x${plan.winH}: pixels may not be square`);
    const fade = Math.max(0, clip.length - 1.5);
    const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${width}x${height}`, '-framerate', String(clip.fps), '-i', '-',
      ...(music ? ['-i', music.file] : []),
      '-map', '0:v', ...(music ? ['-map', '1:a'] : []),
      '-vf', `scale=${plan.outW}:${plan.outH}:flags=neighbor,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'fast', '-tune', 'animation', '-crf', '16', '-r', String(clip.fps),
      ...(music ? ['-af', `afade=t=out:st=${fade}:d=1.5`, '-c:a', 'aac', '-b:a', '192k'] : []),
      '-t', String(clip.length), '-movflags', '+faststart', part];
    ff = spawn(FF, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    ff.stderr.on('data', (d) => { ffErr += d; });
    ff.stdin.on('error', () => {}); // ffmpeg died: its exit code says why
  };
  win.webContents.on('paint', (e, dirty, image) => {
    if (!t0 || written >= total) return;
    if (!size) { size = image.getSize(); startFfmpeg(size); }
    latest = image.toBitmap();
  });
  const pump = () => {
    if (!latest || !ff) return;
    const due = Math.min(total, Math.floor(((Date.now() - t0) / 1000) * clip.fps) + 1);
    while (written < due) { ff.stdin.write(latest); written++; }
  };
  emit({ stage: 'film', text: 'Filming', frame: 0, of: total });
  t0 = Date.now();
  const shot = await run(startCode, 20000);
  if (shot && shot.err) return fail(`shot ${clip.shot}: ${shot.err}`);
  emit({ stage: 'film', shot });
  win.webContents.invalidate();
  let lastEmit = 0;
  while (written < total) {
    if (cancelled) return;
    pump();
    if (Date.now() - lastEmit > 400) { lastEmit = Date.now(); emit({ stage: 'film', frame: written, of: total }); }
    if (Date.now() - t0 > (clip.length + 60) * 1000) return fail(`filming stalled at frame ${written} of ${total} (the page stopped painting?)`);
    await wait(Math.max(4, 500 / clip.fps));
  }
  emit({ stage: 'encode', text: 'Finishing the video', frame: written, of: total });
  const code = await new Promise((resolve) => { ff.on('close', resolve); ff.stdin.end(); });
  ff = null;
  if (code !== 0 || !fs.existsSync(part)) return fail(`ffmpeg failed (exit ${code}): ${ffErr.trim().split('\n').slice(-4).join(' | ')}`);

  const out = path.join(outDir, clip.out);
  fs.copyFileSync(part, out);
  const media = probeFile(out);
  const info = {
    at: new Date().toISOString(), out: relRoot(out), seconds: clip.length, fps: clip.fps, frames: written, frame: [plan.outW, plan.outH],
    window: [size.width, size.height], game: copy.game, harness: copy.harness, music: music ? { song: music.song, from: music.from } : null,
    media, bytes: fs.statSync(out).size, consoleErrors: logs.filter((l) => l.startsWith('[error')).length, shot, notes,
  };
  const settings = await D.clipSettings();
  if (settings.copyTo) {
    try {
      const dest = path.join(settings.copyTo, GAME);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(out, path.join(dest, clip.out));
      info.copiedTo = path.join(dest, clip.out);
    } catch (err) { note(`could not copy the MP4 to ${settings.copyTo} (local/clips.json): ${err.message}`); }
  }
  info.notes = notes;
  fs.writeFileSync(path.join(outDir, `${NAME}.json`), JSON.stringify(info, null, 2) + '\n');
  emit({ done: true, ...info });
  cleanup();
  app.exit(0);
});
