# The art contract

Every picture a game shows is an **art entry**: an id with a fixed size, an anchor and named poses,
drawn by a small generator function in code. The user paints over any of them in Pixel Yak; their
pixels are kept in a separate file and drawn on top, so the AI can keep improving its generators
without ever touching what the user painted. Code: `engine/art/registry.js` (the registry),
`engine/art/pix.js` (the painter), `engine/art/edits.js` (the user's edits).

## An entry

A game's `game/sprites.js` passes its entries to `createArt()`; game code only ever asks for
`sprite(id, pose)`, `drawSprite(g, id, pose, x, y, flip)` or `animPose(id, anim, tick, fps)`.

```js
yak: {
  name: 'Yak', category: 'character', tags: ['hero'],
  fw: 32, fh: 24,            // every pose is exactly this size
  ax: 15, ay: 23,            // the anchor: the point drawSprite puts at (x, y), usually the feet
  poses: ['idle_0', 'walk_0', 'walk_1', 'hop'],
  anims: { idle: ['idle_0'], walk: ['walk_0', 'walk_1'] }, defaultAnim: 'walk',
  description: 'What it is and anything a painter should know (shown in the studio).',
  gen: { style: 'yak-trail', v: 1, by: '<model>', date: '2026-11-02' },
  draw(pose) { /* paint with Pix, return p.finish(FIN) — a canvas fw × fh */ },
}
```

| Field | Meaning |
|---|---|
| `id` (the key) | Never renamed: the user's edits and lessons are filed under it. Letters, digits, `_ . -`. |
| `fw`, `fh` | The frame size. Every pose, generated or painted, is exactly this big. |
| `ax`, `ay` | The anchor in the frame. `null` for pictures with no anchor (backdrops, portraits). |
| `poses` | The pose names `draw()` knows. Same character set as ids. |
| `anims` | Named sequences of poses; a pose may repeat to hold it. |
| `category` | How the studio groups it: the game's `assets.js` lists its categories and labels. |
| `gen` | Who drew it and in which style version — the studio's repaint scoreboard reads it. |
| `draw(pose)` | Returns a canvas `fw × fh`. |

`assets.js` in the game's folder hands the registry to the studio (`STUDIO`, `ASSET_CATEGORIES`,
`ASSETS`); a new entry in `sprites.js` shows up in the studio by itself.

## The rules (they are what keeps the user's edits valid)

- **Keep the id, size, anchor and pose names.** Upgrading art means a better `draw()` behind the same
  contract. A new look is a new pose or a new entry, never a resized one.
- **Deterministic generators.** The same pose draws the same pixels every time: no `Math.random()`
  (use `hash()` from `engine/shell/runtime.js` or `bayer()` from `pix.js`). The user's pixels sit on
  exact positions of your output.
- **Materials, never RGB.** Sprite code paints a material (a 5-stop ramp in the game's
  `design/palette.js`) and a shade 0–4; `finish()` turns that into colours, adds the outline, the rim
  light and the contact creases. Change a ramp and every sprite (and every user edit that used it)
  recolours. UI code that needs a colour takes a ramp stop: `C(M.GOLD, 3)`.
- **Two kinds of motion.** Move a whole sprite in whole pixels (bob, drift, sway), or step through drawn
  frames at 6–12 fps with `anims`. Never wiggle pixels inside a sprite every frame.
- **Pixel art everywhere.** No canvas arcs, lines, strokes or smooth gradients in a game
  (`tools/check-pixel-guardrails.cjs` flags them): round things are `Pix.oval` / `Pix.ball`, skies
  are bands with ordered dither.

## The user's edits (the overlay)

One file per edited asset, written by the studio: `games/<id>/game/art/edits/<asset>.json`, format
`pixel-studio-edits@1`. Never edit these by hand — they are the user's work.

```json
{ "format": "pixel-studio-edits@1", "project": "yak-trail", "asset": "yak",
  "contract": { "fw": 32, "fh": 24, "ax": 15, "ay": 23 },
  "legend": { "a": ["YAK", 4], "b": ["INK", 1], "c": "#ff00aa" },
  "poses": {
    "idle_0":    { "mode": "patch", "base": "32x24:b4995a90", "at": [20, 8], "rows": ["aa.", "-.b"] },
    "idle_0_v2": { "mode": "baked", "after": "idle_0", "from": "idle_0", "rows": ["… 24 rows of 32 …"] }
  },
  "anims": { "idle": ["idle_0", "idle_0_v2"] },
  "notes": [{ "ts": "…", "pose": "idle_0", "text": "bigger eyes" }] }
```

- **patch** — the user's pixels on top of the generator's output: `.` keeps the generated pixel, `-`
  erases it, a letter is a colour from the legend. `base` fingerprints the output they painted on;
  when the AI changes that generator, the studio flags the frame and the game logs a warning, and the
  user's pixels still apply.
- **baked** — the whole frame as pixels (`.` transparent); the generator is skipped. Frames the user
  adds in the studio are always baked and say where they sit (`after`).
- A legend colour is a palette reference `[MATERIAL, shade]` (palette changes still recolour it) or
  `"#rrggbb"` for a colour off the palette.
- `anims` replaces an animation's frame order and holds. Sizes and anchors can't change.
- `edits/index.js` gathers them for the game (regenerate: `node cli/yak.mjs edits-index <game>`). A
  game launched from the studio receives each save live; the registry re-renders just that asset.

## Text and UI widgets are art too

So the user can repaint everything on screen, the engine's font and its UI widgets are art entries a
game registers in one line each.

**The font** (`engine/art/font-art.js` + `useFontArt` in `engine/shell/font.js`): one pose per glyph
(6 × 9: cap height 7, two rows of descender; letters and digits are named after themselves, the rest by
name — `period`, `question`, `arrow_l` …), grouped into the anims `upper`, `lower`, `digits` and
`symbols`.

```js
entries: { ...fontArt({ ink: M.WHITE, fin: FIN }) }   // game/sprites.js
useFontArt(sprite);                                   // game/main.js, once at boot
```

From then on `text()`, `measure()` and `wrap()` read the glyphs from the art. Glyphs are painted in the
ink's lightest stop: a text colour multiplies onto them, so white takes the colour exactly and darker
pixels shade it. A glyph keeps its built-in width, or gets wider when the user paints past its right
edge. A repainted glyph shows up in the running game at once. Games that don't call `useFontArt` draw
the built-in glyphs as before.

**Widgets** (`engine/art/widget-art.js` + `engine/shell/widgets.js`): `ui_panel` (poses `panel`,
`inset`, `focus` — a 9-slice: the corners stay, edges and middle repeat), `ui_bar` (`empty`, `full`),
`ui_scrollbar` (`track`, `thumb`) and `ui_checkbox` (`off`, `on`). Colours come from the game's palette
by role (edge, face, rim, accent, fill, well), picked from common material names unless the game names
them.

```js
entries: { ...widgetArt({ M, fin: FIN, roles: { face: M.NAVY } }) }   // game/sprites.js
const ui = createWidgets(sprite);                                      // anywhere in the game
ui.panel(g, x, y, w, h);            ui.panel(g, x, y, w, 16, 'focus');
ui.bar(g, x, y, w, 0.4);            ui.checkbox(g, x, y, true);
ui.scrollbar(g, x, y, h, firstRow, rowsShown, rowsTotal);
```

A game can also register its own entries under these ids and poses instead of the defaults.

## Checking art

- `node cli/yak.mjs check <game>` — every pose of every entry renders at its declared size, the anims
  name real poses, the linter passes.
- `node cli/yak.mjs sheet <game> [idPrefix]` — a contact sheet to look at.
- `node tools/render-art.cjs <game> <asset> [pose|anim|all] --scale 8` — one asset as a PNG; with
  `--compose file.json`, several sprites placed in a picture (promo art, icons; see
  `tools/brand/*.json`). Look at what you made before calling it done.
