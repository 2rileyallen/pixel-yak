// tools/checks.mjs — a game's checks (docs/contracts/CHECKS.md): what checks it has and which part of
// the game each one guards (games/<id>/checks.json), what changed (git), and running a selection in
// parallel with timings. Used by `node cli/yak.mjs test <game>` and the pre-push hook it installs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHECKS_FORMAT = 'pixel-yak-checks@1';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// What a game without its own checks.json gets (the same as templates/blank/checks.json).
export const DEFAULT_CHECKS = {
  checks: {
    unit: { run: 'node --test "games/{{ID}}/dev/**/*.test.mjs"', note: "the game's rules as tests" },
    studio: { yak: 'check', note: 'structure, every art id renders at its size, the linter' },
    boot: { captures: ['boot'], note: 'the game boots and draws' },
    captures: { captures: '*', note: 'every capture test in dev/tests/' },
  },
  areas: {
    'game/sprites.js': ['unit', 'studio', 'boot'],
    'game/art/**': ['studio', 'boot'],
    'assets.js': ['studio', 'boot'],
    'design/**/*.js': ['studio', 'boot'],
    'design/**': [],
    'game/**': ['unit', 'boot'],
    'dev/tests/**': ['captures'],
    'dev/**': ['unit'],
    'game.json': ['unit', 'studio', 'boot'],
    'requests/**': [],
    '**/*.md': [],
  },
  quick: ['unit'],
  full: ['unit', 'studio', 'captures'],
  perf: [],
};

export const gameDir = (id) => path.join(ROOT, 'games', id);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// A glob over '/'-separated paths: ** = any folders, * = within one name, ? = one character.
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// games/<id>/checks.json (or the default), checked: { cfg, source, problems: [] }.
export function loadChecks(id) {
  if (!ID_RE.test(id || '')) throw new Error(`invalid game id: ${JSON.stringify(id)}`);
  const file = path.join(gameDir(id), 'checks.json');
  let cfg = DEFAULT_CHECKS, source = 'the default checks (no checks.json)';
  const problems = [];
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); source = rel(file); }
    catch (err) { throw new Error(`${rel(file)} is not valid JSON: ${err.message}`); }
  }
  const checks = cfg.checks && typeof cfg.checks === 'object' ? cfg.checks : {};
  for (const [name, def] of Object.entries(checks)) {
    if (!NAME_RE.test(name)) problems.push(`check name "${name}" (use a-z, 0-9, - and _)`);
    const kinds = ['run', 'yak', 'captures'].filter((k) => def && k in def);
    if (kinds.length !== 1) problems.push(`check "${name}" needs exactly one of run, yak, captures`);
  }
  const known = (list, where) => {
    if (!Array.isArray(list)) { problems.push(`${where} must be a list of check names`); return []; }
    for (const n of list) if (!checks[n]) problems.push(`${where} names "${n}", which isn't a check`);
    return list.filter((n) => checks[n]);
  };
  const areas = [];
  for (const [glob, list] of Object.entries(cfg.areas || {})) areas.push({ glob, re: globToRegex(glob), checks: known(list, `areas["${glob}"]`) });
  const sets = {};
  for (const k of ['quick', 'full', 'perf']) sets[k] = k in cfg ? known(cfg[k], k) : k === 'full' ? Object.keys(checks) : [];
  return { cfg: { checks, areas, ...sets }, source, problems };
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout : null;
}
const lines = (s) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean);
const skipPath = (p) => p.startsWith('dev/out/') || p.startsWith('node_modules/') || p.startsWith('.git/');
const stampFile = (id) => path.join(gameDir(id), 'dev', 'out', '.last-test.json');

// What changed in a game, as paths relative to the game folder:
// { files, via, base } — via 'game repo' (games/<id>/.git), 'harness repo', or 'last passing run'
// (a game folder git can't see: files modified since the last `test` that passed).
// since: a git ref to compare with (default HEAD: uncommitted + untracked files).
export function changedFiles(id, { since = null } = {}) {
  const dir = gameDir(id);
  const own = fs.existsSync(path.join(dir, '.git'));
  const ignored = !own && git(ROOT, ['check-ignore', '-q', `games/${id}/game.json`]) !== null;
  if (!own && (ignored || git(ROOT, ['rev-parse', '--git-dir']) === null)) {
    if (since) throw new Error(`games/${id} isn't in a git repo, so --since can't be used (git init it to make it its own repo)`);
    let at = 0;
    try { at = JSON.parse(fs.readFileSync(stampFile(id), 'utf8')).at || 0; } catch { /* never passed: everything counts */ }
    const files = [];
    const walk = (d, pre) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = pre + e.name;
        if (skipPath(p + (e.isDirectory() ? '/' : ''))) continue;
        if (e.isDirectory()) walk(path.join(d, e.name), p + '/');
        else if (fs.statSync(path.join(d, e.name)).mtimeMs > at) files.push(p);
      }
    };
    walk(dir, '');
    return { files, via: 'last passing run', base: at ? new Date(at).toISOString() : 'never (everything counts)' };
  }
  const repo = own ? dir : ROOT;
  const spec = own ? [] : ['--', `games/${id}`];
  const prefix = own ? '' : `games/${id}/`;
  const hasHead = git(repo, ['rev-parse', '--verify', '-q', 'HEAD']) !== null;
  let tracked;
  if (since) {
    if (git(repo, ['rev-parse', '--verify', '-q', `${since}^{commit}`]) === null) throw new Error(`--since ${since}: no such commit in ${own ? `games/${id}` : 'the harness repo'}`);
    tracked = git(repo, ['diff', '--name-only', since, ...spec]);
  } else tracked = hasHead ? git(repo, ['diff', '--name-only', 'HEAD', ...spec]) : git(repo, ['ls-files', ...spec]);
  const untracked = git(repo, ['ls-files', '--others', '--exclude-standard', ...spec]);
  const files = [...new Set([...lines(tracked), ...lines(untracked)])]
    .filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).filter((p) => !skipPath(p));
  return { files, via: own ? 'game repo' : 'harness repo', base: since || (hasHead ? 'HEAD' : 'no commits yet') };
}

// Which checks the changed files call for: each file takes the checks of the FIRST area pattern it
// matches (so put specific patterns first). → { names, reasons: {check: [glob]}, unmatched: [file], quiet: [file] }
export function selectForFiles(cfg, files) {
  const names = new Set(), reasons = {}, unmatched = [], quiet = [];
  for (const f of files) {
    const a = cfg.areas.find((x) => x.re.test(f));
    if (!a) { unmatched.push(f); continue; }
    if (!a.checks.length) { quiet.push(f); continue; }
    for (const n of a.checks) { names.add(n); (reasons[n] ||= new Set()).add(a.glob); }
  }
  const order = Object.keys(cfg.checks);
  return { names: [...names].sort((x, y) => order.indexOf(x) - order.indexOf(y)), reasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, [...v]])), unmatched, quiet };
}

// A check that runs every capture test makes the ones running a few of them redundant.
export function dropCoveredCaptures(cfg, names) {
  const all = (n) => 'captures' in cfg.checks[n] && (cfg.checks[n].captures === '*' || cfg.checks[n].captures === 'all');
  return names.some(all) ? names.filter((n) => all(n) || !('captures' in cfg.checks[n])) : names;
}

export const defaultJobs = () => Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));

// How a check runs: { cmd, args, shell, label } — always from the harness root.
export function commandFor(id, def, { failFast = false } = {}) {
  const fill = (s) => String(s).replaceAll('{{ID}}', id).replaceAll('{{DIR}}', `games/${id}`);
  if ('run' in def) return { cmd: fill(def.run), args: [], shell: true, label: fill(def.run) };
  if ('yak' in def) {
    const words = String(def.yak).trim().split(/\s+/).filter(Boolean);
    const args = words.some((w) => w.includes('{{ID}}')) ? words.map(fill) : [...words, id];
    return { cmd: process.execPath, args: [path.join(ROOT, 'cli', 'yak.mjs'), ...args], shell: false, label: `node cli/yak.mjs ${args.join(' ')}` };
  }
  const names = def.captures === '*' || def.captures === 'all' ? [] : (Array.isArray(def.captures) ? def.captures : [def.captures]).map(String);
  const args = [path.join(ROOT, 'tools', 'run-captures.mjs'), id, ...names, ...(failFast ? ['--fail-fast'] : [])];
  return { cmd: process.execPath, args, shell: false, label: `node tools/run-captures.mjs ${[id, ...names].join(' ')}` };
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
}

// Run the named checks, up to `jobs` at once. onDone(result) is called as each finishes, in finish order.
// result: { name, ok, ms, output, label, skipped?, timedOut? }. failFast stops the rest at the first failure.
export async function runChecks(id, cfg, names, { jobs = 4, failFast = false, onDone = () => {} } = {}) {
  const queue = [...names], results = [], running = new Set();
  let stop = false;
  const one = (name) => new Promise((resolve) => {
    const def = cfg.checks[name];
    const c = commandFor(id, def, { failFast });
    const t0 = Date.now();
    let output = '', timedOut = false;
    const child = spawn(c.cmd, c.args, { cwd: ROOT, shell: c.shell, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    child.killedByStop = false;
    running.add(child);
    const keep = (d) => { output += d; if (output.length > 400000) output = output.slice(-200000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const limit = setTimeout(() => { timedOut = true; killTree(child); }, Math.max(5, Number(def.timeout) || 600) * 1000);
    child.on('error', (err) => { output += `\n${err.message}`; });
    child.on('close', (code) => {
      clearTimeout(limit);
      running.delete(child);
      resolve({ name, ok: code === 0 && !timedOut && !child.killedByStop, ms: Date.now() - t0, output, label: c.label, timedOut, stopped: child.killedByStop, code });
    });
  });
  const worker = async () => {
    while (queue.length && !stop) {
      const r = await one(queue.shift());
      results.push(r);
      onDone(r);
      if (!r.ok && failFast && !stop) {
        stop = true;
        for (const ch of running) { ch.killedByStop = true; killTree(ch); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, names.length)) }, worker));
  for (const name of queue) { const r = { name, ok: false, skipped: true, ms: 0, output: '', label: '' }; results.push(r); onDone(r); }
  return results;
}

// Remember a passing run (the "what changed" baseline for games git can't see).
export function stampPass(id) {
  const f = stampFile(id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ at: Date.now() }) + '\n');
}

// ------------------------------------------------------------- the hook ---
const HOOK_MARK = '# pixel-yak pre-push hook';
export function hookPath(id) {
  const dir = gameDir(id);
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const p = lines(git(dir, ['rev-parse', '--git-path', 'hooks']))[0];
  return p ? path.join(path.resolve(dir, p), 'pre-push') : null;
}
export function hookScript(id) {
  return `#!/bin/sh
${HOOK_MARK} — runs ${id}'s full checks before every push (node cli/yak.mjs hooks ${id} --install).
# Remove it with: node cli/yak.mjs hooks ${id} --uninstall. Skip it once: git push --no-verify (only when the user says so).
HARNESS="$(git rev-parse --show-toplevel)/../.."
if [ ! -f "$HARNESS/cli/yak.mjs" ]; then
  echo "pixel-yak: this repo isn't inside a Pixel Yak games/ folder - checks skipped" >&2
  exit 0
fi
cd "$HARNESS" || exit 0
echo "pixel-yak: running the full checks for ${id} before the push..." >&2
node cli/yak.mjs test ${id} --full --fail-fast
status=$?
if [ $status -ne 0 ]; then
  echo "pixel-yak: checks failed - push stopped. Fix it and push again (git push --no-verify skips the checks, only if the user says so)." >&2
fi
exit $status
`;
}
export const isOurHook = (file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(HOOK_MARK);
