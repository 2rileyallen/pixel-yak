# GBA Bright

A bright 16-bit handheld look: saturated hue-shifted ramps, crisp navy outlines, chunky readable sprites with a lit top edge, chunky framed UI and banded skies. Fits battlers, RPGs and action games that want colour and punch.

## The look in one paragraph
Think of the best handheld games of the early 2000s: small sprites that read instantly, colours that are rich but never muddy, and a clean dark outline around everything solid. Every material has its own five-step ramp whose shadows lean cool (blue, violet) and whose highlights lean warm (yellow), so even a dark corner stays coloured instead of grey. Light comes from the top-left, a little toward the viewer: top edges catch a rim of light, and where one part overlaps another a one-shade crease separates them. Backdrops are big horizontal bands of colour; the UI is chunky beveled frames with gold accents and a pixel font.

## Resolution and scale
- Native canvas: **320×180** (widescreen handheld, ×6 on a 1080p screen) or **240×160** (the classic handheld frame, ×4 letterboxed). Always whole-number scaling, smoothing off.
- Walking characters ~16–24 px tall (chibi, about 2 heads tall); battle fighters ~40–56 px (head about a third of the height); tiles 16×16; icons 8×8 or 12×12.
- Big enemies are drawn on the same pixel grid, just bigger. Never draw a giant with bigger pixels (mixels).

## Palette and material roles
`palette.js` is this design's code: 40 materials, each a ramp of 5 stops (0 = crease and deepest shadow, 1 = shadow, 2 = base, 3 = lit, 4 = small highlights only). Sprites paint a material and a shade, never an RGB value, so changing a ramp recolours every sprite and every edit the user painted.
- **People:** SKIN, HAIR (warm orange), ZHAIR (violet), TUNIC (red), SILK, FUR, ASKIN; INK is the outline and ground-shadow ramp.
- **Gear:** NAVY, RUST, GOLD, BOOT, SILVER, BONE, WOOD, SHELL, PAPER, LACQ (red lacquer), ABLUE.
- **World:** STONE (cool), STONE2 (warm), MOSS, LEAF, ORCHID, WATER, EARTH, SKY, DUSK, CLOUD.
- **Glow (emissive):** EYE, FIRE, ICE, THUNDER, SOUL, JADE, HAZE. They paint their own light: no rim, no crease, and they must read on the darkest background.
- **UI:** PANEL (dark frame fill), GOLD and LACQ for accents, WHITE for text.
- A game adds its own materials with ids from 100 up, so its ramps never collide with this list. Keep every hex in the palette unique: the studio reads a painted pixel back as material + shade by its colour.

## Shapes, outlines, shading, light
- **Outline:** a 1 px outline in navy `#0c1024` (INK stop 1) around characters, enemies and props, never pure black, because black flattens the colour around it. Effects take a self-coloured outline (`FIN_FX`) or none (`FIN_FLAT`).
- **Volume:** 3–4 shades of a material per form. Shade 4 is only for small highlights (a catchlight, a blade's edge); shade 0 only for creases and the deepest shadow.
- **Light:** top-left. The finish adds +1 shade on top edges (rim) and −1 where a front layer touches a back one (crease). Draw body parts as separate layers so the crease lands where parts overlap.
- **Clusters, not noise:** a lock of hair or a leaf is one deliberate shape of one colour. No orphan pixels, no pillow shading (a dark ring all around a light middle), no bands that just follow the edge.
- **Faces:** eyes 2–3 px tall with a catchlight; mouth 1–2 px; expression mostly in the brows and mouth.
- **Backdrops:** big horizontal bands, darkest at the top of a sky. Join bands with a short ordered dither only if the game wants it; otherwise hard band edges.

## Motion
Two motion systems, never mixed on one sprite:
1. **Move a still sprite** (bob, sway, slide, squash on landing) — the art stays one frame; the code moves it by whole pixels.
2. **Step frames** at 6–12 fps: walk cycles of 4, idles of 2–4, attacks with anticipation, a smear frame and a hold on the hit.
No per-pixel wobble and no rotation of pixel art (rotated pixels break the grid). Hits: a whole-sprite white flash for 1–2 frames, hit-stop, and a little knockback.

## UI (frames, font)
Chunky beveled frames, 2–3 px, drawn as 9-slices from PANEL with GOLD or LACQ trim; pixel font from the engine (`engine/shell/font.js`), white text with a dark shadow pixel. Bars are framed pixel bars with a bright top row. Everything is drawn in code at the game's resolution — no browser UI inside a game.

## Style knobs
| Knob | This look's position |
|---|---|
| **Pixel budget** | 16-bit: ~20 px walkers, ~48 px fighters |
| **Line** | dark navy outer outline; no inner ink lines |
| **Shading model** | banded 3–4 tones, rim on top, contact crease |
| **Palette** | full ramps, saturated, hue-shifted (cool shadows, warm lights) |
| **Dithering** | none on sprites; at most a short ordered dither between sky bands |
Turn one knob to get a sibling look: "line → selective outline" softens it; "palette → bright end of each ramp, shading → cel 2-tone" makes it anime-like.

## Do / Don't
**Do**
- Paint materials and shades; add a new material to `palette.js` rather than inventing a colour in sprite code.
- Judge every sprite at 1× on its real background, because zoomed-in art lies about readability.
- Keep silhouettes chunky and distinct, so a character reads from its shape alone.
- Make big things big: bosses and rulers two or three times the hero's height.

**Don't**
- Use pure black outlines, grey ramps, or smooth gradients.
- Rotate or scale pixel art at runtime, or mix pixel sizes.
- Animate single pixels independently (blinking speckles read as noise); only whole shapes pulse.
- Put browser text or CSS UI inside a game.

## Exemplars
- **A side-view hero** ~48 px tall, red tunic, orange hair in three clusters, navy outline, a lit rim along the hair and shoulders, a crease where the arm crosses the body.
- **A beast twice the hero's size**, strong silhouette, glowing eyes (an emissive material that stays bright in the dark).
- **A ruined-temple backdrop**: a dusk sky in four hue-shifted bands, distant columns in cool stone, warm light on the nearest step.
- **A battle menu**: a navy 9-slice frame with a gold bevel, white pixel text, a red-to-gold health bar.
The user's own repaints outrank all of these: when they bake or heavily repaint an asset, it becomes this look's first exemplar (skill art-learn).

## How to ask for an asset in this look
Name the asset and its job, its size, its poses, and anything special. For example:
- "A 16×24 walking villager for the town: 4-frame walk in four directions, green apron (LEAF), grey hair (SILVER)."
- "A 64×56 boss beast, idle (2 frames) and a 3-frame bite with a hold on the hit; it should loom over the 48 px hero."
- "A 9-slice menu frame and a 12×12 icon set for fire, ice and thunder skills."
Saying what to keep and which knob to turn ("same hero, but sel-out the outline") gets a predictable change.

## Changelog
- 2026-11-02 · Library entry written from the first style this harness grew out of: its rules (outline, ramps, light, proportions, bands, UI frames), its palette and the assets the user liked best. Not yet learned from the user's own edits: every rule is a starting guess until a distillation confirms it.
- 2026-10-24 · Lesson: light and effects belong at the sprites' own resolution; HD light over pixel sprites clashes.
