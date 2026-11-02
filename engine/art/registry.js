// engine/art/registry.js — THE ART CONTRACT every game uses (docs/contracts/ART.md).
//
// Game code never draws pixels itself; it asks for sprite(id, pose). Each entry declares a
// fixed frame size (fw x fh), an anchor (ax, ay — usually the feet), its pose names and
// anims, and a draw(pose) → canvas generator:
//   { name, category, tags, fw, fh, ax, ay, poses: [...], anims: { name: [poses] },
//     defaultAnim, description, gen?: { style, v, by, date }, draw(pose) }
// Upgrading art = replacing draw() while keeping id, size, anchor and pose names.
//
// On top of the generators sit the user's Pixel Yak edits (core/art/edits.js):
// patched poses get the user's pixels applied after draw(); baked poses and frames added
// in the studio are pure pixel data and skip draw(). A game launched from the studio
// receives edits live (no restart) through window.studioLink.

import {
  makePalette, effectivePoses, effectiveAnims, applyPatchToCanvas, bakedToCanvas,
  canvasHash, checkEdit, parseEditsIndexSource,
} from './edits.js';

export const ART_RUNTIME = 'core-art@1';

// project:     the project id (used in warnings)
// entries:     { id: entry } — the generators
// palette:     { materials: { NAME: id }, ramps: { id: ['#hex' x5] }, glow?: [NAME] }
// edits:       the EDITS object from the project's generated <editsDir>/index.js
// editsModule: absolute URL of that index module (enables live reload from the studio)
export function createArt({ project = '?', entries, palette, edits = {}, editsModule = null }) {
  const pal = makePalette(palette);
  const ART = {};
  const cache = new Map(); // id -> Map(pose -> canvas)
  const warned = new Set();
  let EDITS = {};

  const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); console.warn(msg); } };

  const validEdit = (id, ed) => {
    if (!ed) return null;
    if (!entries[id]) { warnOnce(`orphan:${id}`, `[art] ${project}: studio edits for unknown art id "${id}" are ignored`); return null; }
    const errs = checkEdit(ed);
    if (errs.length) { warnOnce(`bad:${id}`, `[art] ${project}: edits for "${id}" ignored: ${errs.join('; ')}`); return null; }
    return ed;
  };
  const merge = (id) => {
    const e = entries[id];
    const merged = ART[id] || (ART[id] = {});
    Object.assign(merged, e, { poses: effectivePoses(e.poses, EDITS[id]), anims: effectiveAnims(e.anims, EDITS[id]) });
  };

  // Replace every edit at once (startup, or the fallback when we don't know what changed).
  function setEdits(next) {
    EDITS = {};
    for (const [id, ed] of Object.entries(next || {})) { const ok = validEdit(id, ed); if (ok) EDITS[id] = ok; }
    for (const id of Object.keys(entries)) merge(id);
    cache.clear();
  }

  // Replace one asset's edit (null = the user reverted it); only that asset's frames re-render.
  function setEdit(id, ed) {
    if (!entries[id]) { if (ed) validEdit(id, ed); return; }
    const ok = validEdit(id, ed);
    if (ok) EDITS[id] = ok; else delete EDITS[id];
    merge(id);
    cache.delete(id);
  }

  function render(id, pose) {
    const e = entries[id];
    const ed = EDITS[id];
    const pe = ed && ed.poses && ed.poses[pose];
    let c;
    if (pe && pe.mode === 'baked') {
      c = bakedToCanvas(pe, ed.legend || {}, pal, e.fw, e.fh);
    } else {
      c = e.draw(pose);
      if (pe && pe.mode === 'patch') {
        if (pe.base && canvasHash(c) !== pe.base) {
          warnOnce(`drift:${id}:${pose}`, `[art] ${project}: ${id}:${pose} generator changed since the user painted on it — review it in Pixel Yak`);
        }
        c = applyPatchToCanvas(c, pe, ed.legend || {}, pal);
      }
    }
    if (c.width !== e.fw || c.height !== e.fh) {
      warnOnce(`size:${id}:${pose}`, `[art] ${id}:${pose} is ${c.width}x${c.height}, contract says ${e.fw}x${e.fh}`);
    }
    return c;
  }

  function sprite(id, pose) {
    const e = ART[id];
    if (!e) throw new Error(`sprite: unknown art id "${id}"`);
    const p = pose ?? e.poses[0];
    let byPose = cache.get(id);
    if (!byPose) cache.set(id, (byPose = new Map()));
    let c = byPose.get(p);
    if (!c) { c = render(id, p); byPose.set(p, c); }
    return c;
  }

  // The generator's own output, without studio edits (null for studio-added frames).
  function rawSprite(id, pose) {
    const e = entries[id];
    if (!e) throw new Error(`rawSprite: unknown art id "${id}"`);
    return e.poses.includes(pose) ? e.draw(pose) : null;
  }

  // Pose for an animation at a given tick (fps = frames per second at 60 ticks/s).
  function animPose(id, anim, tick, fps = 6) {
    const e = ART[id];
    const frames = (e.anims && e.anims[anim]) || [anim];
    return frames[Math.floor((tick * fps) / 60) % frames.length];
  }

  // Draw a sprite so its anchor lands on (x, y). flip mirrors around the anchor.
  function drawSprite(g, id, pose, x, y, flip = false) {
    const e = ART[id];
    const c = sprite(id, pose);
    if (!flip) {
      g.drawImage(c, Math.round(x - e.ax), Math.round(y - e.ay));
    } else {
      g.save();
      g.translate(Math.round(x + e.ax), Math.round(y - e.ay));
      g.scale(-1, 1);
      g.drawImage(c, 0, 0);
      g.restore();
    }
  }

  // No ids: drop every rendered frame. With ids: only those assets' frames.
  const clearArtCache = (ids) => { if (Array.isArray(ids)) for (const id of ids) cache.delete(id); else cache.clear(); };

  // Registry entries in the shape Pixel Yak lists (games/<id>/assets.js).
  function studioAssets() {
    return Object.keys(entries).map((id) => {
      const e = entries[id];
      return {
        id,
        name: e.name || id,
        category: e.category || 'misc',
        tags: e.tags || [],
        kind: 'visual',
        fw: e.fw, fh: e.fh, ax: e.ax ?? null, ay: e.ay ?? null, // null = no anchor (portraits, backdrops)
        poses: [...e.poses],
        anims: { ...(e.anims || { default: e.poses }) },
        defaultAnim: e.defaultAnim || Object.keys(e.anims || { default: 0 })[0],
        description: e.description || '',
        gen: e.gen || null,
        getRaw: (pose) => rawSprite(id, pose),
        getCanvas: (pose) => sprite(id, pose),
      };
    });
  }

  // What the studio needs to read pixels back as material + shade.
  const studioMeta = () => ({
    version: 2,
    runtime: ART_RUNTIME,
    project,
    palette: { materials: palette.materials, ramps: palette.ramps, glow: palette.glow || [] },
  });

  setEdits(edits);

  // Live edits: the studio's game window preload exposes window.studioLink. The studio says which
  // assets changed ({ assets: [ids] }); we fetch just those edit files and re-render just those
  // assets. Without a list we re-read the whole index. Both are fetches (no module is
  // re-imported, so nothing piles up in the module cache save after save).
  const link = typeof globalThis !== 'undefined' ? globalThis.studioLink : null;
  if (editsModule && link && typeof link.onArtEdits === 'function') {
    const latest = new Map(); // id -> request number, so an older response never wins
    let seq = 0;
    const get = async (url) => { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? r.text() : r.status === 404 ? null : Promise.reject(new Error(`${r.status} ${url}`)); };
    link.onArtEdits(async (info) => {
      const ids = info && Array.isArray(info.assets) ? info.assets.filter((id) => typeof id === 'string') : null;
      try {
        if (ids) {
          await Promise.all(ids.map(async (id) => {
            const n = ++seq;
            latest.set(id, n);
            const text = await get(new URL(`${encodeURIComponent(id)}.json`, editsModule));
            if (latest.get(id) === n) setEdit(id, text ? JSON.parse(text) : null);
          }));
          console.info(`[art] ${project}: studio edits reloaded (${ids.join(', ')})`);
        } else {
          const text = await get(editsModule);
          setEdits(text ? parseEditsIndexSource(text) : {});
          console.info(`[art] ${project}: studio edits reloaded`);
        }
      } catch (err) {
        console.warn(`[art] ${project}: could not reload studio edits: ${err.message}`);
      }
    });
  }

  return { ART, sprite, rawSprite, animPose, drawSprite, clearArtCache, setEdits, setEdit, studioAssets, studioMeta, palette: pal };
}
