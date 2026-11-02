// studio/data/designs.mjs — the design library: designs/<shelf>/<id>/DESIGN.md (+ code twins like
// palette.js or instruments.js) for three shelves — art, sound, game. The user's private entries
// live in local/designs/<shelf>/<id>/ with the same shape. A game copies the entries it starts from
// into its own design/ folder and grows them (docs/contracts/DESIGN-FILES.md, skill design):
//   use      copy an entry into a game that has none of its own yet (never over the game's own copy)
//   promote  copy a game's design back into the library (or local/designs) as a new entry
//   diff     the game's copy against the entry it started from, for a deliberate pull
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIRS, assertId, isId, within, relRepo, exists, nowIso, readJson, markWrite, writeTextMarked, writeJsonMarked } from './core.mjs';
import { projectDir, listProjects } from './games.mjs';
import { readAllEdits } from './edits.mjs';

export const SHELVES = ['art', 'sound', 'game'];

// The code twins a shelf's entry usually brings besides DESIGN.md. An entry may hold more (every
// file in its folder is copied on use); promote looks for these names in a game's design/, plus
// whatever the entry the game started from brought.
export const TWINS = { art: ['palette.js', 'sample.js', 'fx.js', 'parts'], sound: ['instruments.js', 'example-song.js'], game: [] };

// Never copied back out of a game: its lessons, archived copies and the other shelves' files.
const GAME_ONLY = new Set(['lessons', 'archive', 'art.md', 'sound.md', 'game.md']);
const PICTURE = /\.(png|jpe?g|gif|webp)$/i;

// A DESIGN.md's title (first "# " line) and its first paragraph.
export function describeDesign(md) {
  const lines = String(md || '').split(/\r?\n/);
  const title = (lines.find((l) => /^#\s/.test(l)) || '').replace(/^#\s+/, '').trim();
  const body = [];
  let started = false;
  for (const l of lines) {
    if (/^#/.test(l) || /^>/.test(l)) { if (started) break; continue; }
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

// Which games started from which entry: { 'art/gba-bright': ['my-game', …], … } (game.json designs).
export async function designUsage() {
  const out = {};
  for (const p of await listProjects()) {
    for (const sh of SHELVES) if (p.designs[sh]) (out[`${sh}/${p.designs[sh]}`] ||= []).push(p.id);
  }
  return out;
}

// ------------------------------------------------------------ file helpers ---
async function listFiles(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const lf = (s) => String(s).replace(/\r\n?/g, '\n');
const COPY_NOTE = /^> This game's own copy, started from .*$/;
const FIRST_NOTES = /^## The user's first notes\b/;

// The section a new game's pitch was saved under (scaffold.mjs) — the user's words, never lost.
function splitFirstNotes(md) {
  const lines = lf(md).split('\n');
  const at = lines.findIndex((l) => FIRST_NOTES.test(l));
  if (at < 0) return { rest: lines.join('\n'), notes: '' };
  let end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { rest: [...lines.slice(0, at), ...lines.slice(end)].join('\n'), notes: lines.slice(at, end).join('\n').trim() };
}

// A design file without the note copyDesign puts under its title (and the blank line before it).
function withoutCopyNote(md) {
  const lines = lf(md).split('\n');
  const at = lines.findIndex((l) => COPY_NOTE.test(l));
  if (at >= 0) lines.splice(at > 0 && !lines[at - 1].trim() ? at - 1 : at, at > 0 && !lines[at - 1].trim() ? 2 : 1);
  return lines.join('\n');
}

// --------------------------------------------------------------- copy (use) ---
// Copy a library entry into the game's design/ folder: DESIGN.md becomes <shelf>.md, its code
// twins (palette.js, instruments.js, parts/ …) come along. Returns the files written.
export async function copyDesign(gameDir, shelf, id, date) {
  const hit = findDesign(shelf, id);
  if (!hit) throw new Error(`no design "${id}" on the ${shelf} shelf (designs/${shelf}/ or local/designs/${shelf}/)`);
  const written = [];
  for (const rel of await listFiles(hit.dir)) {
    if (PICTURE.test(rel)) continue; // pictures stay in the library
    const to = rel === 'DESIGN.md' ? `${shelf}.md` : rel;
    let data = await fs.readFile(path.join(hit.dir, rel));
    if (rel === 'DESIGN.md') {
      const lines = lf(data.toString('utf8')).split('\n');
      const at = Math.max(0, lines.findIndex((l) => /^#\s/.test(l)) + 1);
      lines.splice(at, 0, '', `> This game's own copy, started from \`designs/${shelf}/${id}\` (${hit.source}) on ${date}. It grows with the game; promote it back to the library when it's worth reusing (skill design).`);
      data = Buffer.from(lines.join('\n'), 'utf8');
    }
    const file = within(path.join(gameDir, 'design'), to);
    await fs.mkdir(path.dirname(file), { recursive: true });
    markWrite(file);
    await fs.writeFile(file, data);
    written.push(`design/${to}`);
  }
  return written;
}

// The template file a game was made with, filled in the way scaffold.mjs filled it (null if none).
async function templateCopy(game, rel) {
  const src = path.join(DIRS.templates, 'blank', rel);
  const text = await fs.readFile(src, 'utf8').catch(() => null);
  if (text == null) return null;
  const res = game.resolution || {};
  const clean = (s) => String(s || '').replace(/[<>&"`$\\]/g, '');
  const vars = {
    ID: game.id, NAME: clean(game.name) || String(game.id).toUpperCase(), W: String(res.width), H: String(res.height), SCALE: String(res.pixelScale),
    DATE: String(game.createdAt || '').slice(0, 10), GENRE: clean(game.genre) || '(undecided)', SIZE: game.size || 'toy',
  };
  return text.replace(/\{\{([A-Z]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// True when a game's design file is still the blank template's placeholder (nothing of its own).
async function isPlaceholder(game, gameDir, rel) {
  const file = path.join(gameDir, 'design', rel);
  if (!exists(file)) return true;
  const tpl = await templateCopy(game, `design/${rel}`);
  if (tpl == null) return false;
  const norm = (s) => lf(s).split('\n').map((l) => l.trimEnd()).join('\n').trim();
  return norm(splitFirstNotes(await fs.readFile(file, 'utf8')).rest) === norm(tpl);
}

// Material names a game relies on — in the user's pixel edits (legend refs) and in its code
// (M.NAME) — that a palette.js doesn't have. The user's edits store material names, so a missing
// one would silently lose their colour: worth a loud warning before anything ships.
export async function missingMaterials(gameId, paletteFile) {
  let M;
  try { M = (await import(`${pathToFileURL(paletteFile).href}?t=${Date.now()}`)).M; } catch (err) { return { error: `could not load ${relRepo(paletteFile)}: ${err.message}`, edits: [], code: [] }; }
  const have = new Set(Object.keys(M || {}));
  const edits = new Set(), code = new Set();
  for (const ed of Object.values(await readAllEdits(gameId).catch(() => ({})))) {
    for (const ref of Object.values((ed && ed.legend) || {})) if (Array.isArray(ref) && typeof ref[0] === 'string' && !have.has(ref[0])) edits.add(ref[0]);
  }
  const gdir = path.join(projectDir(gameId), 'game');
  for (const rel of (await listFiles(gdir)).filter((f) => /\.m?js$/.test(f) && !f.startsWith('art/edits/'))) {
    const src = await fs.readFile(path.join(gdir, rel), 'utf8').catch(() => '');
    for (const m of src.matchAll(/\bM\.([A-Z][A-Z0-9_]*)\b/g)) if (!have.has(m[1])) code.add(m[1]);
  }
  return { edits: [...edits].sort(), code: [...code].sort() };
}

// design-use: copy a library entry into a game. Refuses when the game already has its own copy
// for that shelf (it holds the game's own learned rules) unless force — then the old files move to
// design/archive/<shelf>-<date>/ first, so nothing is lost. The user's first notes carry over.
export async function useDesign(gameId, shelf, id, { force = false } = {}) {
  assertId('project', gameId);
  if (!SHELVES.includes(shelf)) throw new Error(`unknown shelf "${shelf}" (art, sound, game)`);
  assertId('design', id);
  const gameDir = projectDir(gameId);
  const gfile = path.join(gameDir, 'game.json');
  const game = await readJson(gfile);
  if (!game) throw new Error(`no game "${gameId}" (games/${gameId}/game.json)`);
  const hit = findDesign(shelf, id);
  if (!hit) throw new Error(`no design "${id}" on the ${shelf} shelf — node cli/yak.mjs designs ${shelf} lists them`);
  const targets = (await listFiles(hit.dir)).filter((r) => !PICTURE.test(r)).map((r) => (r === 'DESIGN.md' ? `${shelf}.md` : r));
  const own = [];
  for (const rel of targets) if (exists(path.join(gameDir, 'design', rel)) && !(await isPlaceholder(game, gameDir, rel))) own.push(rel);
  const started = game.designs && game.designs[shelf];
  if ((own.length || started) && !force) {
    const what = own.length ? own.map((r) => `design/${r}`).join(', ') : `design/${shelf}.md`;
    throw new Error(`games/${gameId} already has its own ${shelf} design (${what}${started ? `, started from designs/${shelf}/${started}` : ''}). It holds this game's own learned rules, so it isn't replaced.\n` +
      `  see what differs: node cli/yak.mjs design-diff ${gameId} ${shelf}${started === id ? '' : ` --from ${id}`}  (then bring over only what the user picks, by hand)\n` +
      `  replace it anyway (the user asked): add --force — the old files move to games/${gameId}/design/archive/`);
  }
  const date = nowIso().slice(0, 10);
  const mdFile = path.join(gameDir, 'design', `${shelf}.md`);
  const { notes } = exists(mdFile) ? splitFirstNotes(await fs.readFile(mdFile, 'utf8')) : { notes: '' };
  const archived = [];
  if (own.length) {
    const box = within(path.join(gameDir, 'design', 'archive'), `${shelf}-${nowIso().replace(/[:.]/g, '-').slice(0, 19)}`);
    for (const rel of own) {
      const to = within(box, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      markWrite(to);
      await fs.rename(path.join(gameDir, 'design', rel), to);
      archived.push(relRepo(to));
    }
  }
  const written = await copyDesign(gameDir, shelf, id, date);
  if (notes) await writeTextMarked(mdFile, `${lf(await fs.readFile(mdFile, 'utf8')).replace(/\s+$/, '')}\n\n${notes}\n`);
  game.designs = { ...(game.designs || {}), [shelf]: id };
  game.updatedAt = nowIso();
  await writeJsonMarked(gfile, game);
  const missing = shelf === 'art' && exists(path.join(gameDir, 'design', 'palette.js')) ? await missingMaterials(gameId, path.join(gameDir, 'design', 'palette.js')) : null;
  return { game: gameId, shelf, id, source: hit.source, written, archived, missing };
}

// ----------------------------------------------------------------- promote ---
// design-promote: a game's design/<shelf>.md (+ its code twins) becomes a new library entry —
// designs/<shelf>/<newId>/ (public: it ships with Pixel Yak) or local/designs/… (yours only).
export async function promoteDesign(gameId, shelf, newId, { local = false, title = '', files = [] } = {}) {
  assertId('project', gameId);
  if (!SHELVES.includes(shelf)) throw new Error(`unknown shelf "${shelf}" (art, sound, game)`);
  assertId('design', newId);
  const gameDir = projectDir(gameId);
  const game = await readJson(path.join(gameDir, 'game.json'));
  if (!game) throw new Error(`no game "${gameId}" (games/${gameId}/game.json)`);
  const mdFile = path.join(gameDir, 'design', `${shelf}.md`);
  if (!exists(mdFile)) throw new Error(`games/${gameId}/design/${shelf}.md doesn't exist — nothing to promote`);
  const taken = findDesign(shelf, newId);
  if (taken) throw new Error(`there is already ${shelf === 'art' ? 'an' : 'a'} ${shelf} design "${newId}" (${relRepo(taken.dir)}) — pick another id`);
  const dest = designDir(shelf, newId, local ? 'local' : 'library');
  // which twins: the shelf's usual ones, those of the entry it started from, and any asked for
  const want = new Set([...(TWINS[shelf] || []), ...files]);
  const from = game.designs && game.designs[shelf];
  const origin = from && findDesign(shelf, from);
  if (origin) for (const rel of await listFiles(origin.dir)) if (rel !== 'DESIGN.md') want.add(rel.split('/')[0]);
  const twins = [];
  for (const top of want) {
    if (!top || GAME_ONLY.has(top) || top.includes('..')) continue;
    const p = within(path.join(gameDir, 'design'), top);
    if (!exists(p)) continue;
    const st = await fs.stat(p);
    if (st.isDirectory()) twins.push(...(await listFiles(p)).map((r) => `${top}/${r}`));
    else twins.push(top);
  }
  // the design file: no copy note, no first notes (the user's pitch stays with the game), a title,
  // and a changelog line saying where it came from
  let md = splitFirstNotes(withoutCopyNote(await fs.readFile(mdFile, 'utf8'))).rest.replace(/\s+$/, '');
  const lines = md.split('\n');
  const ti = lines.findIndex((l) => /^#\s/.test(l));
  if (title) { if (ti >= 0) lines[ti] = `# ${title}`; else lines.unshift(`# ${title}`, ''); }
  const line = `- ${nowIso().slice(0, 10)} · Promoted from the game "${game.name || gameId}" (${gameId})${from ? `, which started from ${shelf}/${from}` : ''}.`;
  const ci = lines.findIndex((l) => /^##\s+Changelog\b/i.test(l));
  if (ci >= 0) {
    let at = ci + 1;
    while (at < lines.length && !lines[at].trim()) at++;
    lines.splice(at, 0, line);
  } else lines.push('', '## Changelog', line);
  md = lines.join('\n') + '\n';
  await fs.mkdir(dest, { recursive: true });
  await writeTextMarked(path.join(dest, 'DESIGN.md'), md);
  const written = [relRepo(path.join(dest, 'DESIGN.md'))];
  for (const rel of twins) {
    const to = within(dest, rel);
    await fs.mkdir(path.dirname(to), { recursive: true });
    markWrite(to);
    await fs.copyFile(path.join(gameDir, 'design', rel), to);
    written.push(relRepo(to));
  }
  return { shelf, id: newId, source: local ? 'local' : 'library', dir: relRepo(dest), written };
}

// -------------------------------------------------------------------- diff ---
// A unified line diff of two texts (an LCS walk — design files are small), '' when equal.
export function lineDiff(a, b, { aName = 'a', bName = 'b', context = 3 } = {}) {
  const A = lf(a).split('\n'), B = lf(b).split('\n');
  const n = A.length, m = B.length, W = m + 1;
  const L = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const ops = []; // [' ' | '-' | '+', text, line in A, line in B]
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) ops.push([' ', A[i++], i - 1, j++]);
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) ops.push(['-', A[i++], i - 1, j]);
    else ops.push(['+', B[j++], i, j - 1]);
  }
  while (i < n) ops.push(['-', A[i++], i - 1, j]);
  while (j < m) ops.push(['+', B[j++], i, j - 1]);
  const out = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k][0] === ' ') { k++; continue; }
    let last = k;
    for (let q = k; q < ops.length; q++) { if (ops[q][0] !== ' ') last = q; else if (q - last > 2 * context) break; }
    const h = ops.slice(Math.max(0, k - context), Math.min(ops.length, last + context + 1));
    const aLen = h.filter((o) => o[0] !== '+').length, bLen = h.filter((o) => o[0] !== '-').length;
    out.push(`@@ -${h[0][2] + 1},${aLen} +${h[0][3] + 1},${bLen} @@`);
    for (const o of h) out.push(o[0] + o[1]);
    k = Math.min(ops.length, last + context + 1);
  }
  return out.length ? [`--- ${aName}`, `+++ ${bName}`, ...out].join('\n') : '';
}

// design-diff: the game's copy (−) against a library entry (+): '+' lines are what the library has
// that the game doesn't (what a pull could bring in); '−' lines are the game's own — keep them.
export async function diffDesign(gameId, shelf, { from = null } = {}) {
  assertId('project', gameId);
  if (!SHELVES.includes(shelf)) throw new Error(`unknown shelf "${shelf}" (art, sound, game)`);
  const gameDir = projectDir(gameId);
  const game = await readJson(path.join(gameDir, 'game.json'));
  if (!game) throw new Error(`no game "${gameId}" (games/${gameId}/game.json)`);
  const id = from || (game.designs && game.designs[shelf]);
  if (!id) throw new Error(`games/${gameId} didn't start from a ${shelf} design — name one to compare with: --from <id>`);
  const hit = findDesign(shelf, assertId('design', id));
  if (!hit) throw new Error(`no design "${id}" on the ${shelf} shelf`);
  const files = [];
  const libFiles = (await listFiles(hit.dir)).filter((r) => !PICTURE.test(r));
  for (const rel of libFiles) {
    const mine = rel === 'DESIGN.md' ? `${shelf}.md` : rel;
    const gp = path.join(gameDir, 'design', mine);
    const lib = await fs.readFile(path.join(hit.dir, rel), 'utf8');
    if (!exists(gp)) { files.push({ file: mine, status: 'only-library', diff: '' }); continue; }
    let ours = await fs.readFile(gp, 'utf8');
    if (rel === 'DESIGN.md') ours = splitFirstNotes(withoutCopyNote(ours)).rest;
    const diff = lineDiff(ours.replace(/\s+$/, '') + '\n', lf(lib).replace(/\s+$/, '') + '\n', { aName: `games/${gameId}/design/${mine} (this game's copy)`, bName: `${relRepo(hit.dir)}/${rel} (the library)` });
    files.push({ file: mine, status: diff ? 'changed' : 'same', diff });
  }
  return { game: gameId, shelf, id, source: hit.source, path: relRepo(hit.dir), files };
}
