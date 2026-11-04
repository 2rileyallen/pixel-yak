// cli/commands/setup.mjs — is this computer ready? What a fresh clone needs (Node, git and a git
// name, Pixel Yak's packages, ffmpeg for clips) and how each game stands with the engine, in plain
// words with the fix for each. Safe to run any time: it only looks.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { D, out, plural } from '../lib.mjs';
import { engineStatus, harnessEngineVersion } from '../../studio/data/engine-copy.mjs';

export const section = { title: 'Setup', order: 90 };

const run = (cmd, args, cwd = D.ROOT) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true });
  return r.error || r.status !== 0 ? null : (r.stdout || '').trim();
};

export const commands = {
  doctor: {
    usage: 'doctor',
    help: 'is this computer ready for Pixel Yak? Node, git (and your git name), the installed\npackages, ffmpeg (clips only), and which games run on an engine that a harness change reaches.\nEach problem comes with its fix. Only looks; changes nothing',
    async run() {
      const fixes = [];
      const ok = (s) => out(`ok    ${s}`);
      const fix = (s, how) => { out(`FIX   ${s}\n      → ${how}`); fixes.push(s); };
      const note = (s) => out(`note  ${s}`);

      const major = Number(process.versions.node.split('.')[0]);
      if (major >= 22) ok(`Node.js ${process.version}`); else fix(`Node.js ${process.version} is too old`, 'install Node.js 22 or newer from https://nodejs.org');

      const git = run('git', ['--version']);
      if (!git) fix('git is not installed', 'install it from https://git-scm.com (games are git repos: history, branches, the clip recorder)');
      else {
        ok(git);
        const name = run('git', ['config', 'user.name']), email = run('git', ['config', 'user.email']);
        if (name && email) ok(`git knows who you are (${name})`);
        else fix("git doesn't know your name yet, so a new game can't make its first commit", 'git config --global user.name "Your Name"   and   git config --global user.email "you@example.com"');
      }

      let electron = null;
      try { electron = createRequire(import.meta.url)('electron'); } catch { /* not installed */ }
      if (typeof electron === 'string' && fs.existsSync(electron)) ok('Pixel Yak\'s packages are installed (Electron: the studio, checks, sheets)');
      else fix('Pixel Yak\'s packages are not installed', 'in this folder: npm install');

      if (run('ffmpeg', ['-version'])) ok('ffmpeg (video clips)');
      else note('ffmpeg is not installed: everything works except rendering video clips (https://ffmpeg.org)');

      const ps = await D.listProjects({ broken: true });
      const broken = ps.filter((p) => p.broken);
      for (const p of broken) fix(`games/${p.id}/game.json can't be read (${p.broken})`, 'fix the file (a merge conflict?); the studio lists the game as broken until then');
      const rows = ps.filter((p) => !p.broken).map((p) => ({ p, s: engineStatus(p.id) }));
      const shared = rows.filter((r) => !r.s.own);
      const hv = harnessEngineVersion();
      const behind = rows.filter((r) => r.s.own && String(r.s.version) !== String(hv));
      if (!ps.length) note('no games yet: make one in the studio (Games → New game) or node cli/yak.mjs new-game <id> --name "Name"');
      else ok(`${plural(rows.length - shared.length, 'game')} with their own engine copy (a Pixel Yak update never changes them by itself)`);
      for (const r of shared) fix(`${r.p.id} runs on the shared engine: any change to Pixel Yak's engine/ reaches it at once`, `node cli/yak.mjs engine-adopt ${r.p.id}, then its full checks`);
      if (behind.length) note(`${plural(behind.length, 'game')} on an older engine than Pixel Yak's v${hv} (${behind.map((r) => `${r.p.id} v${r.s.version}`).join(', ')}): fine as they are; bring one up when you choose (node cli/yak.mjs engine <game>)`);

      const local = path.join(D.ROOT, 'local');
      note(`your own things (ideas, designs, LESSONS.md, save backups) live in ${fs.existsSync(local) ? 'local/' : 'local/ (made when first needed)'}: git ignores it; copy it to a new computer, or make it a private repo of its own`);
      out(fixes.length ? `\n${plural(fixes.length, 'thing')} to fix above.` : '\nReady.');
      if (fixes.length) process.exitCode = 1;
    },
  },
};
