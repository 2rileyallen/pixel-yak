# {{NAME}} — engineering

How the code is laid out, how to run and check it. Fill it in as the code grows: one line per file
that owns something, one line per cache (and what rebuilds it), one line per test fixture or budget.
A big game reads skill optimize before it grows (`docs/LESSONS.md` → building big).

## Run
| What | Command |
|---|---|
| Play it | Pixel Yak → Games → Play, or `npm run web` and open `/games/{{ID}}/game/` |
| Rules as tests | `node --test "games/{{ID}}/dev/**/*.test.mjs"` |
| Capture tests | `node tools/run-captures.mjs {{ID}}` (`dev/tests/*.json`; screenshots in `dev/out/`) |
| Structure + art | `node cli/yak.mjs check {{ID}}` |

## Where the code lives
| File | Owns |
|---|---|
| `game/main.js` | boot: screen, input, loop |
| `game/sprites.js` | the art contract: every visual is an entry here |
| `game/art/` | art generators (deterministic: no `Math.random`) |
| `design/palette.js` | the palette |

## Saves
(the save format and its version, once the game saves)
