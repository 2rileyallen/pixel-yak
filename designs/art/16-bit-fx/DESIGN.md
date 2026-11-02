# 16-Bit FX

A dark, moody 16-bit look whose atmosphere comes from pixel FX: light pools, haze, soft smoke, glow and shadow drawn on the sprites' own pixel grid. Fits dungeon crawlers, action games and battlers that want drama without leaving pixel art.

## The look in one paragraph
Sprites with the budget of the 16-bit era (about 40 px heroes, three shade bands, the major lines of a body and nothing finer) in a world of near-black stone lit by its own fires, crystals and magic. Shadows lean blue-violet, lights lean warm. The atmosphere is a separate light pass over the finished frame: the scene sinks to a low ambient, warm and cool pools of light open around their sources, glowing things bloom softly, haze lifts the far wall and the bottom of the screen falls into shadow. Every bit of that light is computed at the sprites' own pixel size, so effects and sprites share one grid and nothing looks like a filter laid on top.

## Resolution and scale
- Native canvas **320×180** (×6 on a 1080p screen), whole-number scaling, smoothing off.
- Heroes ~36–44 px tall (about 5 heads), regular enemies up to 1.5× the hero, bosses far bigger. Heads 8–11 px, drawn as hand-made templates rather than rendered shapes, because faces at that size need deliberate pixels.
- 16×16 tiles. Effects at the same pixel size as the sprites.
- A giant is drawn on the same grid, bigger than the screen, shown in part (the crop says how big it is). Never with bigger pixels.

## Palette and material roles
`palette.js` is this design's code: 27 materials, each a ramp of 5 stops (0 line and crevice, 1 shadow, 2 base, 3 lit, 4 highlight).
- **People and gear:** SKIN, HAIR, CLOTH (navy), RED, TEAL, DARK (near-black cloth), WHITE, LEATHER, STEEL, GOLD, BONE, WOOD.
- **World:** WALL, FLOOR, ROCK (all near-black, so the light carries the room), MOSS, WATER, FOG (haze and smoke).
- **Emissive:** EMBER (fire), CRYSTAL (cold blue), MAGIC (violet), RUNE (red), GLOW (teal). They paint their own light, take no crease, and the light pass never dims them.
- **Light colours:** LWARM and LCOOL; stop 4 of each is the colour a light pool adds.
- **UI:** PANEL, with GOLD and WHITE.
A game adds its own materials from id 100 up. Keep every hex unique: the studio reads a painted pixel back by its colour.

## Shapes, outlines, shading, light
- **Outline:** selective — each outline pixel takes the darkest stop of the material it touches (`FIN` uses `outline: 'self'`), so dark figures don't get a hard ring and light ones keep a clean edge. Inner contour lines only on major forms.
- **Shading:** three bands per form, a top rim only where it makes an unbroken run of three or more pixels (single rim pixels read as noise), cast shadows on the floor, no fine folds.
- **Light pass (`fx.js`, `pixelFx`):** run once per frame over the finished picture at native resolution:
  - ambient around 0.35–0.45, so unlit areas are dark but readable;
  - a pool per light source (fire, crystal, a spell, an attack's telegraph), coloured from LWARM / LCOOL;
  - emissive pixels kept at full strength with a two-pixel bloom;
  - haze toward the top (far), shadow toward the bottom edge, a light vignette.
  This is where the mood lives: drop the haze, smoke and floor shadow and the picture is just "a little darker".
- **Lights breathe, never strobe:** a light's strength drifts slowly (once every 1.5 s or slower), and a whole light moves together. Only a whole shape may pulse (both eyes, a flame); single pixels never blink on their own.
- Lit colours from the pass are not palette colours: paint-overs happen on the sprites, before the pass.

## Motion
Two systems, never mixed on one sprite: move a still sprite (slide, bob, knockback), or step frames — 8–12 fps for most moves, up to 16–20 fps on the fastest attacks. Fast moves get a smear frame along the weapon's real path and an afterimage or two; heavy hits get hit-stop, a short shake, sparks and dust. Fire and smoke move as whole shapes over 3–4 frames.

## UI (frames, font)
Dark 9-slice frames from PANEL with a thin GOLD or STEEL trim, icons at 12×12, the engine's pixel font at its small size. The HUD sits outside the light pass (it stays readable) and stays small; telegraphs and status live on the fighters and the floor.

## Style knobs
| Knob | This look's position |
|---|---|
| **Pixel budget** | 16-bit: ~40 px heroes, 8–11 px heads |
| **Line** | selective outline, inner lines on major forms only |
| **Shading model** | banded, three tones, cast shadows on the floor |
| **Light** | low-key: dark ambient, coloured local pools, back-lit rims on dark figures |
| **Atmosphere** | haze, soft smoke, bloom — at pixel size |
| **Dithering** | none, anywhere |

## Do / Don't
**Do**
- Draw every effect, glow and light pool at the sprites' own resolution, because sprites and effects on one grid read as one world.
- Keep the haze, the soft smoke and the darker bottom edge: that is the ambiance.
- Let light sources be things in the world (a brazier, a crystal, a spell), so the light has a reason.
- Redraw for this budget rather than shrinking a bigger sprite; "push it to 16-bit" means new drawings.

**Don't**
- Lay HD light or HD effects over the 16-bit sprites: it reads as too polished and clashes with the pixels.
- Snap light to palette steps with dithering, or flicker torches fast: pixels flip shades every few frames and the scene looks like it's jumping.
- Cycle palettes per pixel, add scanlines or a CRT filter, or shimmer with heat haze: each was tried and rejected.
- Mix pixel sizes (no mixels) or rotate pixel art.

## Exemplars
- **A cloaked wanderer** in a dark hall: navy cloak with a lit edge, a red scarf as the one warm accent, a sword held low (see `sample.js`).
- **A brazier** whose flames step through three whole shapes, throwing a warm pool across the floor.
- **A hall corner** under the light pass: a warm pool from the fire, a cool one from a crystal, haze on the far wall, the floor's front edge in shadow (`sample_scene`).
- **A boss far bigger than the screen**, on the same pixel grid, shown waist up with its crown cut off by the top edge, its eyes the only hot colour.

## How to ask for an asset in this look
Name the asset, its size and poses, its light (does it emit? what colour?), and its motion. For example:
- "A 40 px knight: idle (2), a 4-frame slash with a smear and a hold on the hit; steel and dark cloth, a red plume."
- "A wall torch: 3 flame frames, a warm light that breathes slowly; add the light to the scene's light list."
- "A spell effect: a violet burst, 5 frames at 12 fps, emissive, with a cool light that fades over half a second."

## Changelog
- 2026-11-02 · Library entry written from a style lab's experiments that drew one fight at three pixel budgets and in seven style looks.
- 2026-10-24 · Lesson: 16-bit sprites under an HD light-and-effects layer looked "too polished for the pixels, it conflicts"; the same light, haze, smoke and glow computed on the 16-bit grid kept the ambiance without the clash. This look is that answer.
- 2026-10-24 · Lesson: palette-locked 16-bit lighting was rejected — dithered light, fast torch flicker, per-pixel palette cycling, CRT scanlines and heat shimmer all read as flashing, jumping or noisy.
- 2026-10-24 · Lesson: a giant drawn with bigger pixels reads as an upscaled sprite; draw it on the same grid and crop it.
