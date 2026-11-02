# Moments (F9) — "talk about this moment"

F9 in a game launched from Pixel Yak opens a request about that exact moment. An AI gets what the user
saw, what led up to it, and a save it can load to reproduce it.

## What a moment holds
| Part | Where it ends up |
|---|---|
| The screen at F9 | attachment `<R-id>-1.png` |
| The last ~5 seconds: 10 frames, 0.5 s apart, as **one picture** (oldest top-left, newest = F9 bottom-right, each labelled) | attachment `<R-id>-2.png` |
| When: the timestamp of the key press | the request body ("Moment: …") |
| The game's **state** (small: scene, position, hp…), up to 20,000 characters | the request body, as much as fits (a body holds 20,000 characters); all of it in the save-state file when it's long |
| A **save-state** (the game's full save, any JSON) | `<R-id>-save.json`, listed with the attachments |
| The F8 values that were live (changed from the code's default) | the body and the save-state file |
| The last 40 console lines | the body |

Frames are only recorded in a game launched from the studio (one small `drawImage` every 500 ms).

## In game code
```js
import { studio } from '../../../engine/link/studio.js';
studio.onMoment(() => ({
  state: { scene: scene.name, x: player.x, y: player.y, hp: player.hp },  // small: read by people and AIs
  save: saveGame(),                                                      // anything JSON: loaded, not read
}));
```
A function returning something without `state` / `save` keys is taken as the state. Games that set
`window.__studioMoment = () => ({ … })` still work (state only); `onMoment` also defines
`window.__studioMoment()` (returning the state) for capture tests. If the save can't become JSON (a cycle),
the moment goes without it and says why.

## The save-state file
`games/<id>/requests/<R-id>-save.json` (written when the user saves the request; moves and is deleted with it):
```json
{ "format": "pixel-yak-moment@1", "game": "<id>", "request": "R-261102-081505-tkv",
  "at": "2026-11-02T15:15:05.242Z", "state": { "scene": "placeholder", "tick": 583 },
  "save": { "tick": 583 }, "tuning": [{ "name": "Kobold walk speed", "value": 1.4, "default": 1 }],
  "console": [] }
```

## Loading a moment (how an AI reproduces it)
**The game decides how a save restores**; the engine only fetches it. At boot:
```js
const save = await studio.loadMoment();  // the "save" from ?moment=<file>, or null
if (save) restore(save);
```
`?moment=` takes a path relative to the game's page, same origin only — from `game/index.html` that is
`../requests/<R-id>-save.json`. To reproduce a moment headless, write a capture test:
```json
{ "page": "games/<id>/game/index.html?moment=../requests/R-261102-081505-tkv-save.json",
  "steps": [ { "waitFor": "window.__studioMoment().tick >= 583", "ms": 5000 }, { "shot": "moment.png" } ] }
```
and run `node tools/run-captures.mjs <id> <test>`. Look at the save-state file's `state`, not its `save`:
a save can be large, and it's for the game to load.

## Notes
- A WebGL game needs `preserveDrawingBuffer: true` (or its own `onMoment` picture) for the frames to show.
- The save-state file is capped at 20 MB.
- The studio side: `studio/main/ipc-link.mjs` (asks the game, holds the save until the request is
  saved), `studio/data/moments.mjs` (`attachJson`), `studio/ui/js/link.js` (the dialog).
