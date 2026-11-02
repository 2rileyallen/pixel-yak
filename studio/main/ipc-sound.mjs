// studio/main/ipc-sound.mjs — the Sound view's bridge to the disk (auto-loaded by main.mjs):
// where a game's sound lives, the user's sound edits (read, save, revert) and sound lessons.
// A save goes straight to a running game too: it re-reads the edits and the song swaps its
// notes while playing (engine/sound/index.js). Game code never runs here — the studio gets
// song data from a sandboxed frame on the game's own origin (studio/ui/js/sound-host.js).
export function register({ handle, D, games }) {
  const tellGame = (pid) => {
    const g = games.get(pid);
    if (g && !g.win.isDestroyed()) g.win.webContents.send('sound-edits', {});
  };
  const pidOf = (pid) => D.assertId('project', pid);

  handle('sound:info', async (pid) => {
    const i = await D.soundInfo(pidOf(pid));
    return { module: i.moduleRel, edits: i.editsRel, hasModule: i.hasModule, design: i.design };
  });
  handle('sound:edits', (pid) => D.readSoundEdits(pidOf(pid)));

  // { edits: [song | sfx | instruments edit…], lessons: [lesson…] } → { written, lessons }
  handle('sound:save', async (pid, payload) => {
    pidOf(pid);
    const { edits = [], lessons = [] } = payload || {};
    const written = [];
    for (const ed of (Array.isArray(edits) ? edits : []).slice(0, 20)) written.push(await D.writeSoundEdit(pid, ed));
    let n = 0;
    for (const l of (Array.isArray(lessons) ? lessons : []).slice(0, 50)) {
      try { await D.appendSoundLesson(pid, l); n++; } catch (err) { console.warn('[sound] lesson not recorded:', err.message); }
    }
    tellGame(pid);
    return { written, lessons: n };
  });

  handle('sound:revert', async (pid, kind, id) => { await D.deleteSoundEdit(pidOf(pid), kind, id || null); tellGame(pid); return true; });
  handle('sound:lessons', (pid, opts) => D.readSoundLessons(pidOf(pid), opts || {}));
  handle('sound:summary', (pid) => D.soundLessonSummary(pidOf(pid)));
}
