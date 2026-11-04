// studio/data/formats.mjs — which file formats a game's own engine copy reads, so the studio and the
// CLI write each game only what it can read (engine/README.md → Formats). The studio's code is the
// harness's and may be newer than a game's copy; a game that shipped on an older engine must still
// read every file the studio writes into it. The copy is read as text, never run: game code doesn't
// run in the studio's main process.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, exists } from './core.mjs';

const KINDS = {
  edits: { file: ['art', 'edits.js'], one: 'EDITS_FORMAT', all: 'EDITS_FORMATS', what: 'pixel edits' },
  sound: { file: ['sound', 'edits.js'], one: 'SOUND_EDIT_FORMAT', all: 'SOUND_EDIT_FORMATS', what: 'sound edits' },
};
const quoted = (s) => [...s.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)].map((m) => m[1] ?? m[2]);

// The formats of `kind` ('edits' | 'sound') that a game's engine copy reads: a list (empty when the
// copy has no such module), or null when the game has no copy of its own (it runs on the harness's
// engine, so it reads what the harness reads). An older copy without the list reads its one format.
export async function gameReads(projectId, kind) {
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown format kind "${kind}"`);
  const dir = path.join(DIRS.games, projectId, 'engine');
  if (!exists(path.join(dir, 'version.json'))) return null;
  let text;
  try { text = await fs.readFile(path.join(dir, ...k.file), 'utf8'); } catch { return []; }
  const all = new RegExp(`export\\s+const\\s+${k.all}\\s*=([^;]*);`).exec(text);
  if (all) return quoted(all[1]);
  const one = new RegExp(`export\\s+const\\s+${k.one}\\s*=\\s*(['"])([^'"\\n]+)\\1`).exec(text);
  return one ? [one[2]] : [];
}

// The format to stamp on a file the studio writes into a game: the harness's own, when the game's
// engine reads it. Otherwise nothing is written and the error says what to do — a game is never
// given a file it would quietly ignore.
export async function formatFor(projectId, kind, harnessFormat) {
  const reads = await gameReads(projectId, kind);
  if (reads === null || reads.includes(harnessFormat)) return harnessFormat;
  const e = new Error(`Not saved: ${projectId}'s own engine reads ${KINDS[kind].what} as ${reads.join(', ') || '(nothing)'}, and this Pixel Yak writes ${harnessFormat}. `
    + `Bring the game's engine up to date first (node cli/yak.mjs engine ${projectId}, then engine-pull ${projectId} and its full checks).`);
  e.format = { game: reads, harness: harnessFormat };
  throw e;
}
