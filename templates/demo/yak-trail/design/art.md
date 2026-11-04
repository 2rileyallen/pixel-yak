# Yak Trail — art design

> This game's own copy, started from `designs/art/gba-bright` (library) on 2026-11-02. It grows with
> the game; promote it back to the library when it's worth reusing.

How Yak Trail looks. Its code twin is `palette.js` (GBA Bright's ramps plus Yak Trail's own, ids 100+).

## The look in one paragraph
A bright 16-bit handheld look on a clear mountain day: crisp navy outlines on everything that moves or
stands on the trail, light from the top left, a blue sky in dithered bands, hazy snow-capped peaks
behind a darker ridge of pines. The yak is a warm chocolate brown with a tawny fringe over its eyes and
cream horns; the trail goes from green meadow to grey stone to snow as it climbs.

## Resolution and scale
320×180, shown at whole-number scales. Tiles are 16 px; the yak is 32×24.

## Palette roles
| Material | Used for |
|---|---|
| `YAK` (100) | the yak's coat: shade 3–4 on the back, 1–2 in the long hair, 0 at the hem |
| `EARTH` | the yak's fringe; the meadow's dirt |
| `BONE`, `STONE2` | horns; the muzzle, rocks and stone paths |
| `GRASS` (104), `MOSS` | meadow turf and tufts; frosted tufts |
| `WHITE` | snow, snow caps, the font's ink |
| `DAY` (101) | the sky, top (0) to horizon (4) |
| `PEAKS` (102), `RIDGE` (103) | the far range, the near ridge |
| `FLAG` (105), `GOLD`, `IRIS` | the summit bunting and cairn pennants; the title logo (`GOLD`) |
| `NAVY`, `INK` | UI panels (the engine's default widgets), outlines |

## Shapes, outlines, light
- Things on the trail (yak, rocks, tufts, cairns, birds) get the navy outline and a top rim light.
- Backdrops (sky, ranges, clouds) and ground strips have no outline: they sit behind.
- Light from the top left: left faces of peaks lit, right faces in shade.

## Motion
Walk: 6 frames at 4–10 fps (faster as the yak speeds up). Idle: 4 poses (a breath, a tail flick, a
blink). Tufts sway at 3 fps, flags wave at 3 fps, birds flap at 12 fps. Clouds and ranges move whole,
a pixel at a time.

## UI
The engine's font (`font`) and widgets (`ui_panel`, `ui_bar`, `ui_scrollbar`, `ui_checkbox`) are this
game's art entries, so they can be repainted like anything else. Text is white with a navy outline
over the world, white on navy in panels; gold for headings.

## Do / Don't
(rules learned from the user's edits land here, each citing the lessons behind it)
