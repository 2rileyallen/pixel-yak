// cli/commands/decisions.mjs — look decisions up in a game's register (DECISIONS.md) instead of
// reading it through: by number, by system, or by a word. Reads both shapes a register comes in:
// a table (| # | Decision | System | Status | Date |) and numbered bullets (- **#12 Title** ✅ — …).
import fs from 'node:fs';
import path from 'node:path';
import { D, out, fail, gameArg, plural } from '../lib.mjs';

export const section = { title: 'Decisions (a game\'s register, looked up — never read through)', order: 42 };

const STATUS = { '✅': 'decided', '❓': 'open', '⏸': 'parked', '❌': 'removed' };

// → [{ n, text, system, status, date }]
export function parseDecisions(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cols = null, cur = null;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  for (const l of lines) {
    if (/^\|/.test(l.trim())) {
      cur = null;
      const c = cells(l);
      if (c[0] === '#') { cols = c.map((h) => h.toLowerCase()); continue; }
      if (!cols || !/^\d+$/.test(c[0])) continue;
      const get = (name) => { const i = cols.findIndex((h) => h.startsWith(name)); return i >= 0 ? c[i] || '' : ''; };
      out.push({ n: Number(c[0]), text: get('decision'), system: get('system'), status: get('status'), date: get('date') });
      continue;
    }
    const m = /^- \*\*#(\d+)\b\s*([^*]*)\*\*\s*(.*)$/.exec(l);
    if (m) {
      cur = { n: Number(m[1]), text: `${m[2].trim()} ${m[3]}`.trim(), system: '' /* bullet registers have no System column */, status: (Object.keys(STATUS).find((s) => m[3].includes(s)) || ''), date: (/\b(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})\b/.exec(m[3]) || [''])[0] };
      out.push(cur);
      continue;
    }
    if (cur && /^\s{2,}\S/.test(l)) { cur.text += ' ' + l.trim(); continue; }
    cur = null;
  }
  return out;
}

const line = (d, width = 160) => {
  const t = `#${d.n} ${d.status}${d.system ? ` [${d.system}]` : ''}${d.date ? ` ${d.date}` : ''} — ${d.text.replace(/\s+/g, ' ')}`;
  return t.length > width ? t.slice(0, width - 1) + '…' : t;
};

export const commands = {
  decisions: {
    usage: 'decisions <game> [#n[,#m]|<system>|<word>] [--full]',
    help: 'look decisions up in games/<game>/DECISIONS.md: #12 (or 12) one in full · a system id (its\nSystem column) · any word. No filter: counts by status and system, and the newest few.\n--full prints whole entries instead of one line each',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const file = path.join(D.ROOT, 'games', p.id, 'DECISIONS.md');
      if (!fs.existsSync(file)) fail(`games/${p.id}/DECISIONS.md doesn't exist`);
      const all = parseDecisions(fs.readFileSync(file, 'utf8'));
      if (!all.length) { out(`games/${p.id}/DECISIONS.md has no numbered decisions yet.`); return; }
      const q = pos.slice(1).join(' ').trim();
      if (!q) {
        const count = (key) => Object.entries(all.reduce((m, d) => ((m[d[key] || '—'] = (m[d[key] || '—'] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(' · ');
        out(`${p.id}: ${plural(all.length, 'decision')} · ${count('status')}`);
        if (all.some((d) => d.system)) out(`by system: ${count('system')}`);
        out('newest:');
        for (const d of [...all].sort((a, b) => b.n - a.n).slice(0, 5)) out(`  ${line(d)}`);
        out(`\nLook one up: node cli/yak.mjs decisions ${p.id} #<n> | <system> | <word>`);
        return;
      }
      const nums = q.split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter((x) => /^\d+$/.test(x)).map(Number);
      const hits = nums.length && nums.length === q.split(/[\s,]+/).length
        ? all.filter((d) => nums.includes(d.n))
        : all.filter((d) => d.system.toLowerCase() === q.toLowerCase() || d.text.toLowerCase().includes(q.toLowerCase()));
      if (!hits.length) { out(`no decision matches "${q}"`); return; }
      const full = opt.full || nums.length;
      for (const d of hits) out(full ? `${line(d, Infinity)}\n` : line(d));
      if (!full) out(`\n${plural(hits.length, 'decision')} · one in full: decisions ${p.id} #<n>`);
    },
  },
};
