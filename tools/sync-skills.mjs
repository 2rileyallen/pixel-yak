#!/usr/bin/env node
// tools/sync-skills.mjs — .agents/skills/ is the one source of truth for project skills.
// This mirrors it into .claude/skills/ (Claude Code reads that folder) so the copies can't
// drift apart again. Run after editing any skill:  node tools/sync-skills.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.agents', 'skills');
const DST = path.join(ROOT, '.claude', 'skills');
const check = process.argv.includes('--check');

const files = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)).map((f) => path.join(d.name, f)) : [d.name])) : [];
let drift = 0;
for (const skill of fs.readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  for (const f of files(path.join(SRC, skill))) {
    const a = path.join(SRC, skill, f), b = path.join(DST, skill, f);
    const same = fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
    if (same) continue;
    drift++;
    if (check) { console.log(`drift: ${skill}/${f}`); continue; }
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(a, b);
    console.log(`synced ${skill}/${f}`);
  }
}
for (const extra of fs.existsSync(DST) ? fs.readdirSync(DST).filter((n) => !fs.existsSync(path.join(SRC, n))) : []) {
  console.log(`note: .claude/skills/${extra} has no source in .agents/skills (left untouched)`);
}
console.log(drift ? (check ? `${drift} file(s) out of sync` : `done (${drift} file(s) updated)`) : 'skills in sync');
if (check && drift) process.exitCode = 1;
