// studio/data/engine-copy.mjs — each game's own copy of the engine (games/<id>/engine/, engine/README.md):
// fingerprints, what changed on each side, copying it in, and every relative path a game's code uses
// (so nothing reaches outside its folder). Pure Node: the CLI (engine commands, check) and the new-game
// scaffold use it.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, inside } from './core.mjs';

const D = { ROOT, inside };
export const HARNESS = path.join(D.ROOT, 'engine');
const COPY = 'COPY.json'; // in a game's engine/: the version and each file's fingerprint when it was copied
export const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', 'refs', 'scratch', 'out', '.wrangler']);
export const CODE = /\.(m?js|cjs|ts|html)$/;

export const posix = (p) => p.split(path.sep).join('/');
const sha = (file) => crypto.createHash('sha1').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
const readJ = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

export const gameEngineDir = (pid) => path.join(D.ROOT, 'games', pid, 'engine');
export const harnessEngineVersion = () => (readJ(path.join(HARNESS, 'version.json')) || {}).version ?? null;

// rel path → fingerprint, for every file of an engine folder (its COPY.json left out)
export function fingerprints(dir) {
  const outMap = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!(d === dir && e.name === COPY)) outMap[posix(path.relative(dir, p))] = sha(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return outMap;
}

// A game's engine: { own, version, harness, local: [changed in the game's copy], fresh: [changed in
// the harness since the copy], both: [changed on both sides] }
export function engineStatus(pid) {
  const dir = gameEngineDir(pid);
  const harness = harnessEngineVersion();
  if (!fs.existsSync(path.join(dir, 'version.json'))) return { own: false, version: null, harness, local: [], fresh: [], both: [] };
  const copy = readJ(path.join(dir, COPY)) || { files: {} };
  const was = copy.files || {}, mine = fingerprints(dir), theirs = fingerprints(HARNESS);
  const names = new Set([...Object.keys(was), ...Object.keys(mine), ...Object.keys(theirs)]);
  const local = [], fresh = [];
  for (const n of names) {
    if (mine[n] !== was[n]) local.push(n);
    if (theirs[n] !== was[n]) fresh.push(n);
  }
  const both = local.filter((n) => fresh.includes(n) && mine[n] !== theirs[n]);
  return { own: true, version: (readJ(path.join(dir, 'version.json')) || {}).version ?? null, harness, local: local.sort(), fresh: fresh.sort(), both, copiedFrom: copy.harness || '', copiedAt: copy.copied || '' };
}

function harnessCommit() {
  const r = spawnSync('git', ['-C', D.ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  const dirty = spawnSync('git', ['-C', D.ROOT, 'status', '--porcelain', '--', 'engine'], { encoding: 'utf8' });
  return r.status === 0 ? `${r.stdout.trim()}${dirty.stdout && dirty.stdout.trim() ? '+uncommitted' : ''}` : '';
}

// Copy harness engine files into the game (all of them, or only `names`), then record the copy.
export function copyEngine(pid, names = null) {
  const dir = gameEngineDir(pid);
  const theirs = fingerprints(HARNESS);
  const list = names || Object.keys(theirs);
  for (const n of list) {
    const src = path.join(HARNESS, n), dst = path.join(dir, n);
    if (theirs[n]) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    else if (fs.existsSync(dst)) fs.rmSync(dst); // gone from the harness
  }
  const copy = readJ(path.join(dir, COPY)) || { files: {} };
  const files = names ? { ...copy.files } : {};
  for (const n of list) { if (theirs[n]) files[n] = theirs[n]; else delete files[n]; }
  const version = (readJ(path.join(dir, 'version.json')) || {}).version ?? null;
  const record = { note: 'Written by node cli/yak.mjs engine-pull / engine-adopt: the engine version this game has and each file as it was copied, so local changes and harness updates can be told apart. Don\'t edit.', version, harness: harnessCommit(), copied: new Date().toISOString().slice(0, 10), files: Object.fromEntries(Object.entries(files).sort()) };
  fs.writeFileSync(path.join(dir, COPY), JSON.stringify(record, null, 2) + '\n');
  setManifestEngine(pid, version);
  return version;
}

function setManifestEngine(pid, version) {
  const f = path.join(D.ROOT, 'games', pid, 'game.json');
  const raw = fs.readFileSync(f, 'utf8');
  const j = JSON.parse(raw);
  if (String(j.engine) === String(version)) return;
  j.engine = String(version);
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}

// Changelog entries newer than `from` (## <n> — <date> headings in engine/CHANGELOG.md).
export function changelogSince(from) {
  const text = fs.existsSync(path.join(HARNESS, 'CHANGELOG.md')) ? fs.readFileSync(path.join(HARNESS, 'CHANGELOG.md'), 'utf8') : '';
  const parts = text.split(/^## /m).slice(1);
  return parts.filter((p) => Number(p.split(/\s/)[0]) > Number(from || 0)).map((p) => '## ' + p.trim());
}

// ------------------------------------------------------------- imports ---
// Every relative path in a game's code: import/export … from '…', import('…'), new URL('…', import.meta.url),
// src="…" / href="…". → [{ file, line, spec, abs }]
export function gameImports(pid) {
  const base = path.join(D.ROOT, 'games', pid);
  const found = [];
  const re = /(?:from\s*|import\s*\(\s*|import\s+|new URL\(\s*|src=|href=)(['"`])(\.{1,2}\/[^'"`\n]*)\1/g;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !(d === base && e.name === 'engine')) walk(p); continue; }
      if (!CODE.test(e.name)) continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*)/.test(l)) return; // a comment line
        for (const m of l.matchAll(re)) found.push({ file: p, line: i + 1, spec: m[2], abs: path.resolve(path.dirname(p), m[2].split(/[?#]/)[0]) });
      });
    }
  };
  walk(base);
  return found;
}

// Paths that leave the game's folder → [{ file, line, spec, where, level }]:
// - into another game: always 'error' (a game never imports from another game);
// - from what the game ships (game/, design/, assets.js) into the harness: 'error' — it would break
//   once the game is built or cloned alone; the harness engine is fine while a game has no copy yet;
// - from its tooling (dev/, web/, scripts run from the harness): the harness's tools and data layer
//   are fine (e.g. a feedback pull filing requests); its engine is a 'warn' once the game has its own.
export function outsideImports(pid) {
  const base = path.join(D.ROOT, 'games', pid);
  const own = fs.existsSync(path.join(base, 'engine', 'version.json'));
  const found = [];
  for (const x of gameImports(pid)) {
    if (D.inside(base, x.abs)) continue;
    const rel = posix(path.relative(base, x.file));
    const ships = /^(game|design)\//.test(rel) || rel === 'assets.js';
    const engine = D.inside(HARNESS, x.abs);
    if (D.inside(path.join(D.ROOT, 'games'), x.abs)) found.push({ ...x, where: 'another game', level: 'error' });
    else if (engine && !own) continue;
    else if (ships) found.push({ ...x, where: engine ? 'the harness engine (this game has its own copy)' : 'the harness', level: 'error' });
    else if (engine) found.push({ ...x, where: 'the harness engine (this game has its own copy)', level: 'warn' });
  }
  return found;
}
