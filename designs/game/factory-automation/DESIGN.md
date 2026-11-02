# Factory automation

For games where the player builds production lines that turn raw resources into ever deeper goods, and the joy is planning exact ratios and watching the factory grow. Builds on basics.

## This game

(Filled in at kickoff: the game in one sentence, and its 2–4 pillars — the things every feature is judged against.)

## The fantasy and core loop

You build a machine that runs itself. **The math is the game**; the theme is the charm. The loop: extract a raw, process it through a chain, meet a goal that asks for more than you make, open new ground and recipes. Goals are a means; the pleasure is growing what you built.

Pillars that served a big game in this genre: the math is the game; nothing you build becomes obsolete; growth is earned; laying out lines is part of the puzzle.

**The math, as defaults:**
- **Fixed rates.** A recipe's rate is set once; an extractor's comes from its node. No speed upgrades, because a planned ratio must stay true. Rewards come as new ground, richer nodes, new goods for old lines, workers freed.
- **Whole numbers a minute.** A smelter turning 1 ore into 1 bar every 3 s runs 20 ore in, 20 bars out a minute. Test that (60 ÷ seconds) × amount is whole for every recipe.
- **Recipes from the machine counts you want.** Pick small whole ratios first (a full extractor, 60 ore a minute, feeds three smelters), then set times to fit. Extractors give round steps (20 a minute per worker), because "200 a minute is ten machines, never six and two-thirds".
- **A buffer before branching.** Each raw has one first recipe, one for one (ore → bar); after it, the raw only goes in as a small extra beside made goods, so the first machines stay needed all game.
- **One recipe per item**, no alternates, so every chain stays learnable. Inputs per recipe grow slowly: one early, then two, three sparingly.
- **Shortfalls slow, never stop**: short of power, lines run at supply ÷ demand.

## Pacing and progression

Progress comes in **phases**, each ending in a goal (a big order to fill); a few phases make an **era**, which brings something new to work with.

- **Each phase asks for more of what the last made**: a goal wants its new goods plus many times the last goal's (20× in one game), so old lines scale up rather than get replaced.
- **Floor and ceiling.** Every made good feeds a later goal and is needed more each era: no dead ends. An old good's need grows at most about 4× a phase; new goods carry the growth.
- **Growth from depth.** Depth is an item's longest chain counting the raw (ore 1, bar 2, gear 3); each new goal item sits two or more deeper, rather than asking for a mountain of one raw.
- **Size goals by work**: the machine and extraction seconds an item takes, counting everything upstream. Each goal at least 10× the last's work; phases about double in length (45 min, 1.5 h, 3 h).
- **A narrow window into each phase.** Only one or two research cards can be paid with the last phase's **end goods** (made late, no use yet); the rest cost the new phase's goods, pushing the player onto the new material.
- **Lasting lines**: your first line is still needed in your last factory. Footprints are fixed and upgrades happen in place; a new version adds a recipe or a benefit (fewer workers, less energy), never speed. Each phase, check that it can be finished without tearing a building down.
- **The opening** teaches one building and one recipe at a time; no card brings two new steps that depend on each other.
- **More recipes every phase**, but only a few memorable combinations; recipe soup is the danger.

**Research cards** (the tech tree):
- **Cost is the only gate**, no prerequisites. A card costs the goods its new buildings are made of and use, from recent goods, never ones far behind.
- Goods made by hand pay for only the first few, or the phase feels cheap.
- What a card gives is used straight away: to build, to start its recipe, or to pay the next card.
- A card asks at most what one storage building holds of a single good, so the player can gather it in one place.
- About a dozen a phase, grouped, each opening a new activity. The card for the goal's own item comes late, not last, so something is left to unlock while the goal fills.

## What the screen shows and explains

Basics hold. On top:
- **Exact rates everywhere**: every node, machine and route shows whole items a minute, counted over whole minutes.
- **A panel reads right now and says why** it makes nothing (no worker, waiting for bars, output full); a light on the machine shows the same at a glance.
- **A recipe book** of every discovered good.
- **A planner**, because past a few dozen buildings nobody remembers which makes what: pick a good and a rate, get a flat list down to the raws with buildings and counts. It names the card behind a locked step, the one exception to "show only what's unlocked", because planning ahead is its job.
- **A look-only diagnostics view**: workers needed against had, each good made, used and spare.

## Controls

- Build menu on Q, rotate or switch version on R, copy a building with its settings on middle click; place many without reopening the menu. On a pad the cursor steps a tile at a time.

## What to build for its size

Usually **big**, with the scaffolding basics lists. On top:
- **Design each phase on paper** with a script that prints its goals, effort and raw needs; its checks are tests.
- **A test map** with god controls (give everything, learn every card, fast clock) and its own save, so a mechanic can be tried in minutes.
- **Nodes from need**: each new area's own nodes give 1.3–2× its phase's raw need, with generous floor room.

## Do / Don't

**Do**
- Make every power source need a line or the player's work, because set-and-forget power removes a problem worth solving.
- Grow capacity (population, power) from an exact input the player chooses, never leftovers, which reward a clogged factory.
- Set a store's filter when it's built; moving it never changes it. Stores side by side that share a good even it out, as one depot.

**Don't**
- Sell overflow for more than a fraction of its worth; making must beat selling.
- Add global speed boosts, or a material that only pays for things and feeds no goal.

## Lessons from games that used it

From a big factory-automation game built with this harness:
- A phase that the previous phase's lines could fill alone felt broken. The fix (old goods asked 20×, new ground carrying the phase) shipped as a test patch with a tagged fallback.
- "I don't like seeing that I need 0.7 to make 0.7" made whole numbers a test.
- A +50% speed fitting was removed ("I could just make more"): more buildings, not faster ones.

## How to ask for a feature

Name the line, the rates you expect, what must not change, and whether it's a test patch.
- "Phase 2 is too easy: Phase 1's lines carry it. Propose a fix on paper, then ship it as a test patch."
- "Put a three-input recipe on the test map so I can feel it first."

## Changelog

- 2026-11-02 · Seeded from the decision register of a big factory-automation game built with this harness.
- 2026-11-02 · Seeded from its rules for every phase.
- 2026-11-02 · Seeded from its playtests.
