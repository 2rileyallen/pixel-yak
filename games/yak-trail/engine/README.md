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
`sound/render.js`, `sound/midi.js`, `sound/pitch.js`. The studio and the CLI use the **harness's**
copy of these to read every game's edits and songs, so their file formats are contracts
(`docs/contracts/ART.md`, `SOUND.md`): a new version keeps reading the old.

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
