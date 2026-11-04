// studio/data/sound.mjs — the user's sound edits and sound lessons (docs/contracts/SOUND.md).
// Edits: one JSON file per edited song (song.<id>.json) or sound effect (sfx.<id>.json), one for
// instrument knobs (instruments.json), and a generated index.js the game imports — in the game's
// sound edits folder (game.json "soundEdits", default game/sound/edits). Format and the code that
// applies them: engine/sound/edits.js. Lessons: one JSON line per save in
// games/<id>/design/lessons/sound.jsonl; distillations (skill sound-learn) in sound-distilled.jsonl.
// Never changes the user's notes: it only stores what the studio saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assertId, isId, inside, within, str, nowIso, readJson, relRepo, markWrite, writeJsonMarked, writeTextMarked, exists, appendLine, readJsonStrict } from './core.mjs';
import { projectDir } from './games.mjs';
import { readLines } from './lessons.mjs';

export const SOUND = await import(pathToFileURL(path.join(ROOT, 'engine', 'sound', 'edits.js')).href);

const KINDS = { song: 'song', sfx: 'sfx' };

function gamePath(dir, rel, fallback) {
  const p = typeof rel === 'string' && rel && !rel.includes('\0') ? path.resolve(dir, rel) : null;
  return p && inside(dir, p) ? p : path.join(dir, fallback);
}

// Where a game's sound lives: { module, editsDir (absolute), moduleRel, editsRel, hasModule, design }.
export async function soundInfo(projectId) {
  const dir = projectDir(projectId);
  const g = await readJson(path.join(dir, 'game.json'));
  if (!g) throw new Error(`game ${projectId} not found`);
  const module = gamePath(dir, g.sound, 'game/sound.js');
  const editsDir = gamePath(dir, g.soundEdits, 'game/sound/edits');
  return {
    game: projectId, module, editsDir, moduleRel: relRepo(module), editsRel: relRepo(editsDir),
    hasModule: exists(module), design: g.designs && isId('design', g.designs.sound) ? g.designs.sound : null,
  };
}

const fileFor = (kind, id) => (kind === 'instruments' ? 'instruments.json' : `${KINDS[kind]}.${assertId('asset', id)}.json`);

// Every edit file → { songs: { id: ed }, sfx: { id: ed }, instruments: ed | null, invalid: [{ file, errors }] }.
export async function readSoundEdits(projectId) {
  const { editsDir } = await soundInfo(projectId);
  const out = { songs: {}, sfx: {}, instruments: null, invalid: [] };
  let names = [];
  try { names = (await fs.readdir(editsDir)).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of names.sort()) {
    const m = /^(song|sfx)\.([A-Za-z0-9_.-]{1,96})\.json$/.exec(f);
    if (!m && f !== 'instruments.json') continue;
    let ed, errs;
    try { ed = await readJsonStrict(path.join(editsDir, f)); errs = SOUND.checkSoundEdit(ed); } catch (err) { errs = [err.why || err.message]; }
    if (errs.length) { out.invalid.push({ file: `${relRepo(editsDir)}/${f}`, errors: errs }); continue; }
    if (f === 'instruments.json') out.instruments = ed;
    else out[m[1] === 'song' ? 'songs' : 'sfx'][m[2]] = ed;
  }
  return out;
}

// A broken sound edit file (unreadable, or not a valid edit) stops every write: rebuilding the index
// would quietly drop it from the game, and a save could go over it. The person's file is fixed, never deleted.
async function refuseIfBroken(projectId, what) {
  const all = await readSoundEdits(projectId);
  if (!all.invalid.length) return all;
  const err = new Error(`${what} refused: ${all.invalid.map((b) => `${b.file} (${b.errors.join('; ')})`).join('; ')}. Those are the person's sound edits: fix the file (resolve the conflict), never delete it — then save again.`);
  err.unreadable = true;
  throw err;
}

export async function rebuildSoundIndex(projectId) {
  const { editsDir } = await soundInfo(projectId);
  const all = await refuseIfBroken(projectId, 'Updating the sound edits index');
  await writeTextMarked(path.join(editsDir, 'index.js'), SOUND.editsIndexSource({ songs: all.songs, sfx: all.sfx, instruments: all.instruments || {} }));
  return Object.keys(all.songs).length + Object.keys(all.sfx).length + (all.instruments ? 1 : 0);
}

// Write one edit (kind song | sfx | instruments). An edit with nothing in it removes its file.
// Returns the edit as written, or null when it was removed.
export async function writeSoundEdit(projectId, ed) {
  if (!ed || typeof ed !== 'object') throw new Error('no edit');
  ed.format = SOUND.SOUND_EDIT_FORMAT;
  ed.game = projectId;
  const id = ed.kind === 'song' ? ed.song : ed.kind === 'sfx' ? ed.sfx : null;
  const errs = SOUND.checkSoundEdit(ed);
  if (errs.length) throw new Error(`invalid sound edit: ${errs.join('; ')}`);
  if (JSON.stringify(ed).length > 4_000_000) throw new Error('sound edit too large');
  const { editsDir } = await soundInfo(projectId);
  const file = within(editsDir, fileFor(ed.kind, id));
  await refuseIfBroken(projectId, 'Saving');
  if (SOUND.isEmptyEdit(ed) && !(ed.notes || []).length) {
    markWrite(file);
    await fs.rm(file, { force: true });
    await rebuildSoundIndex(projectId);
    return null;
  }
  ed.updated = nowIso();
  await writeJsonMarked(file, ed);
  await rebuildSoundIndex(projectId);
  return ed;
}

// Revert: remove the user's edit of a song / sound effect / the instruments (back to the AI's).
export async function deleteSoundEdit(projectId, kind, id = null) {
  const { editsDir } = await soundInfo(projectId);
  if (!['song', 'sfx', 'instruments'].includes(kind)) throw new Error('kind must be song, sfx or instruments');
  const file = within(editsDir, fileFor(kind, id));
  await refuseIfBroken(projectId, 'Reverting');
  markWrite(file);
  await fs.rm(file, { force: true });
  await rebuildSoundIndex(projectId);
}

// ----------------------------------------------------------------- lessons ---
const lessonsDir = (projectId) => path.join(projectDir(projectId), 'design', 'lessons');

// lesson: { id: 'S-…', ts, kind, song?, sfx?, note, changes: [...], summary, design } (docs/contracts/SOUND.md)
export async function appendSoundLesson(projectId, lesson) {
  const id = str(lesson && lesson.id, 120);
  if (!/^S-[A-Za-z0-9_.-]{4,118}$/.test(id)) throw new Error('bad sound lesson id');
  const line = JSON.stringify({ ...lesson, id, game: projectId });
  if (line.length > 1_000_000) throw new Error('sound lesson too large');
  const file = path.join(lessonsDir(projectId), 'sound.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  markWrite(file);
  await appendLine(file, line); // a line cut short by a crash costs only itself
  return id;
}

export const soundLessonId = (target, now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `S-${stamp}-${String(target).replace(/[^A-Za-z0-9_.-]/g, '_')}`.slice(0, 118);
};

// Oldest first. onlyNew: only lessons after the last distillation.
export async function readSoundLessons(projectId, { limit = 1000, onlyNew = false } = {}) {
  const dir = lessonsDir(projectId);
  let all = await readLines(path.join(dir, 'sound.jsonl'));
  if (onlyNew) {
    const d = await readLines(path.join(dir, 'sound-distilled.jsonl'));
    const last = d.length ? d[d.length - 1] : null;
    if (last && last.through) { const i = all.findIndex((l) => l.id === last.through); if (i >= 0) all = all.slice(i + 1); }
  }
  return all.slice(-limit);
}

export async function soundLessonSummary(projectId) {
  const dir = lessonsDir(projectId);
  const all = await readLines(path.join(dir, 'sound.jsonl'));
  const d = await readLines(path.join(dir, 'sound-distilled.jsonl'));
  const last = d.length ? d[d.length - 1] : null;
  let undistilled = all.length;
  if (last && last.through) { const i = all.findIndex((l) => l.id === last.through); if (i >= 0) undistilled = all.length - i - 1; }
  return { lessons: all.length, undistilled, lastDistilled: last, file: `games/${projectId}/design/lessons/sound.jsonl` };
}

export async function addSoundDistilled(projectId, { through, summary, version = null, by = 'ai' }) {
  const entry = { ts: nowIso(), version: Number(version) || null, through: str(through, 120), summary: str(summary, 8000), by };
  const file = path.join(lessonsDir(projectId), 'sound-distilled.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  markWrite(file);
  await appendLine(file, JSON.stringify(entry));
  return entry;
}

// Structural checks for `yak check` (files only; the CLI also loads and renders the songs).
export async function checkSoundFiles(projectId) {
  const out = [];
  const info = await soundInfo(projectId);
  if (!info.hasModule) { out.push(`WARN ${info.moduleRel} missing — this game has no music or sound effects yet (skill sound)`); return out; }
  if (!exists(path.join(info.editsDir, 'index.js'))) out.push(`WARN ${info.editsRel}/index.js missing — run: node cli/yak.mjs sound-index ${projectId}`);
  const all = await readSoundEdits(projectId);
  for (const x of all.invalid) out.push(`ERROR ${x.file}: ${x.errors.join('; ')}`);
  return out;
}
