// studio/data/tuning.mjs — F8 tuning choices the user kept (docs/contracts/TUNING.md).
//   games/<id>/tuning/<slug>.json          a kept choice the AI hasn't built into the code yet
//   games/<id>/tuning/done/<slug>.json     built in (the winner is in the code, the losers are gone)
//   games/<id>/design/lessons/tuning.jsonl one lesson line per Keep (what the AI learns from)
import fs from 'node:fs/promises';
import path from 'node:path';
import { within, str, nowIso, relRepo, readJson, markWrite, writeJsonMarked, exists, appendLine } from './core.mjs';
import { projectDir } from './games.mjs';

export const TUNING_FORMAT = 'pixel-yak-tuning@1';

// "Hero walk speed" -> "hero-walk-speed" (the same rule as engine/link/studio.js slugOf)
export function tuningSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'knob';
}

const tuningDir = (id, done = false) => path.join(projectDir(id), 'tuning', ...(done ? ['done'] : []));
const lessonsFile = (id) => path.join(projectDir(id), 'design', 'lessons', 'tuning.jsonl');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
// a variant option or a knob value: a short string, a number or a boolean
function value(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 200);
  return v == null ? null : str(JSON.stringify(v), 200);
}

// A choice from the game (engine/link keep()) → the record kept on disk. Throws when it's unusable.
export function normChoice(c) {
  if (!c || typeof c !== 'object') throw new Error('no choice');
  const name = str(c.name, 120).trim();
  if (!name) throw new Error('a tuning choice needs a name');
  const kind = c.kind === 'variant' ? 'variant' : 'knob';
  const rec = {
    format: TUNING_FORMAT, name, slug: tuningSlug(name), kind,
    chosen: kind === 'knob' ? num(c.chosen) : value(c.chosen),
    label: str(c.label, 200) || String(c.chosen),
    default: kind === 'knob' ? num(c.default) : value(c.default),
  };
  if (kind === 'knob') {
    const r = c.range && typeof c.range === 'object' ? c.range : {};
    rec.range = { min: num(r.min), max: num(r.max), step: num(r.step) };
    if (rec.chosen === null) throw new Error('a knob needs a number');
  } else {
    rec.options = Array.isArray(c.options) ? c.options.slice(0, 26).map(value) : [];
  }
  rec.note = str(c.note, 300).trim();
  rec.at = nowIso();
  rec.by = 'user';
  return rec;
}

// The sentence a lesson carries: "Kept B · war drums for Title music (over A · calm harp, C · music box) — why"
export function tuningSentence(rec) {
  const others = rec.kind === 'variant'
    ? rec.options.filter((o) => JSON.stringify(o) !== JSON.stringify(rec.chosen)).map(String)
    : null;
  const over = others ? (others.length ? ` (over ${others.join(', ')})` : '') : ` (code default ${rec.default}${rec.range && rec.range.min !== null ? `, tried ${rec.range.min} to ${rec.range.max}` : ''})`;
  return `Kept ${rec.label} for ${rec.name}${over}${rec.note ? ` — ${rec.note}` : ''}`;
}

// Keep a choice: writes tuning/<slug>.json (a newer Keep of the same knob replaces it) and appends
// a lesson line. Returns { file, record, lesson }.
export async function keepTuning(gameId, choice) {
  const rec = normChoice(choice);
  const file = within(tuningDir(gameId), `${rec.slug}.json`);
  await writeJsonMarked(file, rec);
  const lesson = {
    id: `L-tune-${rec.at.replace(/[^0-9]/g, '').slice(2, 14)}-${Math.random().toString(36).slice(2, 5)}`,
    ts: rec.at, kind: 'tuning', game: gameId, name: rec.name, slug: rec.slug, chosen: rec.chosen, default: rec.default,
    ...(rec.kind === 'knob' ? { range: rec.range } : { options: rec.options }),
    note: rec.note, lesson: tuningSentence(rec), by: 'user',
  };
  const log = lessonsFile(gameId);
  await fs.mkdir(path.dirname(log), { recursive: true });
  markWrite(log);
  await appendLine(log, JSON.stringify(lesson)); // a line cut short by a crash costs only itself
  return { file: relRepo(file), record: rec, lesson };
}

// Kept choices, oldest first. done: the ones already built into the code instead.
export async function listTuning(gameId, { done = false } = {}) {
  const dir = tuningDir(gameId, done);
  let names = [];
  try { names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const n of names) {
    const r = await readJson(path.join(dir, n));
    if (r && typeof r === 'object' && r.name) out.push({ ...r, slug: n.slice(0, -5), file: relRepo(path.join(dir, n)) });
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// The AI built the winner into the code: tuning/<slug>.json → tuning/done/<slug>.json.
export async function markTuningDone(gameId, slug, note = '') {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(String(slug))) throw new Error(`invalid tuning slug: ${JSON.stringify(slug)}`);
  const from = within(tuningDir(gameId), `${slug}.json`);
  const rec = await readJson(from);
  if (!rec) throw new Error(`no kept choice games/${gameId}/tuning/${slug}.json${exists(within(tuningDir(gameId, true), `${slug}.json`)) ? ' (it is already in tuning/done/)' : ''}`);
  const to = within(tuningDir(gameId, true), `${slug}.json`);
  await writeJsonMarked(to, { ...rec, doneAt: nowIso(), doneNote: str(note, 1000) });
  markWrite(from);
  await fs.rm(from, { force: true });
  return relRepo(to);
}
