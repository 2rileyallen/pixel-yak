# 8-Bit Strict

A strict 8-bit console look: every colour from the classic 64-colour table, black outlines, two tones per material, three colours per 8×8 tile, and motion in a few bold frames. Fits platformers, action games and small RPGs that want the real thing, not "8-bit-flavoured".

## The look in one paragraph
Small, bold sprites that read from their silhouette and two flat tones, against tiled backdrops made of 8×8 pieces. Every colour comes from the 8-bit console's fixed table, so the look can't drift into colours that era never had. There is no rim light, no crease, no soft light: form comes from shape, a shadow tone and, on shiny things, a white highlight. Characters are iconic rather than detailed (one-pixel eyes, chunky limbs), and life comes from motion — snappy two- to four-frame cycles, flashes and knockback.

## Resolution and scale
- Native canvas **256×240** for a true console frame (×4 at 1080p, letterboxed), or **240×135** for a 16:9 window (×8 at 1080p). Smaller still, 160×90 (×12), for a deliberately tiny picture.
- Built from **8×8 tiles**; backgrounds in 16×16 blocks of four tiles. Characters 16×16 to 16×32 (two to three heads tall, chunky limbs), bosses 32–64 px.
- Text in an 8×8 font (one character per tile); digits may be 3×5.

## Palette and material roles
`palette.js` is this design's code: the console's 64-colour table (`NES`), and 20 materials whose ramps are picked from it by index. The 5 stops read the 8-bit way: **0 black outline · 1 shadow · 2 main · 3 highlight (shiny only) · 4 hot core / white**.
- **People:** SKIN (peach), HAIR (brown), CLOTH (blue), RED, GREEN, PURPLE, WHITE; INK for black and greys.
- **Things:** STEEL, GOLD (shiny), WOOD, BRICK, STONE.
- **World:** GRASS, WATER (shiny), SKY.
- **Emissive:** FIRE, GLOW (cyan), MAGIC (pink-violet) — their outline is their own darkest stop, not black.
- **UI:** PANEL (black with a blue window fill), WHITE text.
- `nes(p)` runs the shading rule on a sprite before it's finished: cloth, skin and the world collapse to shadow + main; shiny materials to main + highlight; glows keep every stop. Each material is then black + two colours.
- `overLimit(canvas)` is the strictness check: it lists every 8×8 block of a finished sprite using more than three colours.
- Many materials share black or white; the palette nudges each repeat by one step of blue so every hex stays unique (the studio reads painted pixels back by colour). On screen they're the same colour.

## Shapes, outlines, shading, light
- **Outline:** black, 1 px, around every sprite (`outline: 'self'` takes each ramp's stop 0, which is black); tiles have none.
- **Two tones per material**, flat; a white highlight only on metal, gold and water. No rim, no crease, no gradients, no dithered shading on sprites.
- **Three colours per 8×8 tile of a sprite** (black included), plus transparent. A character that needs more layers a second sprite over the first, the way the era did (a face over a helmet), and each layer keeps the limit.
- **Backgrounds:** each 16×16 block uses one set of three colours plus the shared backdrop colour. Repeat tiles; variety comes from arrangement, not new tiles.
- **Light** doesn't exist as an effect: a dark room is a darker palette for the whole room; a flash is the whole screen or the whole sprite switching colours for a frame or two.

## Motion
- Step frames at 8–12 fps: walks of 2–4 frames, attacks of 2–3 with a hold on the hit. No in-betweens, no smears, no rotation.
- Move whole sprites by whole pixels; knockback is a fast slide; hits flash the whole sprite white (or to its inverse) for 2 frames.
- Effects are flat two-colour shapes that break up into pieces as they fade, never alpha.
- Old hardware flickered sprites when too many shared a row; don't imitate it — blinking pixels read as a fault now.

## UI (frames, font)
Black or deep-blue windows with a white 1 px border drawn from 8×8 corner and edge tiles, white 8×8 text, hearts or bars made of tile-sized pieces. Panels show state; a "?" explains.

## Style knobs
| Knob | This look's position |
|---|---|
| **Palette** | limited: the 8-bit console's table, three colours per tile |
| **Pixel budget** | ~16–24 px characters, 8×8 tiles |
| **Shading model** | flat two-tone; a highlight only on shiny things |
| **Line** | black outer outline |
| **Detail** | iconic: silhouettes and colour blocks |
| **Motion** | limited: few frames, holds, snappy |

## Do / Don't
**Do**
- Design the silhouette first; at this size it's most of the read.
- Run `overLimit()` on new sprites (a test or the check), so "strict" stays true.
- Reuse tiles; a strong 8×8 set beats many one-off tiles.
- Use colour to separate the player from the world: a warm hero against cool backdrops.

**Don't**
- Add colours outside the table, gradients, alpha, rim light or dithered shading.
- Draw at a higher resolution and shrink: redraw for the budget.
- Mix pixel sizes, rotate sprites, or scale them at runtime.
- Flicker or blink individual pixels.

## Exemplars
- **An armoured knight** at 16×16 in three colours (black, grey, white), a two-frame walk (see `sample.js`).
- **A brick wall tile**: two brick tones and black mortar, four 8×8 tiles that repeat seamlessly.
- **A title screen**: a black sky, a logo built from tiles, white 8×8 text, one blinking "press start" line (a whole line blinks, slowly).

## How to ask for an asset in this look
Name the asset, its size in tiles, its colours (which materials), its frames, and whether it's a sprite or background. For example:
- "A 16×24 hero, two tiles wide and three tall: blue tunic, peach skin, a 3-frame walk and a 2-frame jump."
- "A 16×16 grass-top ground tile and its left/right edge pieces."
- "An enemy bat, 16×8, two flap frames, purple, with a white flash when hit."

## Changelog
- 2026-11-02 · Library entry written from a style lab's 8-bit tier (one fight redrawn at 160×90 with an 8-bit-based palette, two tones and a black outline) and its open question "should 8-bit go strictly to the hardware's rules or stay 8-bit-flavoured?" — this entry is the strict answer.
- 2026-10-24 · Lesson: a smaller pixel budget is a redrawing, never a shrunken copy; limbs get thicker, faces simpler.
