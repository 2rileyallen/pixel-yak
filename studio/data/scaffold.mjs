// studio/data/scaffold.mjs — a new game: copies templates/<template>/ into games/<id>/, fills in its
// name and size, copies the design files it starts from (one per shelf, from the library or
// local/designs) into its design/ folder, and files a kickoff request for the AI (skill new-game).
// Also: checkProject, the quick structural check behind `yak check`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, ROOT, EDITS, assertId, isId, within, str, nowIso, readJson, writeTextMarked, exists } from './core.mjs';
import { normalizeProject, getProject, SIZES } from './games.mjs';
import { readAllEdits } from './edits.mjs';
import { createRequest } from './requests.mjs';
import { copyDesign } from './designs.mjs';

const TEXT = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.txt']);

async function listFiles(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p));
  }
  return out;
}

const fill = (text, vars) => text.replace(/\{\{([A-Z]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

// opts: { id, name, genre, size, pitch, idea, resolution {width,height,pixelScale},
//         designs: { art, sound, game } (library ids), template: 'blank' }
export async function createProject(opts) {
  const id = assertId('project', opts.id);
  const dir = path.join(DIRS.games, id);
  if (exists(dir)) throw new Error(`games/${id} already exists`);
  const template = isId('design', opts.template || 'blank') ? (opts.template || 'blank') : 'blank';
  const tdir = within(DIRS.templates, template);
  if (!exists(path.join(tdir, 'game.json'))) throw new Error(`no template "${template}" in templates/`);
  const res = opts.resolution || {};
  const W = Math.max(64, Math.min(1920, Number(res.width) || 320));
  const H = Math.max(64, Math.min(1080, Number(res.height) || 180));
  const scale = Math.max(1, Math.min(8, Number(res.pixelScale) || 3));
  const name = str(opts.name, 120) || id.toUpperCase();
  const t = nowIso();
  const vars = {
    ID: id, NAME: name.replace(/[<>&"`$\\]/g, ''), W: String(W), H: String(H), SCALE: String(scale), DATE: t.slice(0, 10),
    GENRE: str(opts.genre, 120).replace(/[<>&"`$\\]/g, '') || '(undecided)', SIZE: SIZES.includes(opts.size) ? opts.size : 'toy',
  };
  for (const rel of await listFiles(tdir)) {
    const src = path.join(tdir, rel);
    const out = within(dir, rel);
    if (TEXT.has(path.extname(rel).toLowerCase())) await writeTextMarked(out, fill(await fs.readFile(src, 'utf8'), vars));
    else { await fs.mkdir(path.dirname(out), { recursive: true }); await fs.copyFile(src, out); }
  }
  // the design files it starts from
  const designs = {};
  for (const shelf of ['art', 'sound', 'game']) {
    const want = opts.designs && opts.designs[shelf];
    if (!want) continue;
    await copyDesign(dir, shelf, assertId('design', want), vars.DATE);
    designs[shelf] = want;
  }
  const gfile = path.join(dir, 'game.json');
  const game = (await readJson(gfile)) || {};
  Object.assign(game, {
    id, name, genre: str(opts.genre, 120), description: str(opts.pitch, 600), size: vars.SIZE, stage: 1, status: 'active',
    resolution: { width: W, height: H, pixelScale: scale }, designs, idea: isId('idea', opts.idea) ? opts.idea : null,
    createdAt: t, updatedAt: t,
  });
  await writeTextMarked(gfile, JSON.stringify(game, null, 2) + '\n');
  if (opts.pitch) {
    const notes = path.join(dir, 'design', 'game.md');
    const cur = await fs.readFile(notes, 'utf8').catch(() => '');
    await writeTextMarked(notes, `${cur.replace(/\s+$/, '')}\n\n## The user's first notes (${vars.DATE})\n${str(opts.pitch, 100000)}\n`);
  }
  // the edits index the art contract imports
  await writeTextMarked(path.join(dir, 'game', 'art', 'edits', 'index.js'), EDITS.editsIndexSource({}));
  const kickoff = await createRequest(id, {
    kind: 'kickoff', tier: 'smart', assignee: 'ai',
    title: `Kick off ${name}`,
    body: [
      'New game made in Pixel Yak. Follow skill new-game with the user:',
      `1. Read games/${id}/AGENTS.md and design/ (the files it starts from: ${Object.entries(designs).map(([k, v]) => `${k} ${v}`).join(', ') || 'none picked yet'})${game.idea ? `, plus local/ideas/${game.idea}.md` : ''}.`,
      '2. Ask only what blocks you (the fantasy and the core verb, genre and camera, the look, the size); default the rest and list it.',
      '3. Brief the user on the first playable before writing code, then build it and get them playing.',
    ].join('\n'),
  }, [], 'user');
  return { project: normalizeProject(id, game), kickoff };
}

// Quick structural checks (yak check <game>).
export async function checkProject(id) {
  const out = [];
  const p = await getProject(id);
  if (!p) return [`ERROR games/${id}/game.json missing or unreadable`];
  if (!p.style) out.push(`WARN no design/art.md — this game has no look of its own yet (skill design)`);
  if (!p.hasAssets) out.push(`ERROR ${p.assetsPath} missing — Pixel Yak cannot list this game's art`);
  if (!p.hasGame) out.push(`WARN ${p.gamePath} missing — nothing to play yet`);
  const dir = path.resolve(ROOT, p.editsDir);
  if (!exists(path.join(dir, 'index.js'))) out.push(`WARN ${p.editsDir}/index.js missing — run: node cli/yak.mjs edits-index ${id}`);
  for (const [asset, ed] of Object.entries(await readAllEdits(id, { includeInvalid: true }))) {
    const errs = ed.unreadable ? ['not valid JSON'] : EDITS.checkEdit(ed);
    if (errs.length) out.push(`ERROR ${p.editsDir}/${asset}.json: ${errs.join('; ')}`);
  }
  if (!exists(path.join(DIRS.games, id, 'AGENTS.md'))) out.push(`WARN games/${id}/AGENTS.md missing — the one page an AI reads first`);
  return out;
}

