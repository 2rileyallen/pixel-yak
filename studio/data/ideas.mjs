// studio/data/ideas.mjs — the ideas backlog: local/ideas/<slug>.md with a small "key: value" front matter block.
// Ideas are the user's own, so they live in local/ (never in the public harness repo).
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, assertId, isId, within, str, nowIso, markWrite, writeTextMarked, exists } from './core.mjs';

export const IDEA_STATUS = ['seed', 'exploring', 'parked', 'started'];
// ideas/<slug>.md with a small "key: value" front matter block.
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}
const fmLine = (k, v) => `${k}: ${String(v ?? '').replace(/[\r\n]+/g, ' ').trim()}`;

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48).replace(/^-|-$/g, '') || 'idea';
}

export async function listIdeas() {
  let files = [];
  try { files = await fs.readdir(DIRS.ideas); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.md') || f.toLowerCase() === 'readme.md') continue;
    const id = f.slice(0, -3);
    if (!isId('idea', id)) continue;
    const text = await fs.readFile(path.join(DIRS.ideas, f), 'utf8').catch(() => null);
    if (text == null) continue;
    const { meta, body } = parseFrontMatter(text);
    out.push({
      id,
      title: meta.title || id,
      genre: meta.genre || '',
      style: meta.style || '',
      source: meta.source || '',
      status: IDEA_STATUS.includes(meta.status) ? meta.status : 'seed',
      project: isId('project', meta.project) ? meta.project : null,
      created: meta.created || '',
      updated: meta.updated || '',
      body,
    });
  }
  return out.sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
}

export async function saveIdea(idea) {
  let id = idea.id;
  if (!id) {
    const base = slugify(idea.title);
    id = base;
    for (let n = 2; exists(path.join(DIRS.ideas, `${id}.md`)); n++) id = `${base}-${n}`;
  }
  assertId('idea', id);
  const file = within(DIRS.ideas, `${id}.md`);
  const old = exists(file) ? parseFrontMatter(await fs.readFile(file, 'utf8')).meta : {};
  const meta = {
    title: str(idea.title, 160) || id,
    genre: str(idea.genre, 120),
    style: str(idea.style, 60),
    source: str(idea.source, 300),
    status: IDEA_STATUS.includes(idea.status) ? idea.status : 'seed',
    project: isId('project', idea.project) ? idea.project : '',
    created: old.created || nowIso().slice(0, 10),
    updated: nowIso().slice(0, 10),
  };
  const text = ['---', ...Object.entries(meta).map(([k, v]) => fmLine(k, v)), '---', str(idea.body, 200000).replace(/\s+$/, ''), ''].join('\n');
  await writeTextMarked(file, text);
  return { id, ...meta, body: idea.body || '' };
}

export async function deleteIdea(id) {
  const file = within(DIRS.ideas, `${assertId('idea', id)}.md`);
  markWrite(file);
  await fs.rm(file, { force: true });
}
