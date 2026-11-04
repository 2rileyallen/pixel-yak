# {{NAME}} — engineering

The code map, how to run and check it, saves and the engine copy. Keep it the map (under ~1,500
words): each system's own code notes go on its page in `design/systems/`. A big game reads skill
optimize before it grows (`docs/LESSONS.md` → building big).

## Run
| What | Command |
|---|---|
| Play it | Pixel Yak → Games → Play, or `npm run web` and open `/games/{{ID}}/game/` |
| The checks for what changed | `node cli/yak.mjs test {{ID}} --changed` (`--full` before a push) |
| Rules as tests | `node --test "games/{{ID}}/dev/**/*.test.mjs"` |
| Capture tests | `node tools/run-captures.mjs {{ID}}` (`dev/tests/*.json`; screenshots in `dev/out/`) |
| Reproduce an F9 moment | a capture test whose page is `games/{{ID}}/game/index.html?moment=../requests/<R-id>-save.json` |
| Tune outside the studio | open the game with `?tune=1` (F8 works; Keep copies the choice instead of saving it) |
| Structure + art + sound + reading budget | `node cli/yak.mjs check {{ID}}` |
| Hear a song without listening | `node cli/yak.mjs render-song {{ID}} theme --out scratch/theme.wav` |

## Where the code lives
| File | Owns |
|---|---|
| `game/main.js` | boot only: screen, input, world, loop, F9 hooks |
| `game/systems/` | the rules, one file (or folder) per system; `index.js` lists them in step order |
| `game/scenes/` | drawing: read the world, never change it |
| `game/save.js` | saves: the world, each system under its own version (`engine/shell/systems.js`) |
| `game/tune.js` | the F8 knobs; systems read them as `tick.tune` |
| `game/data/` | content as data, one small file per thing (add it when content arrives) |
| `game/sprites.js`, `game/art/` | the art contract and its generators (deterministic: no `Math.random`) |
| `game/sound.js`, `design/instruments.js` | songs + effects and the instruments they name |
| `design/palette.js` | the palette |
| `engine/` | this game's own copy of the engine (below) |

## Systems
One line per system: id · version · file · page. (Kept in step with `game/systems/index.js`.)
- clock · v1 · `game/systems/clock.js` · the placeholder

## Saves
- A save is `saveWorld(SYSTEMS, world)`: `{ tick, seed, systems: { <id>: { v, data } } }`, in
  IndexedDB slots with a backup (`game/save.js`). `SAVE_FORMAT` is the outer shape; it rarely changes.
- **Changing what a system keeps:** bump its `version` and add `migrations[old]` (old data → new).
  `dev/saves/<id>@<v>.json` holds each version's section and must keep loading (dev/systems.test.mjs).
  A restart instead of a migration (`resetBelow`) is the person's call, never the AI's.
- A save that won't load is never written over silently: tell the player, offer to start fresh, and
  the raw save stays kept (`(await saves()).kept(n)`).

## The engine copy
`engine/` is this game's own copy of Pixel Yak's engine, at the version in `engine/version.json`
(what each module is for: `engine/README.md`). Don't edit it here. `node cli/yak.mjs engine {{ID}}`
shows what the harness has that this game doesn't; `engine-pull {{ID}}` brings it in, then run the
full checks and look.
