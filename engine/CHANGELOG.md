# Engine changelog

Every game keeps its own copy of this engine in `games/<id>/engine/`, at the version in its
`engine/version.json`. A change here reaches a game only when it is pulled in on purpose:
`node cli/yak.mjs engine <game>` shows what's new, `engine-pull <game>` brings it in, and the game's
full checks run before it's kept. One entry per version, newest first. Say what a game must change
when it pulls (a renamed function, a new argument), and never change what an existing function
returns for the same input in a way that moves art, maps or music (see README.md → Frozen).

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
