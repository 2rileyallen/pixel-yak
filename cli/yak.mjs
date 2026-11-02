#!/usr/bin/env node
// cli/yak.mjs — Pixel Yak from the command line. This is how an AI (any harness) works with the
// user through the studio: the desktop app sees every change within a second.
// Run with no arguments for help. Each command lives in cli/commands/<group>.mjs, which exports
//   export const section = { title: 'Requests', order: 10 };
//   export const commands = { inbox: { usage: 'inbox [game] …', help: 'one line …', run: async ({ pos, opt, cmd }) => {} } };
// A new command group is a new file there — nothing else to register.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { out, fail } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[k] = true; else { opt[k] = next; i++; }
    } else pos.push(a);
  }
  return { cmd: argv[0], pos, opt };
}

async function loadGroups() {
  const dir = path.join(HERE, 'commands');
  const groups = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
    const m = await import(pathToFileURL(path.join(dir, f)).href);
    groups.push({ file: f, section: m.section || { title: f, order: 99 }, commands: m.commands || {} });
  }
  return groups.sort((a, b) => (a.section.order ?? 99) - (b.section.order ?? 99));
}

function help(groups) {
  const lines = ['Pixel Yak CLI — node cli/yak.mjs <command> …', ''];
  for (const g of groups) {
    lines.push(g.section.title);
    for (const c of Object.values(g.commands)) {
      if (c.hidden) continue;
      const usage = `  ${c.usage}`;
      const text = (c.help || '').split('\n');
      if (usage.length < 40) lines.push(usage.padEnd(41) + text[0]);
      else { lines.push(usage); lines.push(' '.repeat(41) + text[0]); }
      for (const t of text.slice(1)) lines.push(' '.repeat(41) + t);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const args = parse(process.argv.slice(2));
  const groups = await loadGroups();
  if (!args.cmd || ['help', '--help', '-h'].includes(args.cmd)) { out(help(groups)); return; }
  for (const g of groups) {
    const c = g.commands[args.cmd];
    if (c) { await c.run(args); return; }
  }
  fail(`unknown command "${args.cmd}" — run without arguments for help`);
}

main().catch((err) => fail(err.message));
