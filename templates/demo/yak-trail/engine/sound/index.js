// engine/sound/index.js — what a game imports for its music and sound effects
// (docs/contracts/SOUND.md). A game's game/sound.js hands its data to defineSound():
//
//   export const SOUND = defineSound({
//     game: 'my-game', instruments: INSTRUMENTS, songs: SONGS, sfx: SFX,
//     edits: SOUND_EDITS, editsModule: new URL('./sound/edits/index.js', import.meta.url).href,
//   });
//   SOUND.unlock()          from the first click / key press (browsers start audio only then)
//   SOUND.music('theme')    play a song (null stops); SOUND.play('coin') a sound effect
//
// The user's edits from Pixel Yak's Sound view are laid over the AI's songs here, at load, and
// again live while the studio runs the game. Nothing touches audio until unlock(), so the
// module also imports in Node (the CLI renders songs from it; tests check it).
import { compileSong, compileSfx } from './song.js';
import { applySoundEdits, parseEditsIndexSource, EMPTY_EDITS } from './edits.js';
import { createPlayer } from './player.js';

export * from './notation.js';
export * from './song.js';
export * from './edits.js';
export * from './render.js';
export { createEngine } from './synth.js';
export { createPlayer } from './player.js';

export const SOUND_RUNTIME = 'pixel-yak-sound@1';

export function defineSound({ game = '?', instruments = {}, songs = {}, sfx = {}, edits = null, editsModule = null } = {}) {
  const base = { instruments, songs, sfx };
  const warned = new Set();
  const warnOnce = (m) => { if (!warned.has(m)) { warned.add(m); console.warn(m); } };
  let cur = null;
  const songCache = new Map(), fxCache = new Map();
  let edited = EMPTY_EDITS;

  function apply(next) {
    edited = next || EMPTY_EDITS;
    cur = applySoundEdits(base, edited);
    songCache.clear(); fxCache.clear();
    for (const d of cur.report.drift) warnOnce(`[sound] ${game}: the AI changed ${d} after the user edited it — review it in Pixel Yak's Sound view`);
    for (const o of cur.report.orphans) warnOnce(`[sound] ${game}: a sound edit points at ${o}, which no longer exists — it is ignored`);
  }
  apply(edits);

  // compiled (playable) forms, cached until the edits change
  function song(id) {
    if (!cur.songs[id]) return null;
    if (!songCache.has(id)) {
      const c = compileSong(cur.songs[id], cur.instruments, { id });
      for (const w of c.warnings) warnOnce(`[sound] ${game} song ${id}: ${w}`);
      songCache.set(id, c);
    }
    return songCache.get(id);
  }
  function effect(id) {
    if (!cur.sfx[id]) return null;
    if (!fxCache.has(id)) {
      const c = compileSfx(cur.sfx[id], cur.instruments);
      for (const w of c.warnings) warnOnce(`[sound] ${game} sfx ${id}: ${w}`);
      fxCache.set(id, c);
    }
    return fxCache.get(id);
  }

  let player = null, starting = null, current = null, want = null;
  const vols = {};
  function start(id, opts = {}) {
    const c = song(id);
    if (!c) { warnOnce(`[sound] ${game}: no song "${id}"`); return; }
    current = id;
    player.send({ t: 'play', song: c, fade: opts.fade ?? 0.6, at: opts.at, range: opts.range });
  }

  const api = {
    game,
    runtime: SOUND_RUNTIME,
    base,
    get songs() { return cur.songs; },
    get sfx() { return cur.sfx; },
    get instruments() { return cur.instruments; },
    get report() { return cur.report; },
    get edits() { return edited; },
    get player() { return player; },
    song,
    effect,
    // Start audio. Call it from a click or key handler; safe to call again.
    unlock() {
      if (player) { player.resume(); return Promise.resolve(player); }
      if (!starting) {
        starting = createPlayer().then((p) => {
          player = p;
          if (!p) return null;
          if (Object.keys(vols).length) p.send({ t: 'volume', ...vols });
          if (want) { const w = want; want = null; start(w.id, w.opts); }
          return p;
        }).catch((err) => { console.warn(`[sound] ${game}: audio could not start: ${err.message}`); starting = null; return null; });
      }
      return starting;
    },
    // Play a song by id (null = stop). Before unlock() it waits and starts on unlock.
    music(id, opts = {}) {
      if (id != null && id === current && !opts.restart) return;
      if (!player) { want = id == null ? null : { id, opts }; current = id ?? null; return; }
      if (id == null) { current = null; player.send({ t: 'stop', fade: opts.fade ?? 0.8 }); return; }
      start(id, opts);
    },
    stopMusic(fade = 0.8) { api.music(null, { fade }); },
    current: () => current,
    // A sound effect by id. opts.vol scales it (0–2).
    play(id, opts = {}) {
      if (!player) return;
      const c = effect(id);
      if (c) player.send({ t: 'sfx', sfx: c, vol: opts.vol ?? 1 });
      else warnOnce(`[sound] ${game}: no sound effect "${id}"`);
    },
    // { music, sfx, master }: 0–2 each (a game's settings menu)
    volume(v) { Object.assign(vols, v); if (player) player.send({ t: 'volume', ...v }); },
    // Replace the user's edits (live reload); a playing song swaps its notes in place.
    setEdits(next) {
      apply(next);
      if (player && current) { const c = song(current); if (c) player.send({ t: 'update', song: c }); }
    },
  };

  // Live edits: a game launched from Pixel Yak hears "the user saved a sound edit" and re-reads
  // the edits index (a fetch, not a re-import, so nothing piles up in the module cache).
  const link = typeof globalThis !== 'undefined' ? globalThis.studioLink : null;
  if (editsModule && link && typeof link.onSoundEdits === 'function') {
    link.onSoundEdits(async () => {
      try {
        const r = await fetch(editsModule, { cache: 'no-store' });
        api.setEdits(r.ok ? parseEditsIndexSource(await r.text()) : null);
        console.info(`[sound] ${game}: studio sound edits reloaded`);
      } catch (err) { console.warn(`[sound] ${game}: could not reload sound edits: ${err.message}`); }
    });
  }
  return api;
}
