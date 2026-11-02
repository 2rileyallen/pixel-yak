# {{NAME}} — read this first

The one page an AI reads before working on this game. Keep it to one page: point at the other files
instead of repeating them. Update **Now** whenever the focus changes.

**Now:** just made from the blank template ({{DATE}}). Next: the kickoff (skill new-game).
**Size:** {{SIZE}} · **Genre:** {{GENRE}} · **Resolution:** {{W}}×{{H}} ×{{SCALE}}

## What it is
(one or two sentences, once the user and the AI agree on them)

## Where things are
| File | What it holds | Read it when |
|---|---|---|
| `design/game.md` | How the game plays, right now, in plain words | any design or gameplay task |
| `design/art.md` + `palette.js` | How it looks; the palette is its code | any art task (skill art) |
| `design/sound.md` + `instruments.js` | How it sounds; the instruments are its code | any music or sound task (skill sound) |
| `DECISIONS.md` | Every decision by number, in the user's words — look one up when it's cited | a task touches a decided thing |
| `ROADMAP.md` | Where the game is going (added when the game has one) | planning |
| `CHANGELOG.md` | One short entry per change the user can play | "what changed?" |
| `ENGINEERING.md` | Code map, how to run and check it | code work |
| `game/` | The game: `main.js` boots it, `sprites.js` is the art contract, `art/` the generators, `art/edits/` the user's pixels, `sound.js` the songs + sound effects, `sound/edits/` the user's notes and knobs (never hand-edit either edits folder) | |
| `requests/` | This game's tickets with the user | skill requests |
| `tuning/` | F8 choices the user kept while playing, waiting to be built in (`node cli/yak.mjs tuning {{ID}}`) | after the user tunes (skill explore) |
| `dev/` | Tests: `*.test.mjs` (node:test) and `tests/*.json` (capture tests) | checking your work |

## Check your work
- `node --test "games/{{ID}}/dev/**/*.test.mjs"` — the rules as tests.
- `node tools/run-captures.mjs {{ID}}` — boots the game headless; look at the screenshots in `dev/out/`.
- `node cli/yak.mjs check {{ID}}` — structure + every sprite renders + every song plays.
- `node cli/yak.mjs sound {{ID}}` — the songs and sound effects, and what the user changed in them.

## This game's own rules
(none yet — a rule the user decides goes in `DECISIONS.md` with a number; the design files cite it)
