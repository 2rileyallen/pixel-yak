// cli/commands/designs.mjs — the design library (designs/ + local/designs/): art, sound and game
// design files a game starts from (skill design).
import { D, out, fail } from '../lib.mjs';

export const section = { title: 'Design library (art, sound and game design files)', order: 50 };

export const commands = {
  designs: {
    usage: 'designs [art|sound|game]',
    help: 'every design file in the library (and yours in local/designs/)',
    async run({ pos }) {
      const shelf = pos[0] || null;
      if (shelf && !D.SHELVES.includes(shelf)) fail('shelves: art, sound, game');
      const list = await D.listDesigns({ shelf });
      if (!list.length) { out('The library is empty.'); return; }
      let last = null;
      for (const d of list) {
        if (d.shelf !== last) { out(`\n## ${d.shelf}`); last = d.shelf; }
        out(`- ${d.id}${d.source === 'local' ? ' (yours)' : ''} — ${d.title}${d.summary ? ': ' + d.summary.slice(0, 140) + (d.summary.length > 140 ? '…' : '') : ''}`);
      }
      out('\nRead one: node cli/yak.mjs design <shelf> <id>');
    },
  },
  design: {
    usage: 'design <art|sound|game> <id>',
    help: 'one design file in full, plus the files that come with it',
    async run({ pos }) {
      const d = await D.readDesign(pos[0], pos[1]);
      out(`# ${d.path}/DESIGN.md (${d.source}) · files: ${d.files.join(', ')}\n`);
      out(d.md);
    },
  },
};
