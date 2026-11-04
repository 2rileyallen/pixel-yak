---
name: design
description: Work with Pixel Yak's design library — the art, sound and game design files a game starts from. Use at a game's kickoff (pick or blend a design from each shelf), when the user names a reference look/sound/game ("make it look like…", "a design like X"), when a game's look, sound or design is good enough to reuse (promote it), when the user wants an improvement from the library in a game (pull it), or when they ask what's in the library.
---

# Design files: pick, make, promote, pull

The library (`designs/<art|sound|game|systems>/<id>/`, the user's own in `local/designs/`) holds design
files like the DESIGN.md files people give an AI for a website's brand — but for a game's **look**,
**sound** and **game design** — plus a **systems** shelf: game code (a camera, menus, an inventory, a
dialogue box) with its page and its test. Each game keeps its **own copies** and they grow with it:
`design/art.md` + `palette.js`, `design/sound.md` + `instruments.js`, `design/genre.md` (the game
shelf's file; `design/game.md` is the game's own index of itself), and a system as
`game/systems/<id>/` + `design/systems/<id>.md` + `dev/systems/<id>.test.mjs`. The format and the
commands: `docs/contracts/DESIGN-FILES.md`.

## Hard lines
- **The user's edits are sacred.** Never replace a game's own design copy, palette or instruments
  without the user asking in chat; never touch their pixel or sound edits. `design-use` refuses on
  purpose; `--force` is for when the user said so.
- **Nothing flows silently.** A library change never restyles a game, and a game's change never
  reaches the library until it's promoted. Pulls are deliberate and picked by the user.
- **The public library stays clean.** `designs/` ships publicly: no game's names, characters,
  story or setting, no fan material, no copied assets, no personal paths. Private entries go to
  `local/designs/` (`--local`).

## At kickoff: pick or blend
1. `node cli/yak.mjs designs` — every entry with a one-line summary and the games using it;
   `node cli/yak.mjs design <shelf> <id>` reads one.
2. Pick one per shelf that fits the fantasy and camera, and say why in a line each. **game** is
   usually a genre entry (they build on `basics`; a game with no genre fit takes `basics`).
3. Blending (say "the light of 16-bit-fx on gba-bright's palette"): start from the closer entry
   with `design-use`, then edit the game's own copy to borrow the other's rules — and say in its
   changelog which entry each borrowed rule came from.
4. Check and look: `node cli/yak.mjs check <game>`, `node cli/yak.mjs sheet <game>`.
Advice: if the user hasn't named a look, show them two or three entries (the Designs view has
swatches and samples) rather than choosing silently — the look is the hardest thing to change later.

## A new design from a reference the user names
"Make it look like <game>" means **the look, never its assets**:
1. Describe the reference in style knobs (pixel budget, palette size, line, shading model, light,
   dithering, detail, motion — see an art entry's "Style knobs" section) and confirm with the user.
2. Build it as the game's own copy first (the closest entry + edits), or as a new entry in
   `local/designs/<shelf>/<id>/` with the same shape (DESIGN.md + palette.js / instruments.js).
3. Draw a sample (`sample.js` for art) and look at it next to the user's other games.
Reason: a design proven in one game is worth more than one written in the abstract — promote it
later, once it has lessons behind it.

## Promote: a game's design becomes a library entry
When the user says a game's look/sound/design is worth reusing (or after several distillations
made it clearly its own):
1. Agree an id and title with the user, and **public or private** (`--local`).
2. `node cli/yak.mjs design-promote <game> <shelf> <newId> [--local] --title "<Title>"`.
3. Rewrite the new `DESIGN.md` as a general entry: the first paragraph describes the look/kind,
   not the game; game-only rules become general ones or go; exemplars are described generically;
   keep the changelog line "Promoted from …" and the lessons behind each rule.
4. For art: the palette keeps every hex unique and the exports in the contract; check the Designs
   view draws its swatches (and sample, if any).

## Pull: bring a library improvement into a game
1. `node cli/yak.mjs design-diff <game> <shelf> [--from <id>]` — `+` lines are the library's,
   `-` lines the game's own.
2. **Brief the user first**: in a few lines, what the library has that the game doesn't and what
   you'd bring over. Wait for their pick.
3. Edit only the picked pieces into the game's copy, by hand; for palette changes, remember that
   ramps recolour every sprite and every edit the user painted with that material.
4. Note it in the game's `CHANGELOG.md`; check and look.

## The systems shelf: code that gets cheaper every game
Each game writes systems; the good, general ones come back here, so the next game starts with them.
- **Use:** `node cli/yak.mjs designs systems`, then `design-use <game> systems <id>`. Its engine
  imports are pointed at the game's own engine copy. Wire it into `game/systems/index.js` as its page
  says, add a row to `design/game.md`'s Systems table, run the game's tests. The copy is the game's
  own: change it freely; nothing flows back by itself.
- **Promote** (the user says a system is worth reusing, or you notice the same system written a
  second time): `design-promote <game> systems <newId> --system <its id in the game> [--local]`. It
  lists every import that reaches into the game (data, other systems): make those parameters (the
  entry is a factory that takes what it needs, like `followCamera({ target, view, bounds })`) or
  include them, before another game uses it. Its page says what it does, how to wire it in, its
  knobs, and carries no names or story from the game. Its test runs in `npm test`.
- **Pull:** `design-diff <game> systems --from <id>` shows what the library's version has; brief,
  bring over only what the user picks, and keep the game's save migrations in step (a changed save
  section means a new system version).

## Writing a design file (advice)
- Follow the section list in the contract; keep one file focused (roughly 400–1200 words).
- Every rule carries its reason ("…, because …") so a later model can judge when to set it aside.
- Plain words over private shorthand; examples over abstractions ("a smelter turns 60 ore/min into
  30 bars/min").
- Lessons from the user go in the changelog with a date, newest first.
