// studio/main/ipc-clips.mjs — the Clips view's main-process side (docs/contracts/CLIPS.md): list and
// save clip recipes, and run the recorder (tools/clip.cjs) — one render or probe at a time, its
// progress streamed to the studio as `clips:progress`, cancellable. Loaded by main.mjs at startup.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function register({ handle, D, toStudio, app }) {
  let job = null; // { pid, name, probe, child, cancelFile, startedAt, last, done, error, killTimer }
  const pub = () => (job ? { pid: job.pid, name: job.name, probe: job.probe, startedAt: job.startedAt, last: job.last } : null);
  const send = (m) => toStudio('clips:progress', { pid: job.pid, name: job.name, probe: job.probe, ...m });

  handle('clips:list', (pid) => D.listClips(D.assertId('project', pid)));
  handle('clips:save', (pid, name, patch) => D.saveClip(D.assertId('project', pid), D.assertClipName(name), patch || {}));
  handle('clips:songs', (pid) => D.listClipSongs(D.assertId('project', pid), D));
  handle('clips:job', () => pub());

  handle('clips:render', async (pid, name, opts) => {
    D.assertId('project', pid);
    D.assertClipName(name);
    if (job) throw new Error(`Already ${job.probe ? 'probing' : 'rendering'} "${job.name}" — one at a time.`);
    await D.readClip(pid, name);
    const probe = !!(opts && opts.probe);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // stdin doesn't reach an Electron main process on Windows, so Cancel creates this file instead
    const cancelFile = path.join(os.tmpdir(), `pixel-yak-clip-cancel-${process.pid}-${Date.now()}`);
    const child = spawn(process.execPath, D.recorderArgs(pid, name, { probe, cancelFile }), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
    job = { pid, name, probe, child, cancelFile, startedAt: Date.now(), last: { stage: 'start' }, done: null, error: null, stderr: '' };
    const mine = job;
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const m = D.parseClipLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (!m) continue;
        if (m.done) mine.done = m;
        else if (m.error) mine.error = m;
        else { if (m.stage) mine.last = m; send(m); }
      }
    });
    child.stderr.on('data', (d) => { mine.stderr = (mine.stderr + d).slice(-4000); });
    child.on('error', (err) => { mine.error = { error: err.message }; });
    child.on('close', (code) => {
      clearTimeout(mine.killTimer);
      fs.rm(mine.cancelFile, { force: true }, () => {});
      const cancelled = !!mine.cancelled;
      const ok = code === 0 && !!mine.done;
      const error = ok || cancelled ? null : (mine.error ? mine.error.error : mine.stderr.trim().split('\n').slice(-3).join(' ') || `the recorder exited ${code}`);
      toStudio('clips:progress', { pid, name, probe, finished: true, ok, cancelled, done: mine.done, error, console: mine.error && mine.error.console });
      if (job === mine) job = null;
    });
    return pub();
  });

  // Ask the recorder to stop (it removes what it made); force it after a few seconds.
  handle('clips:cancel', () => {
    if (!job) return false;
    const j = job;
    j.cancelled = true;
    try { fs.writeFileSync(j.cancelFile, 'cancel'); } catch {}
    j.killTimer = setTimeout(() => killTree(j.child), 5000);
    return true;
  });

  app.on('before-quit', () => { if (job) killTree(job.child); });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGKILL');
}
