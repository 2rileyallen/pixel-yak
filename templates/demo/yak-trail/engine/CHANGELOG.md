# Engine changelog

Every game keeps its own copy of this engine in `games/<id>/engine/`, at the version in its
`engine/version.json`. A change here reaches a game only when it is pulled in on purpose:
`node cli/yak.mjs engine <game>` shows what's new, `engine-pull <game>` brings it in, and the game's
full checks run before it's kept. One entry per version, newest first. Say what a game must change
when it pulls (a renamed function, a new argument), and never change what an existing function
returns for the same input in a way that moves art, maps or music (see README.md → Frozen).

## 3 — 2026-11-04
- `art/edits.js`: `EDITS_FORMATS`, every edit format this engine reads (an old one is never
  dropped). `checkEdit(edit, formats?)` accepts any of them; its message for a wrong format changed.
- `sound/edits.js`: the same, `SOUND_EDIT_FORMATS` and `checkSoundEdit(ed, formats?)`.
- Nothing a game calls changed what it returns for a file it already read: no art moves, no sound
  changes. A game on v2 keeps working with the studio as it is (the studio writes it `@1`, which it
  reads); pull v3 so a later engine's formats can be added beside the old ones.

## 2 — 2026-11-02
- **Games get their own copy.** This file, `version.json` and `README.md` travel with the copy.
- `shell/systems.js` (new): a game as a list of systems, each owning one slice of the state, with
  per-system save versions and migrations (`createWorld`, `stepWorld`, `saveWorld`, `loadWorld`).
- `shell/saves.js`: `migrations` (one step per version) beside `migrate`; a save that can't be read
  is kept aside before anything goes over it (`kept(n)`); `exportSlot` / `importSlot`; `persist()`.
  Nothing a game already calls changed.

## 1 — 2026-11-02
- The engine as it was when Pixel Yak was built: `shell/` (screen, loop, input, font, widgets,
  saves, perf), `art/` (Pix painter, registry, edits, propagate, font and widget art), `sound/`,
  `link/` (F8 tuning, F9 moments).
