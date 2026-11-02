# Yak Trail — game design

How Yak Trail plays, right now. Rewrite a section when it changes; `DECISIONS.md` and `CHANGELOG.md`
keep the history. Numbers like (#2) are decisions.

## The game in one sentence
A shaggy little yak trots up a mountain trail to the flags at the summit, hopping what's in the way and
munching grass on the way up.

## The core loop
Trot right (→), hop (Space) over rocks, ledges and gaps, and choose for each grass tuft: trot onto it to
munch it (the yak stops to chew for a moment) or hop over it to keep your pace (#3). Cairns along the
trail are checkpoints: fall into a gap and you're back at the last one you passed (#4). Reach the flags
at the top to finish; the finish panel shows your time and tufts, and the best time is kept (#5).

## The trail
One level, about 4,700 px long and 570 px of climb, in three parts: the **meadow** (gentle slopes,
small rocks, the most tufts), the **rocks** (steeper, ledges, gaps, a staircase of ledges) and the
**snow** (wider gaps, big rocks, frosted tufts), then the summit. A fast run takes about a minute; a
first climb two or three. The trail is data: `game/level.js` `COURSE`.

## Feel (sim.js `TUNE`)
Top trot speed 1.6 px a tick, a hop about 42 px high (a tap hops lower), a little forgiveness both
ways (a hop pressed just before landing, or just after walking off an edge, still counts). Slopes are
trotted; anything that rises suddenly by more than a stride is a wall and takes a hop.

## Pillars
- **Charm first**: the yak is the star; everything it does should look nice.
- **Short and kind**: a fall costs a few seconds, never the run.
- **Small**: every new thing must earn its place in a one-to-three-minute climb.

## What the screen shows
Tufts munched, a progress bar to the summit, and the time (it can be hidden in the pause menu). How to
play is only in Esc → Help (#2). The title shows the best run.

## Controls
Arrows or A/D (or the stick, the d-pad) trot; Space, ↑ or W (pad A) hops; Esc (pad Menu) pauses;
Enter or Space confirms in menus. Pause freezes everything.
