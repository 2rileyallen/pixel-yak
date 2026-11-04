// studio/data/scaffold.mjs — a new game: copies templates/<template>/ into games/<id>/, fills in its
// name and size, copies the design files it starts from (one per shelf, from the library or
// local/designs) into its design/ folder, gives it its own copy of the engine (games/<id>/engine/, so a
// harness engine change never reaches it by itself), files a kickoff request for the AI (skill
// new-game), and makes the game its own git repo with a first commit (games/ is ignored by the
// harness's git). Also: checkProject, the quick structural check behind `yak check`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DIRS, ROOT, EDITS, assertId, isId, within, str, nowIso, readJson, writeTextMarked, exists } from './core.mjs';
import { normalizeProject, getProject, SIZES } from './games.mjs';
import { readAllEdits } from './edits.mjs';
import { createRequest } from './requests.mjs';
import { copyDesign, findDesign } from './designs.mjs';
import { copyEngine, engineStatus, outsideImports, harnessEngineVersion } from './engine-copy.mjs';
import { gameReads } from './formats.mjs';

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
  // every design named must exist before anything is written, so a bad pick leaves no half-made game
  for (const shelf of ['art', 'sound', 'game']) {
    const want = opts.designs && opts.designs[shelf];
    if (want && !findDesign(shelf, assertId('design', want))) throw new Error(`no design "${want}" on the ${shelf} shelf — node cli/yak.mjs designs ${shelf} lists them`);
  }
  try {
    return await makeGame(opts, id, dir, tdir);
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 }).catch(() => {}); // never leave half a game behind
    throw err;
  }
}

// A first commit makes the game a repo of its own from day one: history, branches, and the clip
// recorder (it films committed work). No remote — pushing is the user's call (skill collaborate).
function initRepo(dir, name) {
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  // `-b` needs git 2.28+; an older git makes the repo, then names the branch
  if (git('init', '-q', '-b', 'main').status !== 0) {
    if (git('init', '-q').status !== 0) return { repo: false, commit: false };
    git('symbolic-ref', 'HEAD', 'refs/heads/main');
  }
  git('add', '-A');
  const c = git('commit', '-q', '-m', `${name}: made with Pixel Yak`);
  return { repo: true, commit: c.status === 0 };
}

async function makeGame(opts, id, dir, tdir) {
  const res = opts.resolution || {};
  const W = Math.max(64, Math.min(1920, Number(res.width) || 320));
  const H = Math.max(64, Math.min(1080, Number(res.height) || 180));
  const scale = Math.max(1, Math.min(8, Number(res.pixelScale) || 3));
  const name = str(opts.name, 120).replace(/\s+/g, ' ').trim() || id.toUpperCase();
  const t = nowIso();
  const safe = name.replace(/[<>&"`$\\]/g, '');
  const vars = {
    // NAME goes into Markdown, HTML and JSON strings; NAMEJS is a quoted JavaScript string ("Kid's Quest")
    ID: id, NAME: safe, NAMEJS: JSON.stringify(safe), W: String(W), H: String(H), SCALE: String(scale), DATE: t.slice(0, 10),
    GENRE: str(opts.genre, 120).replace(/[<>&"`$\\]/g, '') || '(undecided)', SIZE: SIZES.includes(opts.size) ? opts.size : 'toy',
  };
  for (const rel of await listFiles(tdir)) {
    const src = path.join(tdir, rel);
    const out = within(dir, rel);
    if (TEXT.has(path.extname(rel).toLowerCase())) await writeTextMarked(out, fill(await fs.readFile(src, 'utf8'), vars));
    else { await fs.mkdir(path.dirname(out), { recursive: true }); await fs.copyFile(src, out); }
  }
  // its own engine (engine/README.md): the harness's engine as it is today, recorded in engine/COPY.json
  copyEngine(id);
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
      '3. Name the first systems (game/systems/, one page each in design/systems/); check the systems shelf (node cli/yak.mjs designs systems) before writing one from scratch.',
      '4. Brief the user on the first playable before writing code, then build it and get them playing.',
    ].join('\n'),
  }, [], 'user');
  const git = opts.git === false ? { repo: false, commit: false } : initRepo(dir, name);
  return { project: normalizeProject(id, game), kickoff, git };
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
  const reads = await gameReads(id, 'edits'); // null: on the harness's engine
  for (const [asset, ed] of Object.entries(await readAllEdits(id, { includeInvalid: true }))) {
    const errs = ed.unreadable ? ['not valid JSON'] : EDITS.checkEdit(ed);
    if (errs.length) out.push(`ERROR ${p.editsDir}/${asset}.json: ${errs.join('; ')}`);
    // a file the harness reads but the game's own engine doesn't: the game would quietly ignore it
    else if (reads && !reads.includes(ed.format)) out.push(`ERROR ${p.editsDir}/${asset}.json is ${ed.format}, which this game's own engine doesn't read (it reads ${reads.join(', ') || 'nothing'}): the game ignores it — engine ${id}, then engine-pull`);
  }
  if (!exists(path.join(DIRS.games, id, 'AGENTS.md'))) out.push(`WARN games/${id}/AGENTS.md missing — the one page an AI reads first`);
  // a game never reaches outside its folder (AGENTS.md hard line 5): not into another game, not into the harness
  for (const x of outsideImports(id).slice(0, 20)) out.push(`${x.level === 'error' ? 'ERROR' : 'WARN'} ${path.relative(path.join(DIRS.games, id), x.file).split(path.sep).join('/')}:${x.line} imports ${x.spec} — that is ${x.where}; a game only uses its own folder`);
  const eng = engineStatus(id);
  if (!eng.own) out.push(`WARN no engine copy of its own: it runs on the harness's engine, so any change there reaches it at once (node cli/yak.mjs engine-adopt ${id})`);
  else if (String(eng.version) !== String(harnessEngineVersion())) out.push(`INFO engine v${eng.version}; the harness has v${harnessEngineVersion()} (node cli/yak.mjs engine ${id})`);
  out.push(...(await readingBudget(id)));
  return out;
}

// The reading budget (docs/contracts/README.md → A game's pages): a page an AI reads before a task
// stays short however big the game grows, so starting any task costs a few thousand tokens.
export const PAGE_WORDS = [
  ['AGENTS.md', 1000, 'keep it one page: point at files instead of repeating them'],
  ['design/game.md', 1200, "keep it the index (the game in a sentence, pillars, the list of systems); each system's rules go in design/systems/<system>.md"],
  ['design/systems/*.md', 1500, 'split the system, or move detail its readers rarely need into a page it links'],
  ['design/art.md', 1500, 'move rarely needed detail into a page it links'],
  ['design/sound.md', 1500, 'move rarely needed detail into a page it links'],
  ['ENGINEERING.md', 1500, "keep it the map; each system's code notes go on its design/systems page"],
];
const countWords = (text) => (text.replace(/```[\s\S]*?```/g, ' ').match(/\S+/g) || []).length;

export async function readingBudget(id) {
  const base = path.join(DIRS.games, id);
  const out = [];
  for (const [pat, max, how] of PAGE_WORDS) {
    let files = [path.join(base, pat)];
    if (pat.endsWith('/*.md')) {
      const dir = path.join(base, pat.slice(0, -5));
      files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => path.join(dir, f));
    }
    for (const f of files) {
      const text = await fs.readFile(f, 'utf8').catch(() => null);
      if (text === null) continue;
      const n = countWords(text);
      if (n > max) out.push(`WARN ${path.relative(base, f).split(path.sep).join('/')} is ${n.toLocaleString('en')} words (a must-read page stays under ${max.toLocaleString('en')}): ${how}`);
    }
  }
  return out;
}

