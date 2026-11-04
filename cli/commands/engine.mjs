// cli/commands/engine.mjs — each game's own copy of the engine (games/<id>/engine/, engine/README.md):
// what version it has, what the harness's engine has that it doesn't, and bringing that in on
// purpose. A harness engine change never reaches a game by itself, so 200 games never break at once.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { D, out, fail, gameArg, plural } from '../lib.mjs';
import { HARNESS, SKIP_DIRS, CODE, posix, gameEngineDir, harnessEngineVersion, engineStatus, copyEngine, changelogSince, gameImports, outsideImports } from '../../studio/data/engine-copy.mjs';

export const section = { title: 'Engine (each game keeps its own copy: games/<id>/engine/)', order: 45 };

const relGame = (pid, f) => posix(path.relative(path.join(D.ROOT, 'games', pid), f));

export const commands = {
  engine: {
    usage: 'engine [game]',
    help: 'the harness engine\'s version and which games are behind it; with a game: its copy\'s\nversion, what the harness has that it doesn\'t (and the changelog), and any local changes',
    async run({ pos }) {
      const hv = harnessEngineVersion();
      if (!pos[0]) {
        const ps = await D.listProjects();
        const rows = ps.map((p) => ({ p, s: engineStatus(p.id) }));
        const shared = rows.filter((r) => !r.s.own), behind = rows.filter((r) => r.s.own && String(r.s.version) !== String(hv));
        out(`harness engine v${hv} (engine/CHANGELOG.md) · ${plural(rows.length - shared.length, 'game')} with their own copy${behind.length ? ` · behind: ${behind.map((r) => `${r.p.id} (v${r.s.version})`).join(', ')}` : ''}${shared.length ? ` · on the shared engine: ${shared.map((r) => r.p.id).join(', ')} (engine-adopt <game>)` : ''}`);
        return;
      }
      const p = await gameArg(pos[0]);
      const s = engineStatus(p.id);
      if (!s.own) {
        out(`${p.id} uses the SHARED engine (the harness's engine/, v${hv}): any change there reaches it at once.`);
        out(`Give it its own copy: node cli/yak.mjs engine-adopt ${p.id} (copies engine/ in, rewrites its imports; then run its full checks).`);
        return;
      }
      out(`${p.id}: engine v${s.version}${s.copiedAt ? ` (copied ${s.copiedAt}${s.copiedFrom ? ` from harness ${s.copiedFrom}` : ''})` : ''} · harness v${hv}`);
      const pull = s.fresh.filter((n) => !s.local.includes(n));
      if (s.fresh.length) out(`harness has ${plural(s.fresh.length, 'changed file')}: ${s.fresh.join(', ')}`);
      else out('up to date with the harness engine');
      if (s.local.length) out(`changed in this game's copy (a pull leaves these alone without --force): ${s.local.join(', ')}`);
      if (s.both.length) out(`changed on both sides: ${s.both.join(', ')} — engine-diff ${p.id} <file>, then decide with the person`);
      for (const c of changelogSince(s.version)) out(`\n${c}`);
      if (pull.length) out(`\nBring it in: node cli/yak.mjs engine-pull ${p.id}   (then: node cli/yak.mjs test ${p.id} --full, and look)`);
    },
  },

  'engine-diff': {
    usage: 'engine-diff <game> [file]',
    help: 'how the game\'s engine copy differs from the harness\'s (a file list, or one file in full;\n`+` lines are the harness\'s)',
    async run({ pos }) {
      const p = await gameArg(pos[0]);
      const dir = gameEngineDir(p.id);
      if (!fs.existsSync(dir)) fail(`${p.id} has no engine copy of its own (engine-adopt ${p.id})`);
      const a = pos[1] ? path.join(dir, pos[1]) : dir, b = pos[1] ? path.join(HARNESS, pos[1]) : HARNESS;
      if (pos[1] && !D.inside(dir, a)) fail('the file must be inside engine/');
      const r = spawnSync('git', ['diff', '--no-index', '--no-color', ...(pos[1] ? [] : ['--stat']), '--', a, b], { encoding: 'utf8' });
      const text = (r.stdout || '').split(posix(dir)).join(`games/${p.id}/engine`).split(posix(HARNESS)).join('engine');
      out(text.trim() || 'no difference');
    },
  },

  'engine-pull': {
    usage: 'engine-pull <game> [--only a.js,b.js] [--force]',
    help: 'bring the harness engine\'s changes into the game\'s copy (skips files changed in the game\nunless --force), record the version in game.json, then run its full checks and look.\nBrief the person first when the changelog says Moves art / Changes sound',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const s = engineStatus(p.id);
      if (!s.own) fail(`${p.id} uses the shared engine — engine-adopt ${p.id} gives it its own copy first`);
      let names = s.fresh;
      if (typeof opt.only === 'string') { const want = opt.only.split(',').map((x) => x.trim()); names = names.filter((n) => want.includes(n) || want.some((w) => n.endsWith('/' + w))); }
      const blocked = opt.force ? [] : names.filter((n) => s.local.includes(n));
      names = names.filter((n) => !blocked.includes(n));
      if (!names.length) { out(blocked.length ? `nothing pulled: ${blocked.join(', ')} changed in the game's copy too (engine-diff, then --force if the person agrees)` : `${p.id}'s engine is up to date (v${s.version})`); return; }
      const before = s.version;
      const v = copyEngine(p.id, names);
      out(`${p.id}: engine v${before} → v${v} · ${plural(names.length, 'file')}: ${names.join(', ')}`);
      if (blocked.length) out(`left alone (changed in the game's copy): ${blocked.join(', ')}`);
      const notes = changelogSince(before);
      if (notes.some((n) => /Moves art|Changes sound/.test(n))) out('The changelog says this MOVES ART or CHANGES SOUND: look at `sheet` and the songs, and tell the person.');
      out(`Next: node cli/yak.mjs test ${p.id} --full, look at the screenshots, then commit games/${p.id}/engine + game.json in the game's repo ("engine v${v}").`);
    },
  },

  'engine-adopt': {
    usage: 'engine-adopt <game>',
    help: 'give a game on the shared engine its own copy: copies engine/ into games/<id>/engine/\nand rewrites its imports to it. Then run its full checks',
    async run({ pos }) {
      const p = await gameArg(pos[0]);
      if (engineStatus(p.id).own) fail(`${p.id} already has its own engine copy — engine ${p.id}`);
      const base = path.join(D.ROOT, 'games', p.id);
      const dir = gameEngineDir(p.id);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) fail(`games/${p.id}/engine/ exists but isn't an engine copy (no version.json) — move it first`);
      const imports = gameImports(p.id).filter((x) => D.inside(HARNESS, x.abs));
      const v = copyEngine(p.id);
      const byFile = new Map();
      for (const x of imports) { if (!byFile.has(x.file)) byFile.set(x.file, []); byFile.get(x.file).push(x); }
      for (const [file, xs] of byFile) {
        let text = fs.readFileSync(file, 'utf8');
        for (const x of xs) {
          const target = path.join(dir, path.relative(HARNESS, x.abs));
          let next = posix(path.relative(path.dirname(file), target));
          if (!next.startsWith('.')) next = './' + next;
          const tail = x.spec.slice(x.spec.split(/[?#]/)[0].length); // keep ?query / #hash
          text = text.split(`'${x.spec}'`).join(`'${next}${tail}'`).split(`"${x.spec}"`).join(`"${next}${tail}"`).split('`' + x.spec + '`').join('`' + next + tail + '`');
        }
        fs.writeFileSync(file, text);
      }
      out(`${p.id}: its own engine v${v} in games/${p.id}/engine/ · ${plural(imports.length, 'import')} rewritten in ${plural(byFile.size, 'file')}`);
      const left = outsideImports(p.id);
      if (left.length) {
        out('still reaching outside the game (fix by hand):');
        for (const x of left.slice(0, 20)) out(`  ${relGame(p.id, x.file)}:${x.line}  ${x.spec}  → ${x.where}`);
      }
      const mentions = [];
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && f !== dir) walk(f); } else if (CODE.test(e.name) && /\bHARNESS\b|harness'?s? engine/i.test(fs.readFileSync(f, 'utf8'))) mentions.push(relGame(p.id, f)); } };
      walk(base);
      if (mentions.length) out(`these mention the harness engine (build scripts?) — check them: ${mentions.join(', ')}`);
      out(`Next: node cli/yak.mjs test ${p.id} --full, look, then commit in the game's repo ("its own engine copy, v${v}").`);
    },
  },
};
