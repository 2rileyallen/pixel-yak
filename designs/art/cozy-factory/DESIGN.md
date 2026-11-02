# Cozy Factory

A soft top-down look for building and automation games: calm ground, chunky buildings that read at a glance, visible goods, and warm light drawn at the sprites' own pixel size. In the spirit of cozy top-down farming and factory games.

## The look in one paragraph
A small, modern pixel-art world seen from a three-quarter top-down camera, where a crowded base still reads clean. The ground is quiet and lighter than the walls, so open space is obvious and machines, workers and items pop off it. Buildings are chunky and few-coloured, each era of technology has one material family (primitive: wood, clay, rope, stone, hide, fire; later: iron with copper accents), and a building's state reads at a glance from a little lantern on its corner. What the factory makes is visible: stores show their stacks, carts show their load. Light comes from the scene's own fires and glows as soft pools on the floor, drawn on the same pixel grid as everything else.

## Resolution and scale
- Native canvas around **480×270** (×4 on a 1080p screen); the game fills the window at the largest whole-number scale and offers fullscreen, because a letterboxed factory feels far away.
- 16×16 tiles. Workers ~12–20 px tall (chibi). Buildings sit on whole-tile footprints (2×2 = 32×32 is the common size) and may stand taller than their footprint.
- **Upgrades grow upward**: a better version keeps the same footprint and gets taller (a chimney, a bigger crucible, a banner), so a tight layout stays valid and still shows progress.
- **Scale for importance**: rulers and bosses are drawn two to three times the player's size.

## Palette and material roles
`palette.js` is this design's code: 31 materials, each a ramp of 5 stops (0 crease … 4 highlight). Sprites paint material + shade, never RGB.
- **Ground:** GROUND (warm, calm floor), ROCK (walls, darker than the floor), HARD (cool hard rock), BED (bedrock), GRASS (a quiet meadow), LEAF, WATER.
- **Primitive tech:** WOOD, CLAY, STONE, EARTH (mud), ROPE (rope, wicker, log ends), HIDE, BONE.
- **Industrial tech and goods:** IRON (the later machine metal, a cool lavender), COPPER (accents and bands), GOLD, GEM, BANNER.
- **People:** SKIN, HAIR, CLOTH, WHITE; INK is the outline and ground-shadow ramp.
- **Glow:** FIRE, GLOW (teal mushrooms and magic) and three dim light-pool ramps — LWARM (fire), LGOLD (treasure), LTEAL (glow) — drawn under light sources as soft pools.
- **UI:** PANEL, with GOLD and WHITE.
A game adds its own materials from id 100 up. Keep every hex unique: the studio reads a painted pixel back by its colour.

## Shapes, outlines, shading, light
- **Chunky silhouettes, few colours per object** (two or three materials), because a base of fifty buildings must still read.
- **¾ boxes:** a lit top face over a front face; the left column one shade lighter, the right one darker; the front edge lit. Domes are lit balls cut flat where they sit.
- **Outline:** 1 px navy `#0c1024` around buildings, workers and items; none on ground tiles and light pools.
- **Light:** top-left for form; the scene's own lights (forges, torches, glowing goods) as soft pools on the floor and darkness toward the screen edges.
- **Light at pixel size**: light pools, glow and haze are drawn at the sprites' own resolution with smooth colour; never an HD light layer over pixel sprites (it clashes), never dithered light, no strobing flicker, no scattered pixels blinking on their own.
- **Quiet ground:** flat floor with sparse tufts or pebbles, no streaky noise, so it never competes with the factory.
- **Honest footprints:** what looks solid is solid, empty corners are walkable; if the game takes collision from the art, keep a building's base true to its footprint.

## Motion
Two systems, never mixed on one sprite: move a still sprite (bob, slide, a squash when a building finishes), or step frames at 6–12 fps.
- **Only a working building animates**; an idle or starved one is still, and its lantern says why (lit = working, slow blink = waiting, out = starved).
- Fire, steam and smoke move as **whole shapes** over 2–4 frames; a torch breathes slowly rather than flickering.
- Workers walk when there's slack and run when the line is tight; a waiting worker fidgets.

## UI (frames, font)
9-slice pixel frames from PANEL with a GOLD or COPPER trim; the engine's pixel font; numbers big and whole. Panels show state (rates, counts, a building's lantern colour), not sentences — a "?" opens the help. Route lines and labels appear on demand (hover or a key), never piled up on screen.

## Style knobs
| Knob | This look's position |
|---|---|
| **Pixel budget** | small modern pixel art: ~16 px workers, 32 px buildings, 16 px tiles |
| **Detail** | readable, leaning iconic: shapes and a few clusters, no fine texture |
| **Light** | top-left form light plus warm local light pools; low-key edges |
| **Atmosphere** | soft glow and haze at pixel size; no dithering |
| **Palette** | full ramps, warm and calm ground, one bright accent per good |

## Do / Don't
**Do**
- Give each era of tech its own material family, so a building's age reads at a glance.
- Show goods: stores display their stacks, carts their load, machines their output.
- Make status visible on the building itself (the lantern), where the player is already looking.
- Judge a building in a crowded base at 1×, next to its neighbours.

**Don't**
- Put gears, levers or pistons on primitive buildings; save machinery for the era that has it.
- Use round dials or text on buildings to show state.
- Draw streaky, noisy ground, or ground brighter than what stands on it.
- Light the scene with an HD layer, dithered light rings or fast flicker.

## Exemplars
- **A clay kiln** on a 2×2 footprint: a fieldstone plinth, a coiled clay dome, a squat chimney, a fire mouth whose flames move as whole shapes, a lantern on its front corner (see `sample.js`).
- **A crate of goods** whose top shows three gold bars, so the store's content reads without a label.
- **An ingot pyramid** as a centrepiece of wealth: crisp stepped bars with a bright top edge (a soft, round gold heap read as mud).
- **A dark cave floor** lit by a forge: a warm pool around it, the floor quiet, the walls darker, the corners falling into shadow.
The user's own repaints outrank all of these once they exist (skill art-learn).

## How to ask for an asset in this look
Name the building or item, its footprint, its era, its states, and what it shows. For example:
- "A 2×2 primitive smelter: cold, and three working frames; fire in the mouth, a lantern on the front-right corner, clay and stone only."
- "Version 2 of the kiln: same footprint, taller — add a second chimney and copper bands."
- "Icons for six goods at 8×8, each one bright accent colour so they read on the belt."

## Changelog
- 2026-11-02 · Library entry written from the look of a big factory-automation game built with this harness: its art direction, the user's verdicts on its prototypes and its palette.
- 2026-10-25 · Lessons: the screen must fill the window; a lighter, calmer floor with darker walls reads cleaner; primitive tech must look primitive (no machine metal before its era); a soft gold heap read as mud, crisp stepped bars read as treasure; light rings looked unnatural.
- 2026-10-24 · Lesson: light and effects at the sprites' own resolution, smooth colour, no dithering, no strobing, only whole shapes pulse.
