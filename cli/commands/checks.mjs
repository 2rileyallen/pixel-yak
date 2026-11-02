// cli/commands/checks.mjs — a game's checks: only what a change touches (--changed, the default), the
// quick set, or everything (--full), and the git pre-push hook that runs the full set before every
// push (docs/contracts/CHECKS.md; the logic is tools/checks.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { out, fail, gameArg, plural } from '../lib.mjs';
import * as C from '../../tools/checks.mjs';

export const section = { title: 'Checks (run what your change touches; the full set gates every push)', order: 45 };

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// The part of a failed check's output worth reading: from the first failure marker, else the end.
function failureExcerpt(text, max = 30) {
  const ls = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const at = ls.findIndex((l) => /^\s*(not ok\b|FAIL\b|ERROR\b|error:|✖)/.test(l));
  return (at >= 0 ? ls.slice(at, at + max) : ls.slice(-max)).map((l) => `     | ${l.length > 220 ? l.slice(0, 219) + '…' : l}`);
}

export const commands = {
  test: {
    usage: 'test <game> [check…] [--changed|--quick|--full|--perf] [--since <ref>] [--fail-fast] [--list]',
    help: 'run the game\'s checks (its checks.json). Default --changed: only the checks for\nwhat changed (git: uncommitted + untracked, or since <ref>). --quick: the\nquick set · --full: everything (what the pre-push hook runs) · --list: show\nthe checks and areas. Quiet on success, the failing output on failure',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const id = p.id;
      const { cfg, source, problems } = C.loadChecks(id);
      if (problems.length) fail(`${source}: ${problems.join(' · ')}`);
      if (opt.list) return list(id, cfg, source);
      const t0 = Date.now();
      const named = pos.slice(1);
      for (const n of named) if (!cfg.checks[n]) fail(`no check "${n}" in ${source} — have: ${Object.keys(cfg.checks).join(', ')}`);
      const mode = named.length ? 'named' : opt.full ? 'full' : opt.quick ? 'quick' : opt.perf ? 'perf' : 'changed';
      let names;
      if (mode === 'named') names = named;
      else if (mode !== 'changed') names = cfg[mode];
      else {
        let ch;
        try { ch = C.changedFiles(id, { since: typeof opt.since === 'string' ? opt.since : null }); } catch (err) { fail(err.message); }
        const sel = C.selectForFiles(cfg, ch.files);
        const vs = ch.via === 'last passing run' ? `files modified since the last passing run (${ch.base})` : `${ch.via}, vs ${ch.base}`;
        if (!ch.files.length) { out(`test ${id}: nothing changed (${vs}) — nothing to run. --full runs everything.`); return; }
        const shown = ch.files.length <= 4 ? `: ${ch.files.join(', ')}` : ` (${ch.files.slice(0, 3).join(', ')}, …)`;
        out(`test ${id} --changed · ${plural(ch.files.length, 'file')} changed${shown} [${vs}]`);
        if (sel.unmatched.length) out(`  ${plural(sel.unmatched.length, 'file')} in no area of ${source} (no checks for them): ${sel.unmatched.slice(0, 5).join(', ')}${sel.unmatched.length > 5 ? ', …' : ''}`);
        names = C.dropCoveredCaptures(cfg, sel.names);
        if (!names.length) { out('  → no checks guard those files. --full runs everything.'); return; }
        out(`  → ${names.map((n) => `${n} (${sel.reasons[n].join(', ')})`).join(' · ')}`);
      }
      names = C.dropCoveredCaptures(cfg, names);
      if (mode !== 'changed') out(`test ${id} ${mode === 'named' ? names.join(' ') : '--' + mode} · ${source}`);
      if (!names.length) { out(`  the ${mode} set of ${source} is empty — nothing to run.`); return; }
      const width = Math.max(...names.map((n) => n.length));
      const results = await C.runChecks(id, cfg, names, {
        jobs: Number(opt.jobs) || 4, failFast: !!opt['fail-fast'],
        onDone: (r) => {
          if (r.skipped) { out(`SKIP ${r.name.padEnd(width)}  (stopped after the first failure)`); return; }
          out(`${r.ok ? 'PASS' : r.stopped ? 'STOP' : 'FAIL'} ${r.name.padEnd(width)}  ${secs(r.ms).padStart(7)}${r.ok || r.stopped ? '' : `   ${r.label}`}`);
          if (!r.ok && !r.stopped) {
            if (r.timedOut) out(`     | timed out after ${Math.max(5, Number(cfg.checks[r.name].timeout) || 600)} s`);
            for (const l of failureExcerpt(r.output)) out(l);
          }
        },
      });
      const failed = results.filter((r) => !r.ok && !r.skipped && !r.stopped);
      const total = secs(Date.now() - t0);
      if (failed.length) {
        out(`\n${failed.length} of ${plural(results.length, 'check')} failed (${failed.map((r) => r.name).join(', ')}) · ${total}`);
        process.exitCode = 1;
        return;
      }
      out(`${results.length === 1 ? '1 check passes' : `all ${results.length} checks pass`} · ${total}`);
      if (mode === 'changed' || mode === 'full') C.stampPass(id);
    },
  },

  hooks: {
    usage: 'hooks <game> [--install|--uninstall] [--force]',
    help: 'a git pre-push hook in the game\'s own repo that runs `test <game> --full`\nbefore every push and stops the push if anything fails. No flag: is it installed?',
    async run({ pos, opt }) {
      const id = (await gameArg(pos[0])).id;
      const file = C.hookPath(id);
      if (!file) fail(`games/${id} isn't its own git repo (no games/${id}/.git), so there's nothing to hook. Make it one first: git -C games/${id} init`);
      const ours = C.isOurHook(file);
      const backup = file + '.before-yak';
      if (opt.install) {
        if (fs.existsSync(file) && !ours && !opt.force) fail(`${id} already has a pre-push hook that isn't Pixel Yak's (${file}). --force replaces it and keeps the old one as pre-push.before-yak`);
        if (fs.existsSync(file) && !ours) fs.renameSync(file, backup);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, C.hookScript(id), { mode: 0o755 });
        try { fs.chmodSync(file, 0o755); } catch { /* Windows: git runs it through sh anyway */ }
        out(`installed: every \`git push\` in games/${id} runs \`node cli/yak.mjs test ${id} --full\` first and stops the push if a check fails.`);
        return;
      }
      if (opt.uninstall) {
        if (!ours) { out(fs.existsSync(file) ? `${id}'s pre-push hook isn't Pixel Yak's — left alone.` : `no pre-push hook in ${id}.`); return; }
        fs.rmSync(file);
        if (fs.existsSync(backup)) { fs.renameSync(backup, file); out('removed; the hook that was there before is back.'); } else out('removed.');
        return;
      }
      out(ours ? `installed — pushes from games/${id} run the full checks first (--uninstall removes it)` : fs.existsSync(file) ? `${id} has its own pre-push hook (not Pixel Yak's)` : `not installed — --install adds it`);
    },
  },
};

function list(id, cfg, source) {
  out(`# checks for ${id} — ${source}`);
  for (const [name, def] of Object.entries(cfg.checks)) out(`- ${name}: ${C.commandFor(id, def).label}${def.note ? `  (${def.note})` : ''}`);
  out('\nareas (a changed file takes the checks of the first pattern it matches):');
  for (const a of cfg.areas) out(`  ${a.glob.padEnd(22)} → ${a.checks.join(', ') || '(nothing)'}`);
  out(`\nquick: ${cfg.quick.join(', ') || '-'} · full: ${cfg.full.join(', ') || '-'} · perf: ${cfg.perf.join(', ') || '-'}`);
}
