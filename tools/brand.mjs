#!/usr/bin/env node
// tools/brand.mjs — Pixel Yak's pictures, rendered from the yak in games/yak-trail (its art entry,
// with the user's Pixel Yak edits): the app icon (studio/ui/icon.png + icon.ico; the studio's top bar
// shows icon.png too) and the README picture (docs/yak.png). Repainted the yak? Run this again.
//   node tools/brand.mjs
// The compositions are tools/brand/*.json (the format: tools/render-art.cjs).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['tools/brand/icon.json', 8, 'studio/ui/icon.png'],
  ['tools/brand/icon.json', 1, 'studio/ui/icon.ico'],
  ['tools/brand/hero.json', 4, 'docs/yak.png'],
];
let failed = 0;
for (const [compose, scale, out] of jobs) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'render-art.cjs'), 'yak-trail', '--compose', compose, '--scale', String(scale), '--out', out], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write((r.stdout || '').trim() ? r.stdout.trim().split('\n')[0] + '\n' : '');
  if (r.status !== 0) { failed++; process.stderr.write(r.stderr || `render-art failed for ${out}\n`); }
}
process.exitCode = failed ? 1 : 0;
