// studio/data/clips.mjs — promo clips (docs/contracts/CLIPS.md). A clip is a recipe,
// games/<id>/clips/<name>.clip.json: aspect, length, the page to boot, optional setup + shot scripts
// next to it, the title card, captions and end card as data, the music. The recorder
// (tools/clip.cjs) films a committed copy of the game from it into games/<id>/clips/out/.
// Shared by the studio (Clips view), the CLI (`yak clips`, `clip`, `clip-new`) and the recorder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRS, ROOT, isId, within, str, relRepo, readJson, writeTextMarked, exists } from './core.mjs';
import { projectDir } from './games.mjs';

export const CLIP_FORMAT = 'pixel-yak-clip@1';
// Output frame per aspect: what Shorts / Reels / TikTok (9:16), YouTube (16:9) and feeds (1:1) want.
export const CLIP_ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
export const CLIP_POS = ['top', 'middle', 'bottom'];
export const CLIP_BACKDROPS = ['dim', 'solid', 'none'];
export const CLIP_COLORS = { text: '#ffffff', shade: '#05040a', box: '#0c1024', border: '#e7e9f3', accent: '#f4c443', bg: '#0c1024' };
const MAX_LENGTH = 180;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const isClipName = (v) => typeof v === 'string' && NAME_RE.test(v);
export function assertClipName(v) {
  if (!isClipName(v)) throw new Error(`invalid clip name: ${JSON.stringify(v)} (lowercase letters, digits and dashes)`);
  return v;
}
export const clipsDir = (pid) => path.join(projectDir(pid), 'clips');
export const clipOutDir = (pid) => path.join(clipsDir(pid), 'out');
export const clipFile = (pid, name) => within(clipsDir(pid), `${assertClipName(name)}.clip.json`);
// a script or output file named in a recipe: a plain file name in the clips folder
const fileName = (v, ext) => (typeof v === 'string' && isId('file', v) && v.endsWith(ext) ? v : '');

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const time = (v, len, d) => Math.round(num(v, 0, len, d) * 100) / 100;

function normSpan(raw, len, { card = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const text = str(raw.text, 200).replace(/[\r\n]+/g, ' ').trim();
  const from = time(raw.from, len, 0);
  const to = time(raw.to, len, len);
  if (!text || to <= from) return null;
  const out = { from, to, text };
  if (card) {
    out.sub = str(raw.sub, 200).replace(/[\r\n]+/g, ' ').trim();
    out.backdrop = CLIP_BACKDROPS.includes(raw.backdrop) ? raw.backdrop : 'dim';
  } else out.pos = CLIP_POS.includes(raw.pos) ? raw.pos : 'bottom';
  return out;
}

// The recipe as the tools read it: every field present, every value in range.
export function normalizeClip(name, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const length = Math.round(num(r.length, 1, MAX_LENGTH, 15) * 100) / 100;
  const colors = { ...CLIP_COLORS };
  if (r.colors && typeof r.colors === 'object') for (const k of Object.keys(CLIP_COLORS)) if (HEX_RE.test(r.colors[k])) colors[k] = r.colors[k];
  return {
    format: CLIP_FORMAT,
    name,
    title: str(r.title, 120) || name,
    aspect: CLIP_ASPECTS[r.aspect] ? r.aspect : '9:16',
    length,
    fps: Math.round(num(r.fps, 12, 60, 30)),
    page: typeof r.page === 'string' && r.page && !r.page.includes('..') && !/^[a-z]+:|^[\\/]/i.test(r.page) ? r.page : '',
    ready: str(r.ready, 2000),
    settle: Math.round(num(r.settle, 0, 20000, 500)),
    setup: fileName(r.setup, '.js'),
    shot: fileName(r.shot, '.js'),
    titleCard: normSpan(r.titleCard, length, { card: true }),
    captions: (Array.isArray(r.captions) ? r.captions : []).slice(0, 40).map((c) => normSpan(c, length)).filter(Boolean).sort((a, b) => a.from - b.from),
    endCard: normSpan(r.endCard, length, { card: true }),
    music: r.music && typeof r.music === 'object' && isId('asset', r.music.song) ? { song: r.music.song } : null,
    colors,
    probeAt: Array.isArray(r.probeAt) ? r.probeAt.map((t) => time(t, length, 0)).slice(0, 12) : null,
    out: fileName(r.out, '.mp4') || `${name}.mp4`,
  };
}

// The output frame and the window that films it. The game draws at its own whole-number scale into
// a window of out/k, and ffmpeg scales every frame up k times with nearest-neighbour, so the game
// fills as much of the frame as a whole-number scale allows and every pixel stays square and crisp.
export function clipFrame(aspect, res) {
  const [outW, outH] = CLIP_ASPECTS[aspect] || CLIP_ASPECTS['9:16'];
  const gw = Math.max(16, Number(res && res.width) || 320), gh = Math.max(16, Number(res && res.height) || 180);
  const most = Math.min(outW / gw, outH / gh);
  let k = 1;
  for (let d = Math.max(1, Math.floor(most)); d >= 1; d--) if (outW % d === 0 && outH % d === 0) { k = d; break; }
  const winW = outW / k, winH = outH / k;
  const s = Math.max(1, Math.floor(Math.min(winW / gw, winH / gh))); // the game's own scale in that window
  const px = k * s; // output pixels per game pixel (and per overlay pixel)
  const base = Math.min(outW, outH);
  const caption = Math.max(1, Math.round((0.04 * base) / (7 * px))); // caption capitals ~4% of the short side
  return {
    outW, outH, k, winW, winH, scale: s, px,
    overlay: [Math.round(winW / s), Math.round(winH / s)],
    fontScale: { caption, title: caption * 2 },
    // keep words out of the parts the apps cover (9:16: the top bar and the caption/button area)
    safe: aspect === '9:16' ? { top: 0.12, bottom: 0.2 } : { top: 0.07, bottom: 0.08 },
  };
}

// Times to take probe stills at: the start, the middle of every card and caption, the end.
export function probeTimes(clip) {
  if (clip.probeAt && clip.probeAt.length) return [...new Set(clip.probeAt)].sort((a, b) => a - b);
  const spans = [clip.titleCard, ...clip.captions, clip.endCard].filter(Boolean);
  const ts = [0.3, ...spans.map((s) => (s.from + s.to) / 2), clip.length - 0.3].map((t) => Math.round(Math.max(0, Math.min(clip.length - 0.05, t)) * 10) / 10);
  return [...new Set(ts)].sort((a, b) => a - b).slice(0, 8);
}

// ------------------------------------------------------------------- files ---
export async function readClipRaw(pid, name) {
  const raw = await readJson(clipFile(pid, name));
  if (!raw) throw new Error(`no clip "${name}" in games/${pid}/clips/ (or it is not valid JSON)`);
  return raw;
}
export async function readClip(pid, name) { return normalizeClip(name, await readClipRaw(pid, name)); }

async function statOrNull(p) { try { return await fs.stat(p); } catch { return null; } }

// Every clip of a game: the recipe, its last render (MP4 + info) and its last probe stills.
export async function listClips(pid) {
  const dir = clipsDir(pid);
  let names = [];
  try { names = (await fs.readdir(dir)).filter((f) => f.endsWith('.clip.json')).map((f) => f.slice(0, -10)).filter(isClipName); } catch { return []; }
  const out = [];
  for (const name of names.sort()) {
    const raw = await readJson(path.join(dir, `${name}.clip.json`));
    const clip = normalizeClip(name, raw);
    const mp4 = path.join(clipOutDir(pid), clip.out);
    const st = await statOrNull(mp4);
    const info = await readJson(path.join(clipOutDir(pid), `${name}.json`));
    const probeDir = path.join(clipOutDir(pid), `${name}-probe`);
    let stills = [];
    try { stills = (await fs.readdir(probeDir)).filter((f) => /^still-.*\.png$/.test(f)).sort().map((f) => relRepo(path.join(probeDir, f))); } catch {}
    const probeInfo = stills.length ? await readJson(path.join(probeDir, 'probe.json')) : null;
    out.push({
      name, clip, valid: !!raw,
      file: relRepo(path.join(dir, `${name}.clip.json`)),
      shotFile: clip.shot ? relRepo(path.join(dir, clip.shot)) : null,
      render: st ? { mp4: relRepo(mp4), at: st.mtime.toISOString(), bytes: st.size, info: info || null } : null,
      probe: stills.length ? { stills, at: (probeInfo && probeInfo.at) || null } : null,
    });
  }
  return out;
}

// Change the fields the studio's form edits; every other field of the recipe is kept as written.
const PATCHABLE = ['title', 'aspect', 'length', 'titleCard', 'captions', 'endCard', 'music'];
export async function saveClip(pid, name, patch) {
  const file = clipFile(pid, name);
  const raw = await readClipRaw(pid, name);
  const next = { ...raw };
  for (const k of PATCHABLE) if (patch && k in patch) next[k] = patch[k];
  const n = normalizeClip(name, next);
  next.format = CLIP_FORMAT;
  next.aspect = n.aspect; next.length = n.length;
  for (const k of ['titleCard', 'endCard', 'captions', 'music']) next[k] = n[k];
  if ('title' in (patch || {})) next.title = n.title;
  await writeTextMarked(file, JSON.stringify(next, null, 2) + '\n');
  return n;
}

// A starter recipe (+ an empty shot script) for `clip-new`: a title card, one caption to edit, the end card.
export function starterClip({ name, gameName, aspect = '9:16', length = 15, entry = 'game/index.html' }) {
  const len = Math.round(num(length, 3, MAX_LENGTH, 15) * 10) / 10;
  const r = (t) => Math.round(t * 10) / 10;
  const card = Math.min(2.5, r(len * 0.2));
  return {
    format: CLIP_FORMAT,
    title: name,
    aspect: CLIP_ASPECTS[aspect] ? aspect : '9:16',
    length: len,
    fps: 30,
    page: entry,
    ready: "document.readyState === 'complete'",
    settle: 800,
    shot: `${name}.shot.js`,
    titleCard: { from: 0, to: card, text: gameName, sub: '', backdrop: 'dim' },
    captions: [{ from: r(card + 0.4), to: r(Math.min(len - card - 0.3, card + 3.4)), text: 'What the player sees here', pos: 'bottom' }],
    endCard: { from: r(len - card), to: len, text: gameName, sub: 'coming soon', backdrop: 'solid' },
    music: null,
    out: `${name}.mp4`,
  };
}

export function starterShot(name) {
  return `// ${name}.shot.js — the camera for clip "${name}" (docs/contracts/CLIPS.md). Runs in the game page the
// moment filming starts. Move things by the film clock __clip.t() (seconds since the first frame),
// never by counting frames; __clip.length is the clip's length. Return a small summary (printed).
(() => {
  // const tick = () => {
  //   const t = __clip.t();
  //   // e.g. window.__game.camera.x = 40 + t * 12;  (whatever hooks this game exposes)
  //   if (t < __clip.length) requestAnimationFrame(tick);
  // };
  // requestAnimationFrame(tick);
  return { shot: 'static' };
})()
`;
}

export async function createClip(pid, name, opts = {}) {
  assertClipName(name);
  const file = clipFile(pid, name);
  if (exists(file)) throw new Error(`games/${pid}/clips/${name}.clip.json already exists`);
  const game = await readJson(path.join(projectDir(pid), 'game.json'));
  if (!game) throw new Error(`game ${pid} not found`);
  const recipe = starterClip({ name, gameName: str(game.name, 60) || pid, aspect: opts.aspect, length: opts.length, entry: typeof game.entry === 'string' ? game.entry : 'game/index.html' });
  await writeTextMarked(file, JSON.stringify(recipe, null, 2) + '\n');
  const shot = path.join(clipsDir(pid), recipe.shot);
  if (!exists(shot)) await writeTextMarked(shot, starterShot(name));
  return { file: relRepo(file), shot: relRepo(shot), clip: normalizeClip(name, recipe) };
}

// --------------------------------------------------------------- settings ---
// local/clips.json (the user's own, never committed): { "copyTo": "<a folder>" } — every finished MP4
// is also copied to <copyTo>/<game id>/. The studio always keeps its own copy in clips/out/ to play.
export async function clipSettings() {
  const s = (await readJson(path.join(DIRS.local, 'clips.json'))) || {};
  return { copyTo: typeof s.copyTo === 'string' && s.copyTo.trim() ? path.resolve(ROOT, s.copyTo.trim()) : null };
}

// The game's songs, for the music picker — when the sound engine's data module is there (listSongs).
export async function listClipSongs(pid, D) {
  if (!D || typeof D.listSongs !== 'function') return [];
  try {
    const songs = await D.listSongs(pid);
    return (Array.isArray(songs) ? songs : []).map((s) => (typeof s === 'string' ? { id: s, name: s } : { id: s.id, name: s.name || s.title || s.id })).filter((s) => isId('asset', s.id));
  } catch { return []; }
}

// ---------------------------------------------------------------- recorder ---
// How to run the recorder: `<electron> tools/clip.cjs <game> <name> [--probe] [--ref <rev>] [--music-file <wav>]`.
// It prints one `CLIP {json}` line per step (parseClipLine reads them).
export function recorderArgs(pid, name, { probe = false, ref = null, musicFile = null } = {}) {
  const args = [path.join(ROOT, 'tools', 'clip.cjs'), pid, assertClipName(name)];
  if (probe) args.push('--probe');
  if (ref) args.push('--ref', String(ref));
  if (musicFile) args.push('--music-file', path.resolve(String(musicFile)));
  return args;
}
export function parseClipLine(line) {
  const m = /^CLIP (\{.*\})\s*$/.exec(String(line));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
