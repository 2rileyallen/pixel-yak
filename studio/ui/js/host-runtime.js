// studio/ui/js/host-runtime.js — runs inside a project host iframe (studio://host-<project>/).
// Imports the project's assets.js (its studio listing), normalizes every asset into one
// shape, and answers the studio's postMessage requests:
//   list                      → { meta, categories, assets: [plain data], errors }
//   raw   { asset, poses }    → [{ pose, w, h, rgba }]  the generator's own pixels
//   play/stop { asset }       → audio preview
// Nothing here is shared with other projects: each project gets a fresh iframe + origin.
import { unwrapCanvas } from './canvas-unwrap.js';

const STUDIO_ORIGIN = 'studio://app';
const q = new URLSearchParams(location.search);
const entry = q.get('entry') || '';
const errors = [];
addEventListener('error', (e) => errors.push(`${e.message}${e.filename ? ` (${e.filename.replace(/^studio:\/\/[^/]+\//, '')}:${e.lineno})` : ''}`));
addEventListener('unhandledrejection', (e) => errors.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

let mod = null;
let loadError = null;
const byId = new Map();

function normalize(a, i) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string') return null;
  if (a.kind === 'audio') {
    return { plain: { id: a.id, name: a.name || a.id, category: a.category || 'audio', tags: a.tags || [], kind: 'audio', description: a.description || '', canStop: typeof a.stop === 'function' }, src: a };
  }
  const anims = a.anims && typeof a.anims === 'object' ? a.anims : null;
  let poses = Array.isArray(a.poses) && a.poses.length ? a.poses.map(String) : null;
  if (!poses && anims) poses = [...new Set(Object.values(anims).flat().map(String))];
  if (!poses) poses = ['default'];
  const plain = {
    id: a.id,
    name: a.name || a.id,
    category: a.category || 'misc',
    tags: Array.isArray(a.tags) ? a.tags : [],
    kind: 'visual',
    fw: a.fw | 0, fh: a.fh | 0, ax: a.ax ?? null, ay: a.ay ?? null,
    poses,
    anims: anims ? Object.fromEntries(Object.entries(anims).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(String)])) : { default: poses },
    defaultAnim: a.defaultAnim || (anims ? Object.keys(anims)[0] : 'default'),
    description: a.description || '',
    gen: a.gen || null,
    order: i,
    hasRaw: typeof a.getRaw === 'function',
  };
  return { plain, src: a };
}

async function load() {
  // a game's art code runs only on that game's own origin (studio/main/origins.mjs), never the studio's
  if (!/^host-[a-z0-9][a-z0-9-]{0,47}$/.test(location.host)) { loadError = `host.html runs only on a game's own origin, not ${location.host}`; return; }
  try {
    mod = await import(`/${entry}`);
  } catch (err) {
    loadError = String(err && (err.stack || err.message) || err);
    return;
  }
  (mod.ASSETS || []).forEach((a, i) => {
    try {
      const n = normalize(a, i);
      if (n && !byId.has(n.plain.id)) byId.set(n.plain.id, n);
    } catch (err) { errors.push(`asset #${i}: ${err.message}`); }
  });
}

function renderRaw(n, pose) {
  const a = n.src;
  let c = null;
  if (typeof a.getRaw === 'function') c = a.getRaw(pose);
  else if (typeof a.getCanvas === 'function') c = unwrapCanvas(a.getCanvas(pose), n.plain.poses.indexOf(pose));
  else if (a.frames && a.frames[pose]) c = unwrapCanvas(a.frames[pose]);
  else if (a.canvas) c = unwrapCanvas(a.canvas);
  if (!c) return null;
  const w = c.width, h = c.height;
  let data;
  if (c instanceof HTMLCanvasElement) data = c.getContext('2d').getImageData(0, 0, w, h).data;
  else { const t = document.createElement('canvas'); t.width = w; t.height = h; const g = t.getContext('2d'); g.drawImage(c, 0, 0); data = g.getImageData(0, 0, w, h).data; }
  return { w, h, rgba: data.buffer };
}

const handlers = {
  list() {
    if (loadError) return { meta: null, categories: [], assets: [], errors: [loadError, ...errors], failed: true };
    return {
      meta: mod.STUDIO || null,
      categories: Array.isArray(mod.ASSET_CATEGORIES) ? mod.ASSET_CATEGORIES.filter((c) => c && c.id) : [],
      assets: [...byId.values()].map((n) => n.plain),
      errors: [...errors],
    };
  },
  raw({ asset, poses }, transfer) {
    const n = byId.get(asset);
    if (!n) throw new Error(`unknown asset ${asset}`);
    return (poses || []).map((pose) => {
      try {
        const r = renderRaw(n, pose);
        if (r) transfer.push(r.rgba);
        return r ? { pose, ...r } : { pose, error: 'no canvas' };
      } catch (err) {
        return { pose, error: String(err && err.message || err) };
      }
    });
  },
  play({ asset }) { const n = byId.get(asset); if (n && typeof n.src.play === 'function') n.src.play(); return true; },
  stop({ asset }) { const n = byId.get(asset); if (n && typeof n.src.stop === 'function') n.src.stop(); return true; },
};

const ready = load();
addEventListener('message', async (e) => {
  if (e.origin !== STUDIO_ORIGIN || !e.data || typeof e.data !== 'object') return;
  const { id, type, args } = e.data;
  if (!handlers[type]) return;
  await ready;
  const transfer = [];
  try {
    const data = await handlers[type](args || {}, transfer);
    e.source.postMessage({ id, ok: true, data }, { targetOrigin: STUDIO_ORIGIN, transfer });
  } catch (err) {
    e.source.postMessage({ id, ok: false, error: String(err && err.message || err) }, STUDIO_ORIGIN);
  }
});
ready.then(() => parent.postMessage({ type: 'host-ready', project: q.get('project'), v: q.get('v') }, STUDIO_ORIGIN));
