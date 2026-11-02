# Yak Trail — engineering

How the code is laid out, how to run and check it. Fill it in as the code grows: one line per file
that owns something, one line per cache (and what rebuilds it), one line per test fixture or budget.
A big game reads skill optimize before it grows (`docs/LESSONS.md` → building big).

## Run
| What | Command |
|---|---|
| Play it | Pixel Yak → Games → Play, or `npm run web` and open `/games/yak-trail/game/` |
| Rules as tests | `node --test "games/yak-trail/dev/**/*.test.mjs"` |
| Capture tests | `node tools/run-captures.mjs yak-trail` (`dev/tests/*.json`; screenshots in `dev/out/`) |
| Structure + art | `node cli/yak.mjs check yak-trail` |

## Where the code lives
| File | Owns |
|---|---|
| `game/main.js` | boot: screen, input, director, `useFontArt`, widgets, the record; test hooks |
| `game/level.js` | the trail as data (`COURSE`) and `buildLevel()`: per-column heights, rocks, tufts, cairns |
| `game/sim.js` | the rules: trot, hop, munch, walls, falls, checkpoints, summit; `TUNE` holds the feel |
| `game/world.js` | drawing: backdrop, ground, props, birds, effects, the yak's pose for a run |
| `game/scenes/title.js` · `play.js` · `pause.js` · `finish.js` | the screens; pause and finish are overlays on play |
| `game/sprites.js` | the art contract: every visual, plus the engine's font and widgets |
| `game/art/` | generators: `yak`, `trail` (ground, rocks, tufts, cairns, summit), `sky`, `critters` (bird, effects), `ui` (logo, icons) |
| `design/palette.js` | the palette; Yak Trail's own materials are ids 100+ |

## How it fits together
- **Ground.** `level.ground[x]` is the surface height of every pixel column (`GAP` = none);
  `level.top[x]` adds the rocks' tops: that is what the yak stands on. A wall is a column that rises
  suddenly (more than 3 px) from its neighbour; slopes rise gradually and are trotted.
- **One ground picture.** `world.js` draws the whole trail's ground once into one long canvas (fill
  tiled on the world grid, the surface strip laid along each column) and rebuilds it only when a ground
  tile's canvas changes (the user repainted it).
- **Events.** `step()` lists what happened in `run.events` (`hop land munch checkpoint fall summit`);
  `play.js` turns them into effects. Sound can listen to the same events.
- **Tuning.** `TUNE` in `sim.js` is one shared object: change `TUNE.trot` or `TUNE.hop` and the next
  tick uses it.
- **Test hooks.** `?scene=play&at=<x>` starts a climb at x; `window.__yak` has `scene()`, `run()`,
  `place(x)`, `art`, `measure`; `window.__studioMoment()` is what F9 attaches.

## Tests
| What | Where |
|---|---|
| The rules, played on the real trail in Node (incl. "the whole trail can be climbed") | `dev/sim.test.mjs` |
| The art contract (sizes, anchors, anims) | `dev/rules.test.mjs` |
| Boot, title → play, hop a rock, fall back to a cairn, pause + help, the summit, a repainted glyph | `dev/tests/*.json` |

## Saves
One record in `localStorage` through `slotStore('yak-trail', { slots: [1], version: 1 })`:
`{ best (ticks), bestTufts, timer }`. A new version number drops old records (they hold nothing
precious).
