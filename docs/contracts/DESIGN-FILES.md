# Design files

A **design file** says how a game looks, sounds or plays — like the DESIGN.md files people give an
AI to build a website in a brand's style, but for a game. Pixel Yak keeps a **library** of them on
three shelves; every game keeps its **own copies**, which grow with it.

```
designs/<shelf>/<id>/          the library (ships with Pixel Yak)        shelf = art | sound | game
local/designs/<shelf>/<id>/    your own entries (private, same shape)    id = lowercase-with-dashes
games/<game>/design/           a game's own copies: art.md + palette.js, sound.md + instruments.js, game.md
```

## An entry
Every entry is a folder with a `DESIGN.md` and, for art and sound, its **code twins**:

| Shelf | Files | Code twins |
|---|---|---|
| art | `DESIGN.md`, `palette.js`, optional `sample.js`, `fx.js`, `parts/` | `palette.js` is the look's palette (below); `sample.js` exports `SAMPLE_ART` (art-contract entries the Designs view draws) |
| sound | `DESIGN.md`, `instruments.js`, `example-song.js` | the sound engine's instruments and an example (docs/contracts/SOUND.md) |
| game | `DESIGN.md` | none |

`DESIGN.md` starts with `# Title`, then **one plain paragraph** (under ~45 words — the summary on
the library card and in `yak designs`), then `##` sections:

- **art:** the look in one paragraph · resolution and scale · palette and material roles · shapes,
  outlines, shading, light · motion · UI (frames, font) · style knobs · do / don't · exemplars · how
  to ask for an asset in this look · changelog
- **sound:** the mood · tempo and meter · scales and modes · instruments · song form · mix · effects
  language · do / don't · how to ask for a track · changelog
- **game:** this game (filled in at kickoff) · the fantasy and core loop · pacing and progression ·
  what the screen shows and explains · controls · what to build for its size · do / don't · lessons
  from games that used it · how to ask for a feature · changelog

The changelog is newest first, one dated line per lesson that shaped the entry. Write plain English
and give every rule its reason; a library entry never names another game's characters or story.

### palette.js (art)
What every new game's `sprites.js` and starter art import, so any art entry is a drop-in:

```js
import { hexRgb } from '../../../engine/art/pix.js';   // same depth from designs/art/<id>/ and games/<g>/design/
export const M = { INK: 1, SKIN: 2, CLOTH: 4, GOLD: 22, GLOW: 27 /* … */ };   // material ids; a game adds its own from 100
export const HEXRAMPS = { [M.INK]: ['#06050d', '#0c1024', '#1b2040', '#2c345e', '#46507e'] /* 5 stops each, dark → light */ };
export const RAMPS = {};      // the same as [r, g, b]
export const GLOW = new Set([M.GLOW]);                          // emissive materials
export const C = (mat, shade) => HEXRAMPS[mat][shade];          // a CSS colour, for code-drawn UI and light
export const FIN = { ramps: RAMPS, glow: GLOW, outline: '#0c1024', rim: 'top' };   // Pix.finish options
export const FIN_FX = { /* effects */ }, FIN_FLAT = { /* tiles, no outline */ };
```
Rules: every hex in a palette is **unique** (the studio reads a painted pixel back to material +
shade by its colour); the starter art needs one of `GLOW`/`SOUL`/`SKY`/`CLOTH` and one of
`METAL`/`GOLD`/`STONE`.

## Use, promote, pull
| Step | Command | What happens |
|---|---|---|
| **Use** | `node cli/yak.mjs design-use <game> <shelf> <id>` (or **New game** / `new-game --art <id> --sound <id> --game <id>`) | Copies the entry into `games/<game>/design/`: `DESIGN.md` → `<shelf>.md` (with a note saying where it started), code twins alongside; `game.json` `designs.<shelf>` records the id. **Refuses** when the game already has its own copy — that copy holds the game's learned rules. `--force` (only when the user asks) moves the old files to `design/archive/<shelf>-<time>/` first, keeps the user's first notes, and warns if the user's pixel edits or the game's code use materials the new palette lacks. |
| **Promote** | `node cli/yak.mjs design-promote <game> <shelf> <newId> [--local] [--title ".."]` | Copies `design/<shelf>.md` + its code twins into `designs/<shelf>/<newId>/` (public) or `local/designs/…` (`--local`), drops the copy note and the user's first notes, and adds a changelog line "Promoted from …". Never copies `lessons/` or `archive/`. Then rewrite it as a general entry. |
| **Pull** | `node cli/yak.mjs design-diff <game> <shelf> [--from <id>]` | Shows the game's copy (`-`) against a library entry (`+`). A pull is done **by hand**, bringing over only what the user picks. |

**Nothing flows silently.** A library change never restyles a game; a game's change never touches
the library until someone promotes it.

## Example
```
$ node cli/yak.mjs new-game moss-mill --name "Moss Mill" --art cozy-factory --game factory-automation
$ node cli/yak.mjs design-use moss-mill art gba-bright
error: games/moss-mill already has its own art design (… started from designs/art/cozy-factory) …
$ node cli/yak.mjs design-diff moss-mill art          # later: what's new in cozy-factory?
$ node cli/yak.mjs design-promote moss-mill art mossy-mill --local --title "Mossy Mill"
```
