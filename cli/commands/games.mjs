// cli/commands/games.mjs — games, ideas, a new game, and the structural + art check.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { D, out, fail, runTool, gameArg, plural } from '../lib.mjs';

export const section = { title: 'Games & ideas', order: 40 };

export const commands = {
  games: {
    usage: 'games',
    help: 'every game: stage, size, status, open requests, whether it is its own repo',
    async run() {
      const ps = await D.listProjects();
      if (!ps.length) { out('No games yet. Make one: node cli/yak.mjs new-game <id> --name "Name"'); return; }
      for (const p of ps) {
        const reqs = await D.listRequests(p.id);
        const open = reqs.filter((r) => r.status === 'open' || r.status === 'in-progress').length;
        const st = p.stage ? D.STAGES[p.stage].name : 'stage ?';
        out(`- ${p.id} — ${p.name} [${p.status}] · ${st} · ${p.size} · ${plural(open, 'open request')}${p.isRepo ? ' · own git repo' : ''}`);
        out(`  game ${p.gamePath}${p.hasGame ? '' : ' (missing)'} · art ${p.assetsPath}${p.hasAssets ? '' : ' (missing)'} · edits ${p.editsDir} · designs ${Object.entries(p.designs).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(' ') || '-'}`);
      }
    },
  },

  ideas: {
    usage: 'ideas',
    help: 'the user\'s ideas backlog (local/ideas/)',
    async run() {
      const ideas = await D.listIdeas();
      if (!ideas.length) { out('No ideas yet (local/ideas/).'); return; }
      for (const i of ideas) out(`- ${i.id} [${i.status}${i.project ? ' → ' + i.project : ''}] ${i.title}${i.genre ? ` · ${i.genre}` : ''}${i.source ? ` · ${i.source}` : ''}`);
      out('\nRead one: local/ideas/<id>.md');
    },
  },

  'new-game': {
    usage: 'new-game <id> --name ".." [--genre ..] [--size toy|demo|big] [--art <design>] [--sound <design>] [--game <design>] [--res 320x180x3] [--pitch ..] [--idea slug]',
    help: 'a new game from templates/blank, starting from the named design files\n(node cli/yak.mjs designs lists them); files a kickoff request',
    async run({ pos, opt }) {
      const id = pos[0];
      if (!id || !opt.name) fail('usage: new-game <id> --name "Name" [--art gba-bright] [--game basics] …');
      const [w, h, s] = String(opt.res || '320x180x3').split('x').map(Number);
      const designs = { art: opt.art || null, sound: opt.sound || null, game: opt.game || null };
      const r = await D.createProject({ id, name: opt.name, genre: opt.genre || '', size: opt.size || 'toy', designs, resolution: { width: w, height: h, pixelScale: s }, pitch: typeof opt.pitch === 'string' ? opt.pitch : '', idea: opt.idea || null });
      out(`created games/${id}/ — kickoff request ${r.kickoff.id}. It shows up in Pixel Yak now.`);
    },
  },

  check: {
    usage: 'check <game>',
    help: 'structure (game.json, assets.js, edits, docs), the art loaded headless (every\nid/pose renders at its declared size, anims name real poses), the linter',
    async run({ pos }) {
      const p0 = await gameArg(pos[0]);
      const pid = p0.id;
      const t0 = Date.now();
      let errors = 0;
      const res = await D.checkProject(pid);
      errors += res.filter((l) => l.startsWith('ERROR')).length;
      out(`# check ${pid}`);
      out(res.length ? `structure:\n${res.map((l) => '  ' + l).join('\n')}` : 'structure: ok');
      const p = await D.getProject(pid);
      const ta = Date.now();
      if (p && p.hasAssets) {
        const { data: d } = runTool({ entry: p.assetsPath, edits: p.editsDir, project: pid }, `check-${pid}`, { page: 'studio/ui/check.html', waitMs: 120000, full: false });
        if (d.error) { errors++; out(`art: ERROR ${p.assetsPath} failed to load:\n  ${d.error.split('\n').slice(0, 6).join('\n  ')}`); }
        else {
          const errs = d.problems.filter((x) => x.level === 'ERROR');
          errors += errs.length;
          out(`art: ${d.assets} assets · ${d.poses} poses${errs.length ? '' : ' — every one renders at its declared size'} · load ${d.loadMs} ms, render ${d.renderMs} ms${d.slowest.length ? ` (slowest: ${d.slowest.map((s) => `${s.id} ${s.ms} ms`).join(', ')})` : ''}`);
          const groups = new Map();
          for (const x of d.problems) {
            const k = `${x.level}|${x.asset || ''}|${x.msg}`;
            if (!groups.has(k)) groups.set(k, { ...x, poses: [] });
            if (x.pose) groups.get(k).poses.push(x.pose);
          }
          const lines = [...groups.values()].map((x) => `  ${x.level.padEnd(5)} ${x.asset ? x.asset + (x.poses.length === 1 ? ':' + x.poses[0] : x.poses.length ? ` (${x.poses.length} poses: ${x.poses.slice(0, 4).join(', ')}${x.poses.length > 4 ? ', …' : ''})` : '') + ' ' : ''}${x.msg}`);
          for (const l of lines.slice(0, 30)) out(l);
          if (lines.length > 30) out(`  … ${lines.length - 30} more`);
        }
      }
      const artMs = Date.now() - ta;
      const tl = Date.now();
      const { lintProject } = createRequire(import.meta.url)('../../tools/check-pixel-guardrails.cjs');
      const lint = lintProject(pid);
      errors += lint.errors;
      out(`lint: ${lint.files} game files · ${plural(lint.errors, 'error')} · ${plural(lint.warnings, 'warning')}${lint.findings.length ? ' (fix hints: node tools/check-pixel-guardrails.cjs ' + pid + ')' : ''}`);
      for (const f of lint.findings.slice(0, 40)) out(`  ${f.severity.padEnd(5)} ${f.rule} ${f.file}${f.line ? ':' + f.line : ''}  ${f.code}`);
      const lintMs = Date.now() - tl;
      out(`\n${errors ? plural(errors, 'error') : 'all checks pass'} · took ${((Date.now() - t0) / 1000).toFixed(1)} s (art ${(artMs / 1000).toFixed(1)} s incl. the headless browser, lint ${lintMs} ms)`);
      const tests = fs.existsSync(path.join(D.ROOT, 'games', pid, 'dev', 'tests'));
      out(`also: ${tests ? `node tools/run-captures.mjs ${pid} (its capture tests) · ` : ''}look at it: node cli/yak.mjs sheet ${pid}`);
      if (errors) process.exitCode = 1;
    },
  },
};
commands['new-project'] = { ...commands['new-game'], hidden: true };
