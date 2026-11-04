# {{NAME}} — read this first

The one page an AI reads before working on this game. Keep it to one page (under ~1,000 words,
`yak check` warns): point at the other files instead of repeating them. Update **Now** whenever the
focus changes. Pixel Yak's hard lines (the `AGENTS.md` two folders up) apply here too.

**Now:** just made from the blank template ({{DATE}}). Next: the kickoff (skill new-game).
**Size:** {{SIZE}} · **Genre:** {{GENRE}} · **Resolution:** {{W}}×{{H}} ×{{SCALE}}

## What it is
(one or two sentences, once the user and the AI agree on them)

## Read only what the task needs
| File | What it holds | Read it when |
|---|---|---|
| `design/game.md` | The index: the game in a sentence, pillars, the core loop, **the list of systems** | any design or gameplay task |
| `design/systems/<id>.md` | One page per system: its rules, decisions, events, code, save version | changing that system (read only the ones you touch) |
| `DECISIONS.md` | Every decision by number, in the user's words, with the system it belongs to | a number is cited, or you touch a decided thing: `node cli/yak.mjs decisions {{ID}} <#n or system>` — never read it through |
| `design/art.md` + `palette.js` | How it looks; the palette is its code | any art task (skill art) |
| `design/sound.md` + `instruments.js` | How it sounds; the instruments are its code | any music or sound task (skill sound) |
| `ENGINEERING.md` | The code map, how to run and check it, saves, the engine copy | code work |
| `CHANGELOG.md` | One short entry per change the user can play | "what changed?" |
| `ROADMAP.md` | Where the game is going (added when it has one) | planning |

## The code in one breath
`game/main.js` boots (screen, input, loop) · `game/systems/` the rules, one file per system, listed
in `systems/index.js` · `game/scenes/` draw the world · `game/save.js` saves (each system versioned)
· `game/tune.js` the F8 knobs · `game/sprites.js` the art contract, `game/art/` the generators ·
`game/sound.js` songs + effects · `engine/` **this game's own copy** of the engine (don't edit it:
`node cli/yak.mjs engine {{ID}}`) · `dev/` the tests.
**Never hand-edit** `game/art/edits/` or `game/sound/edits/` (the user's pixels and notes), `tuning/`
(their F8 choices) or `design/lessons/`.

Everything particular to this game lives in this folder: its state (**Now** above), decisions,
accounts and online setup (`skills/`, which win over the general skills). None of it goes into Pixel
Yak's own files or into an AI's memory of the Pixel Yak folder.

## Check your work
- `node cli/yak.mjs test {{ID}} --changed` — the checks for what you changed (`checks.json`); `--full` before a push.
- `node cli/yak.mjs check {{ID}}` — structure, every sprite renders, every song plays, the reading budget.
- `node tools/run-captures.mjs {{ID}}` — boots the game headless; **look** at the screenshots in `dev/out/`.

## This game's own rules
(none yet — a rule the user decides goes in `DECISIONS.md` with a number; the design files cite it)
