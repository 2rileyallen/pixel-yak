// tests/skills-sync.test.mjs — the skills every harness reads stay one set: .agents/skills is the
// source, .claude/skills its copy (npm run sync-skills). A skill edited in one place only fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('.claude/skills matches .agents/skills', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/sync-skills.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}\nRun: npm run sync-skills`);
});
