# Yak Trail — read this first

The one page an AI reads before working on this game. Keep it to one page: point at the other files
instead of repeating them. Update **Now** whenever the focus changes.

**Now:** the bundled demo, complete and playable, with music, F8 knobs, F9 moments and a teaser clip
(2026-11-02). Next: whatever the user asks after playing it — a repainted yak, a kept trot speed, a
changed tune. Its art and sound are the AI's first drafts, made to be painted and played over.
**Size:** demo · **Genre:** side-view platformer · **Resolution:** 320×180 ×3

## What it is
A shaggy little yak trots up a mountain trail — hopping rocks, ledges and gaps, munching grass tufts —
and reaches the flags at the summit. One to three minutes; your best time is kept. It is also the
example game of Pixel Yak: small, clean code a new game can copy the shape of.

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
| `engine/` | Yak Trail's own copy of the engine (v2): don't edit it here (`node cli/yak.mjs engine yak-trail`) | engine questions |
| `requests/` | This game's tickets with the user (an F9 moment adds `<R-id>-save.json`) | skill requests |
| `tuning/` | F8 choices the user kept while playing, waiting to be built in (`node cli/yak.mjs tuning yak-trail`) | after the user tunes |
| `clips/` | Promo clip recipes (`teaser`); renders land in `clips/out/` (not committed) | skill promo |
| `dev/` | Tests: `*.test.mjs` (node:test) and `tests/*.json` (capture tests) | checking your work |

## Check your work
- `node --test "games/yak-trail/dev/**/*.test.mjs"` — the rules as tests.
- `node tools/run-captures.mjs yak-trail` — boots the game headless; look at the screenshots in `dev/out/`.
- `node cli/yak.mjs check yak-trail` — structure + every sprite renders + every song plays.
- `node cli/yak.mjs test yak-trail` — only the checks for what you changed (`checks.json`); `--full` all.
- `node cli/yak.mjs sound yak-trail` — the songs and sound effects, and what the user changed in them.

## The code in one breath
`game/level.js` is the trail as data (`COURSE`); `game/sim.js` the rules, pure and tested in Node;
`game/world.js` draws it all from the art registry; `game/scenes/` are title → play (+ pause, finish);
`game/art/` the generators, `game/sprites.js` the contract; `game/sound.js` holds the trail theme, the
summit fanfare and one sound effect per sim event (`play.js` plays them). `main.js` makes the F8 knobs (Trot speed, Hop height,
Trail music) and hands them to the sim each tick as a tune object. Details: `ENGINEERING.md`.

## This game's own rules
The AI's defaults so far are in `DECISIONS.md` (marked as such): the user hasn't decided anything yet.
- Every on-screen thing comes from the art registry, including the font and the boxes (`useFontArt`,
  `createWidgets`), so the user can paint all of it.
- The sim stays pure: no DOM, no `Math.random`, no knobs read inside it (they arrive as `step()`'s
  tune), so `dev/sim.test.mjs` can play the real trail.
