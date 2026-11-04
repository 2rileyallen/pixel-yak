// studio/data/summary.mjs — one small record per game for the studio's Games view and badges, so the
// games that aren't open cost a folder listing and a few cached reads — never their tickets, edits or
// lessons in full. The open game loads everything itself, when it's opened.
import path from 'node:path';
import { DIRS, readJson } from './core.mjs';
import { listProjects } from './games.mjs';
import { requestCounts } from './requests.mjs';
import { countEdits } from './edits.mjs';

// → { games: { id: { requests, edits, engine } }, studio: requests counts }
export async function gameSummaries() {
  const ps = await listProjects({ broken: true });
  const counts = await requestCounts([...ps.map((p) => p.id), '_studio']);
  const games = {};
  for (const p of ps) {
    const v = await readJson(path.join(DIRS.games, p.id, 'engine', 'version.json'));
    games[p.id] = { requests: counts[p.id], edits: await countEdits(p.id).catch(() => 0), engine: v ? v.version : null };
  }
  const harness = await readJson(path.join(DIRS.engine, 'version.json'));
  return { games, studio: counts._studio, engine: harness ? harness.version : null };
}
