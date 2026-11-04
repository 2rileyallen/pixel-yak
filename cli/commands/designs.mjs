// cli/commands/designs.mjs — the design library (designs/ + local/designs/): art, sound and game
// design files a game starts from, plus the systems shelf (game code a game copies in), and how a
// game's own copy goes back and forth (skill design).
import { D, out, fail } from '../lib.mjs';

export const section = { title: 'Design library (art, sound and game design files; systems: game code to copy in)', order: 50 };

const shelfArg = (s) => { if (!D.SHELVES.includes(s)) fail('shelves: art, sound, game, systems'); return s; };

export const commands = {
  designs: {
    usage: 'designs [art|sound|game|systems]',
    help: 'every design file in the library (and yours in local/designs/), with the games that use each',
    async run({ pos }) {
      const shelf = pos[0] ? shelfArg(pos[0]) : null;
      const [list, usage] = await Promise.all([D.listDesigns({ shelf }), D.designUsage()]);
      if (!list.length) { out('The library is empty.'); return; }
      let last = null;
      for (const d of list) {
        if (d.shelf !== last) { out(`\n## ${d.shelf}`); last = d.shelf; }
        const used = usage[`${d.shelf}/${d.id}`];
        out(`- ${d.id}${d.source === 'local' ? ' (yours)' : ''} — ${d.title}${d.summary ? ': ' + d.summary.slice(0, 140) + (d.summary.length > 140 ? '…' : '') : ''}${used ? ` [used by ${used.join(', ')}]` : ''}`);
      }
      out('\nRead one: node cli/yak.mjs design <shelf> <id>');
    },
  },
  design: {
    usage: 'design <shelf> <id>',
    help: 'one design file in full, plus the files that come with it',
    async run({ pos }) {
      const d = await D.readDesign(shelfArg(pos[0]), pos[1]);
      out(`# ${d.path}/DESIGN.md (${d.source}) · files: ${d.files.join(', ')}\n`);
      out(d.md);
    },
  },
  'design-use': {
    usage: 'design-use <game> <shelf> <id> [--force]',
    help: "copy a library entry into a game that has none of its own yet (design/<shelf>.md + its code\ntwins; a system's code goes to game/systems/<id>/, its page to design/systems/). Refuses to replace a game's own copy — it holds the game's learned rules; --force\n(only when the user asks) moves the old files to design/archive/ first",
    async run({ pos, opt }) {
      const [game, shelf, id] = pos;
      if (!game || !shelf || !id) fail('usage: design-use <game> <shelf> <id> [--force]');
      let r;
      try { r = await D.useDesign(game, shelfArg(shelf), id, { force: !!opt.force }); } catch (err) { fail(err.message); }
      out(`games/${game} now starts its ${shelf} design from ${shelf}/${id} (${r.source}):`);
      for (const f of r.written) out(`  wrote games/${game}/${f}`);
      for (const f of r.archived) out(`  kept the old copy at ${f}`);
      const m = r.missing;
      if (m && m.error) out(`WARN ${m.error}`);
      if (m && m.edits.length) out(`WARN the user's pixel edits use materials this palette lacks: ${m.edits.join(', ')} — add them to design/palette.js (same names) before anything else, or those pixels lose their colour`);
      if (m && m.code.length) out(`WARN the game's code paints materials this palette lacks: ${m.code.join(', ')} — add them or update the generators`);
      out(r.next ? `Next: ${r.next}.` : `Next: node cli/yak.mjs check ${game}, and look at it (node cli/yak.mjs sheet ${game}).`);
    },
  },
  'design-promote': {
    usage: 'design-promote <game> <shelf> <newId> [--library] [--title ".."] [--files a,b] [--system <id>]',
    help: "copy a game's design/<shelf>.md (+ its code twins) into the library as a new entry, with a\nchangelog line saying where it came from. It goes into local/designs/ (the person's own: updating\nPixel Yak never touches it). --library puts it in designs/, the public library that ships with\nPixel Yak, only when the person says it's for everyone. systems: the game's system --system <id>\n(default newId): its page, code and tests",
    async run({ pos, opt }) {
      const [game, shelf, newId] = pos;
      if (!game || !shelf || !newId) fail('usage: design-promote <game> <shelf> <newId> [--library] [--title ".."] [--system <id>]');
      const files = typeof opt.files === 'string' ? opt.files.split(',').map((s) => s.trim()).filter(Boolean) : [];
      let r;
      try { r = await D.promoteDesign(game, shelfArg(shelf), newId, { local: !opt.library, title: typeof opt.title === 'string' ? opt.title : '', files, system: typeof opt.system === 'string' ? opt.system : '' }); } catch (err) { fail(err.message); }
      out(`New ${shelf} design "${newId}" in ${r.dir}/ (${r.source === 'local' ? 'yours only' : 'the public library'}):`);
      for (const f of r.written) out(`  wrote ${f}`);
      for (const l of r.leaks || []) out(`WARN ${l} — outside the entry: make it general (pass it in, or include it) before another game uses it`);
      out(`Now read ${r.dir}/DESIGN.md through as a library entry: make the title and first paragraph describe the look/kind generally, and say how to ask for things in it.`);
      if (r.source === 'library') out(`designs/ ships publicly with Pixel Yak: take out this game's names, story, characters and anything private before it's committed — or promote it again without --library to keep it the person's own (local/designs/).`);
    },
  },
  'design-diff': {
    usage: 'design-diff <game> <shelf> [--from <id>] [--file name]',
    help: "a game's copy against the library entry it started from (or --from another): '+' lines are\nwhat the library has that the game doesn't (what a pull could bring in, by hand, only what the\nuser picks); '-' lines are the game's own — keep them",
    async run({ pos, opt }) {
      const [game, shelf] = pos;
      if (!game || !shelf) fail('usage: design-diff <game> <shelf> [--from <id>]');
      let r;
      try { r = await D.diffDesign(game, shelfArg(shelf), { from: typeof opt.from === 'string' ? opt.from : null }); } catch (err) { fail(err.message); }
      out(`# games/${game} ${shelf} design vs ${r.path}/ (${r.source})`);
      const files = typeof opt.file === 'string' ? r.files.filter((f) => f.file === opt.file) : r.files;
      for (const f of files) {
        if (f.status === 'same') out(`\n= ${f.file}: the same as the library`);
        else if (f.status === 'only-library') out(`\n+ ${f.file}: only in the library (a pull would add the whole file)`);
        else out(`\n~ ${f.file}:\n${f.diff}`);
      }
      out('\nA pull is deliberate: bring over only the pieces the user picks, by hand, and say which in the game\'s CHANGELOG.md. The user\'s edits and the game\'s own rules stay.');
    },
  },
};
