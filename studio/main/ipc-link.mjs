// studio/main/ipc-link.mjs — the studio side of engine/link (docs/contracts/TUNING.md, MOMENTS.md).
// - F8 Keep in a game window → games/<id>/tuning/<slug>.json + a lesson line, and a toast in the
//   studio ("Kept B for Title music").
// - F9 → adds to the moment main.mjs captures: the game's state (up to 20,000 characters), the
//   last ~5 seconds as one picture, the live tuning values, and — held here until the user saves
//   the request — a save-state, written next to the request as <R-id>-save.json.
import { ipcMain } from 'electron';

const STATE_MAX = 20000;      // the state an F9 moment carries to the request dialog
const STATE_FILE_OVER = 8000; // a longer state is kept whole in the save-state file too (a request's body is small)
const KEEP_MOMENTS = 8;
// engine/link's moment, or the older window.__studioMoment() (state only)
const MOMENT_JS = `(async () => {
  if (window.__yakLink && typeof window.__yakLink.moment === 'function') return await window.__yakLink.moment();
  if (typeof window.__studioMoment === 'function') return JSON.stringify({ state: window.__studioMoment() });
  return null;
})()`;

const held = new Map(); // momentId -> what goes into the save file once the request exists

export function register({ handle, D, games, toStudio, onMoment }) {
  // which game a message came from: only windows the studio opened may keep a choice
  const gameOf = (sender) => {
    for (const [pid, g] of games) if (!g.win.isDestroyed() && g.win.webContents === sender) return pid;
    return null;
  };

  ipcMain.handle('link:keep', async (e, choice) => {
    const pid = gameOf(e.sender);
    if (!pid) return { ok: false, error: 'only a game the studio opened can keep a choice' };
    try {
      const r = await D.keepTuning(pid, choice);
      toStudio('link:kept', { projectId: pid, name: r.record.name, kind: r.record.kind, label: r.record.label, note: r.record.note, file: r.file });
      return { ok: true, file: r.file };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  onMoment(async (projectId, win, moment) => {
    let raw = null;
    try {
      raw = await Promise.race([
        win.webContents.executeJavaScript(MOMENT_JS, true),
        new Promise((r) => setTimeout(() => r(null), 2500)),
      ]);
    } catch { /* the game's page is gone or broken: the screenshot and console still go */ }
    let m = null;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { /* not JSON */ }
    if (!m || typeof m !== 'object') return {};
    const stateText = m.state == null ? null : JSON.stringify(m.state);
    const cut = !!stateText && stateText.length > STATE_MAX;
    const long = !!stateText && stateText.length > STATE_FILE_OVER;
    const tuning = Array.isArray(m.tuning) ? m.tuning.slice(0, 50) : [];
    const out = {
      state: stateText ? stateText.slice(0, STATE_MAX) : null, stateCut: cut,
      strip: typeof m.strip === 'string' && m.strip.startsWith('data:image/png;base64,') ? m.strip : null,
      frames: Number(m.frames) || 0, seconds: Number(m.seconds) || 0, tuning,
      hasSave: m.save != null, momentId: null,
    };
    if (m.error) out.gameError = String(m.error).slice(0, 300);
    // the save (and a state too long for the request) waits here until the request is saved
    if (m.save != null || long) {
      const id = `M-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      held.set(id, { game: projectId, at: moment.at, state: m.state, save: m.save ?? null, tuning, console: moment.console });
      while (held.size > KEEP_MOMENTS) held.delete(held.keys().next().value);
      out.momentId = id;
    }
    return out;
  });

  // The user saved the request an F9 moment opened: write its save-state next to it.
  handle('link:attach-moment', async (momentId, scope, requestId) => {
    const m = held.get(String(momentId));
    if (!m) throw new Error('that moment is no longer held (the studio keeps the last 8 until their request is saved)');
    const file = await D.attachJson(scope === '_studio' ? scope : D.assertId('project', scope), requestId, 'save', D.momentFile({ ...m, request: requestId }));
    held.delete(String(momentId));
    return file;
  });
}
