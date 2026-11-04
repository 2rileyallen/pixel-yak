# Follow camera

A camera for any game whose world is bigger than the screen: side view or top-down. It follows one
target (usually the hero) through a dead zone, eases toward it, never shows past the edge of the
level, and lands on whole pixels. One file, one test, no game code of its own: the game passes in
what to follow and how big the view and the level are.

## What it does
- **The target moves freely inside a dead zone** (48×32 by default) before the camera follows,
  because a camera that moves with every step makes small adjustments feel seasick.
- **It eases** toward where it needs to be (`ease`: the share of the remaining distance closed each
  step), because a hard lock jerks on every jump and landing.
- **It stops at the level's edges** (`bounds`), because showing the void past the map breaks the
  picture. A level narrower than the screen is centred.
- **It draws at whole pixels** (`px`, `py`), because a camera at a fractional position smears pixel
  art and makes tiles shimmer. Its own position stays exact, so easing doesn't stall.
- **Look-ahead** (`lookAhead`, off by default) shifts the view toward where the target is heading,
  for fast games that need to see what's coming.
- **`snap(world)`** jumps straight to the target: a new level, a respawn, a door.

## Wiring it in
```js
// game/systems/index.js
import { followCamera } from './follow-camera/index.js';
export const SYSTEMS = [hero, enemies, followCamera({
  target: (world) => world.state.hero,          // { x, y }: the point to keep in view
  view: { w: 320, h: 180 },                     // the screen in game pixels
  bounds: (world) => ({ w: LEVEL_W, h: LEVEL_H }),
})];
// a scene: const { px, py } = world.state.camera; draw everything at (x - px, y - py)
```
Put it **after** the systems that move its target, so it follows this step's position, not the
last one. Its slice is `world.state.camera` (or the `id` you give it); it saves its position, so a
loaded game opens on the same view.

## Knobs worth exposing on F8
`ease` (0.08 floaty – 0.3 tight), the dead zone's width, `lookAhead`. Build the kept values in as
the arguments above (skill explore).

## Changelog
- 2026-11-04 · The systems shelf's first entry: written for Pixel Yak's template shape
  (`engine/shell/systems.js`), from what platformers and top-down games have needed every time.
