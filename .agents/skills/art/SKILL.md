---
name: art
description: Make or change any pixel art in a Pixel Yak game — the art contract (engine/art registry, Pix painter, materials + shades), deterministic generators, the two motion systems, never touching the person's edits, and verifying by looking. Use before drawing, upgrading or registering any sprite, tile, effect, UI or font art.
---

# Art

All art is code. Generators paint **material + shade** with `Pix` (`engine/art/pix.js`) and register
in the game's art contract (`game/sprites.js` → `engine/art/registry.js`). The person paints over it
in the studio; their pixels are stored separately and always win. Contract details:
`docs/contracts/ART.md`.

## Before you draw
1. The game's `design/art.md` (its look, and the rules it learned from the person's edits) and
   `design/palette.js` (its materials). Follow them, and say which rules you applied.
2. `node cli/yak.mjs edits <game>` shows the assets the person touched. **Never redraw those frames**:
   their edits sit on top of your output, or replace it when baked.
3. For an asset with a request: `node cli/yak.mjs context <R-id>`. It gives the generator's
   file:line, every frame's status, their edits as text grids, and a picture.

## The contract (the tools depend on it)
- Entry: `{ name, category, tags, fw, fh, ax, ay, poses, anims, defaultAnim, description, gen, draw(pose) → canvas }`.
  `draw` returns exactly fw×fh; (ax, ay) is the feet or pivot.
- **Upgrading** keeps the id, size, anchor and pose names; game code and the person's edits depend on
  them. **Adding** is a new entry; it appears in the studio by itself.
- `gen: { style: '<game id>', v: <look version>, by: '<model>', date }` goes on every entry you make
  or redraw. The studio's repaint scoreboard compares versions.
- **Deterministic**: no `Math.random()` in art. Use a seeded hash; the person's patches sit on exact
  pixels of your output.
- Paint materials, never RGB. A colour change belongs in `design/palette.js` (and it recolours every
  sprite, the person's edits included).

## Advice that has held up
- **Two motion systems.** Either move a still sprite in whole pixels (sway, bob), or step discrete
  frames at 6–12 fps when pixels inside change (walk, flames). Per-pixel 60 fps wiggles read as
  noise.
- **Pose tables as data.** One skeleton per character; each pose is a row of joint offsets. New
  frames stay consistent.
- **Light and effects at the sprites' own resolution.** Smooth high-res light over chunky pixels
  clashes. Use dithering or banded ramps instead of gradients.
- **Everything on screen is pixel art in a pixel game**, UI and text included. Register the font and
  widgets (`engine/art/font-art.js`, `engine/shell/widgets.js`) so the person can repaint them too.
- Derive positions from fw/fh/anchor; never hard-code sprite pixel offsets in game logic.

## Verify by looking
1. `node cli/yak.mjs sheet <game> <idPrefix>` gives a contact sheet; `--raw --edited` compares with
   the person's edits. Open it. Check that silhouettes read at 1×, outlines are unbroken, anchors hold
   steady across poses, and it looks like `design/art.md`.
2. `node cli/yak.mjs test <game> --changed`. The linter in there is a floor, not proof. A line that
   draws vector shapes on purpose says why with a `pixel-ok: <why>` comment.
3. Report what you changed: asset ids, poses, the rules you applied.

When the person fixed one frame and wants the others to match:
`node cli/yak.mjs propagate <game> <asset> <pose>`. It shows a picture first; `--apply` writes it.
To make your *future* assets come out right, use skill art-learn.
