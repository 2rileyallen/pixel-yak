// cli/commands/tuning.mjs — F8 tuning: the choices the user kept while playing, waiting for the AI
// to build them into the code (docs/contracts/TUNING.md, skill explore).
import fs from 'node:fs';
import path from 'node:path';
import { D, out, fail, gameArg, ago, plural, rel } from '../lib.mjs';

export const section = { title: 'Tuning (F8: alternatives the user tried live and kept)', order: 35 };

export const commands = {
  tuning: {
    usage: 'tuning <game> [--done <slug> [what you did]] [--all]',
    help: 'kept F8 choices not built into the code yet, one line each;\n--done <slug> marks one built in (moves it to tuning/done/) · --all lists built-in ones too',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      if (typeof opt.done === 'string') {
        const to = await D.markTuningDone(p.id, opt.done, pos.slice(1).join(' ').trim());
        out(`${opt.done} is built in → ${to}`);
        return;
      }
      if (opt.done) fail('which one? tuning <game> --done <slug>');
      const kept = await D.listTuning(p.id);
      if (!kept.length) out(`No kept tuning choices waiting in games/${p.id}/tuning/.`);
      for (const r of kept) out(line(p.id, r));
      if (opt.all) {
        const done = await D.listTuning(p.id, { done: true });
        if (done.length) {
          out(`\nBuilt in already (games/${p.id}/tuning/done/):`);
          for (const r of done) out(`${line(p.id, r, false)}  · built in ${ago(r.doneAt || r.at)}`);
        }
      }
      if (kept.length) {
        out(`\n${plural(kept.length, 'choice')} to build in. For each: make the kept value the code's own — a knob becomes a`);
        out('plain constant; a variant keeps only the chosen branch (delete the losing options, their art or music) — and');
        out('remove the studio.knob / studio.variant call. Check the game, then mark it built in:');
        out(`  node cli/yak.mjs tuning ${p.id} --done <slug> "what you changed"`);
        out(`The lessons stay in games/${p.id}/design/lessons/tuning.jsonl.`);
      }
    },
  },
};

function line(gameId, r, where = true) {
  const what = r.kind === 'variant'
    ? `kept ${r.label}${r.options && r.options.length > 1 ? ` (over ${r.options.filter((o) => JSON.stringify(o) !== JSON.stringify(r.chosen)).join(', ')})` : ''}`
    : `kept ${r.label} (code ${r.default}${r.range && r.range.min !== null ? `, range ${r.range.min} to ${r.range.max}` : ''})`;
  const src = where ? findDeclaration(gameId, r.name) : null;
  return `${r.slug}  ${r.kind}  ${r.name}: ${what}${r.note ? `  “${r.note}”` : ''}  ${ago(r.at)}${src ? `  · ${src}` : ''}`;
}

// Where the game makes this knob: the first line with its name in quotes (game/, not lib/ or edits/).
function findDeclaration(gameId, name) {
  const base = path.join(D.ROOT, 'games', gameId, 'game');
  const quoted = [`'${name}'`, `"${name}"`, `\`${name}\``];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      if (e.name === 'lib' || e.name === 'edits' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { const hit = walk(f); if (hit) return hit; continue; }
      if (!/\.m?js$/.test(e.name)) continue;
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const i = lines.findIndex((l) => quoted.some((q) => l.includes(q)));
      if (i >= 0) return `${rel(f)}:${i + 1}`;
    }
    return null;
  };
  return walk(base);
}
