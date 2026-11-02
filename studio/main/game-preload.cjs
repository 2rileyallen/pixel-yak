// studio/main/game-preload.cjs — loaded into game windows the studio opens. Gives the game's
// art registry (core/art/registry.js) a way to hear "the user saved new pixel edits" so
// sprites update live without restarting the game (and the sound engine the same for the
// user's sound edits), and engine/link (F8 tuning) a way to keep a choice. Nothing else is exposed
// to game code.
// The callback gets { assets: [ids] } (only those assets changed) or { assets: null } (re-read all).
const { contextBridge, ipcRenderer } = require('electron');

const listeners = [];
ipcRenderer.on('art-edits', (e, info) => {
  const assets = info && Array.isArray(info.assets) ? info.assets.filter((id) => typeof id === 'string').slice(0, 5000) : null;
  for (const cb of listeners) {
    try { cb({ assets }); } catch (err) { console.error('[studioLink]', err); }
  }
});

// "the user saved a sound edit" (engine/sound/index.js re-reads the sound edits index)
const soundListeners = [];
ipcRenderer.on('sound-edits', () => {
  for (const cb of soundListeners) {
    try { cb({}); } catch (err) { console.error('[studioLink]', err); }
  }
});

contextBridge.exposeInMainWorld('studioLink', {
  inStudio: true,
  onArtEdits: (cb) => { if (typeof cb === 'function') listeners.push(cb); },
  // F8 Keep: the studio writes games/<id>/tuning/<slug>.json + a lesson (studio/main/ipc-link.mjs)
  keep: (choice) => ipcRenderer.invoke('link:keep', choice),
  onSoundEdits: (cb) => { if (typeof cb === 'function') soundListeners.push(cb); },
});
