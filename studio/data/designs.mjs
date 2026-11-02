// studio/data/designs.mjs — the design library: designs/<shelf>/<id>/DESIGN.md (+ code twins like
// palette.js or instruments.js) for three shelves — art, sound, game. The user's private entries
// live in local/designs/<shelf>/<id>/ with the same shape. A game copies the entries it starts from
// into its own design/ folder and grows them (docs/contracts/DESIGN-FILES.md, skill design).
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, assertId, isId, within, relRepo, exists } from './core.mjs';

export const SHELVES = ['art', 'sound', 'game'];

// A DESIGN.md's title (first "# " line) and its first paragraph.
export function describeDesign(md) {
  const lines = String(md || '').split(/\r?\n/);
  const title = (lines.find((l) => /^#\s/.test(l)) || '').replace(/^#\s+/, '').trim();
  const body = [];
  let started = false;
  for (const l of lines) {
    if (/^#/.test(l)) { if (started) break; continue; }
    if (!l.trim()) { if (started) break; continue; }
    started = true;
    body.push(l.trim());
  }
  return { title, summary: body.join(' ').slice(0, 400) };
}

const sources = () => [['library', DIRS.designs], ['local', DIRS.localDesigns]];

export async function listDesigns({ shelf = null } = {}) {
  const out = [];
  for (const [source, base] of sources()) {
    for (const sh of shelf ? [shelf] : SHELVES) {
      let dirs = [];
      try { dirs = await fs.readdir(path.join(base, sh), { withFileTypes: true }); } catch { continue; }
      for (const d of dirs) {
        if (!d.isDirectory() || !isId('design', d.name)) continue;
        const dir = path.join(base, sh, d.name);
        const md = await fs.readFile(path.join(dir, 'DESIGN.md'), 'utf8').catch(() => null);
        if (md == null) continue;
        const files = (await fs.readdir(dir).catch(() => [])).filter((f) => !f.startsWith('.'));
        out.push({ shelf: sh, id: d.name, source, ...describeDesign(md), path: relRepo(dir), files });
      }
    }
  }
  return out.sort((a, b) => SHELVES.indexOf(a.shelf) - SHELVES.indexOf(b.shelf) || a.id.localeCompare(b.id));
}

export function designDir(shelf, id, source = 'library') {
  if (!SHELVES.includes(shelf)) throw new Error(`unknown shelf "${shelf}" (art, sound, game)`);
  const base = source === 'local' ? DIRS.localDesigns : DIRS.designs;
  return within(path.join(base, shelf), assertId('design', id));
}

// Finds an entry in the library first, then in local/.
export function findDesign(shelf, id) {
  for (const source of ['library', 'local']) {
    const dir = designDir(shelf, id, source);
    if (exists(path.join(dir, 'DESIGN.md'))) return { dir, source };
  }
  return null;
}

export async function readDesign(shelf, id) {
  const hit = findDesign(shelf, id);
  if (!hit) throw new Error(`no design "${id}" on the ${shelf} shelf`);
  const md = await fs.readFile(path.join(hit.dir, 'DESIGN.md'), 'utf8');
  const files = (await fs.readdir(hit.dir)).filter((f) => !f.startsWith('.'));
  return { shelf, id, source: hit.source, ...describeDesign(md), md, path: relRepo(hit.dir), files };
}
