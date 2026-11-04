# The engine — what a game builds on

A game imports its **own copy** of this folder (`games/<id>/engine/`, from `game/`: `../engine/…`).
Its version is `version.json`; what changed is `CHANGELOG.md`. Don't edit a game's copy: fix the
harness's `engine/`, then pull it in (`node cli/yak.mjs engine-pull <game>`). A change made in a
game's copy anyway shows up as a local change in `node cli/yak.mjs engine <game>`, and a pull never
goes over it without `--force`.

## What a game uses
| Module | For |
|---|---|
| `shell/runtime.js` | `createScreen`, `createInput` (keys + pad + mouse), `runLoop` (fixed step), `Director` (scenes), `rng`, `hash`, `ditherFill`, `alphaFill`, `mosaic` |
| `shell/systems.js` | the game as systems, each owning a slice of the state, with per-system save versions (`createWorld`, `stepWorld`, `saveWorld`, `loadWorld`) |
| `shell/saves.js` | save slots: `openSlots` (IndexedDB, backups, summaries) or `slotStore` (localStorage); migrations, kept unreadable saves, export / import |
| `shell/font.js`, `shell/widgets.js`, `shell/nineslice.js` | pixel text, boxes and buttons drawn from the art registry, so the person can repaint them |
| `shell/perf.js` | frame and step timing |
| `art/pix.js` | the painter: `Pix` (materials + shades), `bayer`, `hexRgb`, `recolor`, `silhouette` |
| `art/registry.js` | `createArt`: the art contract (`game/sprites.js`) |
| `art/font-art.js`, `art/widget-art.js`, `art/parts.js` | the font and UI widgets as art; reusable stamped parts |
| `sound/index.js` | `defineSound`: songs, effects and instruments (`game/sound.js`) |
| `link/studio.js` | `studio.knob` / `studio.variant` (F8), `studio.onMoment` / `loadMoment` (F9) — inert outside the studio |

## What the studio and the CLI read with it
`art/edits.js`, `art/propagate.js`, `sound/edits.js`, `sound/notation.js`, `sound/song.js`,
`sound/render.js`, `sound/midi.js`, `sound/pitch.js`. The studio runs the **harness's** copy of these
for every game (game code runs only in each game's own sandboxed frames and windows), so a game on
an older copy depends on these rules:
- **Formats.** `EDITS_FORMATS` (`art/edits.js`) and `SOUND_EDIT_FORMATS` (`sound/edits.js`) list
  every format this engine reads, as plain strings. A format's meaning never changes: a new meaning
  gets a new string, added to the list, and an old one is never dropped. Before the studio writes a
  file into a game it reads that list from the game's copy (as text, `studio/data/formats.mjs`) and
  writes only a format the game reads. If it can't, nothing is saved and it says to pull the engine.
  So a new format adds a writer for the old one too, or games still on the old one can't be edited.
- **The generated index modules** (`editsIndexSource` in both) are frozen byte for byte
  (`tests/formats.test.mjs`): every game imports them.
- **Sound preview.** The Sound view plays with the harness's engine. When a game's copy may sound
  different (a **Changes sound** entry since its version, or its own changes to `sound/`), the view
  says so. The CLI's sound commands use the game's own copy, so `render-song` measures what the game
  plays.

## Frozen, and changes that move things
- **Frozen:** `hash`, `rng` (`shell/runtime.js`), `bayer` (`art/pix.js`) and `mulberry32`
  (`sound/synth.js`). Games build maps, art and music from them, and saves keep only what the
  player changed, so their output for the same input never changes, in any version.
  `tests/engine.test.mjs` pins it. Need something different? Add a new function.
- **Moves things:** a change to how `Pix` shades, how widgets or the font draw, or how a synth voice
  sounds changes every asset or song built on it, under the person's painted patches and sound
  edits. Allowed, but its changelog entry starts with **Moves art** or **Changes sound**, so a game
  pulls it knowingly and looks at its sheets (`yak sheet`) and songs afterwards. Prefer a new option
  whose default is the old behaviour.
