# Yak Trail — read this first

The one page an AI reads before working on this game. Keep it to one page: point at the other files
instead of repeating them. Update **Now** whenever the focus changes.

**Now:** the bundled demo, complete and playable (2026-11-02). Next: whatever the user asks after playing
it — a repainted yak, a tuned trot, a song. Its art is the AI's first draft, made to be painted over.
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
| `design/sound.md` | How it sounds (when it has sound) | any music or sound task (skill sound) |
| `DECISIONS.md` | Every decision by number, in the user's words — look one up when it's cited | a task touches a decided thing |
| `ROADMAP.md` | Where the game is going (added when the game has one) | planning |
| `CHANGELOG.md` | One short entry per change the user can play | "what changed?" |
| `ENGINEERING.md` | Code map, how to run and check it | code work |
| `game/` | The game: `main.js` boots it, `sprites.js` is the art contract, `art/` the generators, `art/edits/` the user's pixels (never hand-edit) | |
| `requests/` | This game's tickets with the user | skill requests |
| `dev/` | Tests: `*.test.mjs` (node:test) and `tests/*.json` (capture tests) | checking your work |

## Check your work
- `node --test "games/yak-trail/dev/**/*.test.mjs"` — the rules as tests.
- `node tools/run-captures.mjs yak-trail` — boots the game headless; look at the screenshots in `dev/out/`.
- `node cli/yak.mjs check yak-trail` — structure + every sprite renders.

## The code in one breath
`game/level.js` is the trail as data (`COURSE`); `game/sim.js` the rules, pure and tested in Node;
`game/world.js` draws it all from the art registry; `game/scenes/` are title → play (+ pause, finish);
`game/art/` the generators, `game/sprites.js` the contract. Details: `ENGINEERING.md`.

## This game's own rules
The AI's defaults so far are in `DECISIONS.md` (marked as such): the user hasn't decided anything yet.
- Every on-screen thing comes from the art registry, including the font and the boxes (`useFontArt`,
  `createWidgets`), so the user can paint all of it.
- The sim stays pure: no DOM, no `Math.random`, so `dev/sim.test.mjs` can play the real trail.
