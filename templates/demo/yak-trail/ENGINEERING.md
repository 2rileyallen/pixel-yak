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
| Structure + art + sound | `node cli/yak.mjs check yak-trail` |
| The checks for what changed | `node cli/yak.mjs test yak-trail` (`checks.json`; `--full` everything) |
| Hear a song without listening | `node cli/yak.mjs render-song yak-trail trail --out scratch/trail.wav` (prints length, peak, loudness) |
| Tune outside the studio | open the game with `?tune=1` (F8 works; Keep copies the choice instead of saving it) |
| Reproduce an F9 moment | a capture test whose page is `games/yak-trail/game/index.html?moment=../requests/<R-id>-save.json` (example: `dev/tests/moment.json`) |
| The teaser clip | `node cli/yak.mjs clip yak-trail teaser` (needs ffmpeg; films the last commit) |

## Where the code lives
| File | Owns |
|---|---|
| `game/main.js` | boot: screen, input, director, `useFontArt`, widgets, the record; the F8 knobs and `game.tune()`; audio unlock, music hushed under pause; `studio.onMoment` + `?moment=`; test hooks |
| `game/level.js` | the trail as data (`COURSE`) and `buildLevel()`: per-column heights, rocks, tufts, cairns |
| `game/sim.js` | the rules: trot, hop, munch, walls, falls, checkpoints, summit; `TUNE` holds the feel; `hopFor(px)`; `saveRun` / `loadRun` (F9 saves) |
| `game/sound.js` | songs (`trail`, `trail-quiet`, `summit`) and one sound effect per sim event; `design/instruments.js` the band |
| `game/world.js` | drawing: backdrop, ground, props, birds, effects, the yak's pose for a run |
| `game/scenes/title.js` · `play.js` · `pause.js` · `finish.js` | the screens; pause and finish are overlays on play |
| `game/sprites.js` | the art contract: every visual, plus the engine's font and widgets |
| `game/art/` | generators: `yak`, `trail` (ground, rocks, tufts, cairns, summit), `sky`, `critters` (bird, effects), `ui` (logo, icons) |
| `design/palette.js` | the palette; Yak Trail's own materials are ids 100+ |
| `clips/teaser.clip.json` + `teaser.shot.js` | the 12 s promo: the shot plays the yak with key events and cuts with `game.play({ save })` |

## How it fits together
- **Ground.** `level.ground[x]` is the surface height of every pixel column (`GAP` = none);
  `level.top[x]` adds the rocks' tops: that is what the yak stands on. A wall is a column that rises
  suddenly (more than 3 px) from its neighbour; slopes rise gradually and are trotted.
- **One ground picture.** `world.js` draws the whole trail's ground once into one long canvas (fill
  tiled on the world grid, the surface strip laid along each column) and rebuilds it only when a ground
  tile's canvas changes (the user repainted it).
- **Events.** `step()` lists what happened in `run.events` (`hop land munch checkpoint fall summit`);
  `play.js` turns them into effects and plays the sound effect of the same name.
- **Tuning.** `step(run, level, input, T)` takes the feel as an argument (default `TUNE`). `main.js`
  `game.tune()` copies `TUNE` into one reused object and lays the F8 knobs on top (Trot speed →
  `trot`, Hop height in px → `hop` through `hopFor`); their defaults are `TUNE`'s, so nothing
  changes until a kept choice is built in (into `TUNE`).
- **Music.** The title and the climb ask for the trail song every tick (free when it's already
  playing, so an F8 swap of the arrangement is heard at once); the summit event swaps to the fanfare.
- **Moments.** F9's save is `{ run: saveRun(run) }`; `?moment=` boots `playScene(game, { save })`,
  which `loadRun`s it. The state (`window.__studioMoment()`) is scene, tick, music, position, tufts.
- **Test hooks.** `?scene=play&at=<x>` starts a climb at x; `window.__yak` has `scene()`, `run()`,
  `place(x)`, `game`, `level`, `art`, `measure`; `window.__studioSound` is the sound.

## Tests
| What | Where |
|---|---|
| The rules, played on the real trail in Node (incl. "the whole trail can be climbed"), a changed tune, a save that plays on identically | `dev/sim.test.mjs` |
| Every song and effect compiles and renders healthy; every sim event has its effect | `dev/sound.test.mjs` |
| The art contract (sizes, anchors, anims) | `dev/rules.test.mjs` |
| Boot, title → play, hop a rock, fall back to a cairn, pause + help, the summit, a repainted glyph, the F8 knobs (`tune`), an F9 save booting (`moment`, fixture `dev/fixtures/moment-rocks.json`) | `dev/tests/*.json` |

## Saves
One record in `localStorage` through `slotStore('yak-trail', { slots: [1], version: 1 })`:
`{ best (ticks), bestTufts, timer }`. A new version number needs a migration
(`migrations: { 1: (r) => … }`); a record that can't be read is kept aside, never written over.

## The engine copy
`engine/` is Yak Trail's own copy of Pixel Yak's engine (v2; `engine/version.json`). Don't edit it here:
`node cli/yak.mjs engine yak-trail` shows what the harness has that it doesn't, `engine-pull yak-trail`
brings it in (then `test yak-trail --full` and look). Yak Trail is a 1–3 minute toy, so its rules are
one pure `sim.js` rather than the template's `game/systems/`; a new game starts from the template.
