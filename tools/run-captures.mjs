#!/usr/bin/env node
// tools/run-captures.mjs — run a game's headless capture tests and print pass/fail.
//   node tools/run-captures.mjs <gameId> [name…] [--jobs N] [--fail-fast]
// Each games/<id>/dev/tests/<name>.json runs through tools/game-capture.cjs into
// games/<id>/dev/out/<name>/ (screenshots, console.txt, result.json). A test fails when one
// of its expect/waitFor checks fails, the page doesn't load or crashes. Exit code 1 if any fail.
// The format: docs/contracts/CHECKS.md. Tests run in parallel, each in its own throwaway profile
// (--jobs N; default min(4, half the CPUs)) — use waitFor, not fixed waits, so a busy machine
// can't make them flaky. --fail-fast: a test stops at its first failed check, and no new tests
// start after a failure (what `node cli/yak.mjs test <game> --full --fail-fast` uses).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const jobsAt = args.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 1) : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
const failFast = args.includes('--fail-fast');
const pos = args.filter((a, i) => !a.startsWith('--') && !(jobsAt >= 0 && i === jobsAt + 1));
const [pid, ...names] = pos;
if (!pid || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(pid)) { console.error('usage: node tools/run-captures.mjs <gameId> [name…] [--jobs N] [--fail-fast]'); process.exit(2); }

const testDir = path.join(ROOT, 'games', pid, 'dev', 'tests');
const outRoot = path.join(ROOT, 'games', pid, 'dev', 'out');
let all = [];
try { all = fs.readdirSync(testDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); } catch { /* none */ }
if (!all.length) { console.error(`no tests in games/${pid}/dev/tests/`); process.exit(2); }
const unknown = names.filter((n) => !all.includes(n));
if (unknown.length) { console.error(`unknown test(s): ${unknown.join(', ')} — have: ${all.join(', ')}`); process.exit(2); }
const todo = names.length ? names : all;
const electron = createRequire(import.meta.url)('electron');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function runOne(name) {
  const out = path.join(outRoot, name);
  fs.rmSync(path.join(out, 'result.json'), { force: true });
  const t0 = Date.now();
  return new Promise((resolve) => {
    let stderr = '';
    const p = spawn(electron, [path.join(ROOT, 'tools', 'game-capture.cjs'), path.join(testDir, `${name}.json`), out, ...(failFast ? ['--fail-fast'] : [])], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => {
      let res = null;
      try { res = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')); } catch { /* crashed before writing it */ }
      resolve({ name, out, code, res, ms: Date.now() - t0, stderr });
    });
  });
}

const results = [];
const queue = [...todo];
let stopped = false;
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length && !stopped) {
    const r = await runOne(queue.shift());
    results.push(r);
    const ok = r.code === 0 && r.res && r.res.pass;
    const info = r.res ? `${r.res.checks} check${r.res.checks === 1 ? '' : 's'}, ${r.res.shots} shot${r.res.shots === 1 ? '' : 's'}${r.res.consoleErrors ? `, ${r.res.consoleErrors} console error${r.res.consoleErrors === 1 ? '' : 's'}` : ''}` : 'no result';
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.name} (${(r.ms / 1000).toFixed(1)} s · ${info})`);
    if (!ok) {
      for (const f of (r.res && r.res.failures) || []) console.log(`     - ${f}`);
      if (!r.res) console.log(`     - electron exited ${r.code}${r.stderr ? ': ' + r.stderr.trim().split('\n').slice(-3).join(' | ') : ''}`);
      if (failFast) stopped = true;
    }
  }
}));

const failed = results.filter((r) => !(r.code === 0 && r.res && r.res.pass));
const unchecked = results.filter((r) => r.res && !r.res.checks).map((r) => r.name);
if (stopped && queue.length) console.log(`(--fail-fast: not run: ${queue.join(', ')})`);
console.log(`\n${results.length - failed.length}/${results.length} passed · output in ${rel(outRoot)}/<name>/ (console.txt marks [FAIL] lines)`);
if (unchecked.length) console.log(`note: no expect/waitFor checks in ${unchecked.join(', ')} — those only prove the page loads; look at their screenshots`);
process.exitCode = failed.length ? 1 : 0;
