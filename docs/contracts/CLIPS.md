# Clips — the promo clip recipe

A clip is a short video of a game (Shorts, Reels, a teaser), made from a **recipe**:
`games/<id>/clips/<name>.clip.json`. The recorder (`tools/clip.cjs`) films the recipe into
`games/<id>/clips/out/<name>.mp4`. Because the recipe is data, a clip is cheap to tweak and re-render,
and a good one is the template for the next. Clip names are lowercase letters, digits and dashes.

Made with: the studio's **Clips** view, `node cli/yak.mjs clips <game>` · `clip <game> <name> [--probe]` ·
`clip-new <game> <name>`, and the skill **promo**. Data layer: `studio/data/clips.mjs`.

## The recipe

```json
{
  "format": "pixel-yak-clip@1",
  "title": "Teaser",
  "aspect": "9:16",
  "length": 15,
  "fps": 30,
  "page": "game/index.html?level=3",
  "ready": "window.__game && window.__game.ready",
  "settle": 500,
  "setup": "teaser.setup.js",
  "shot": "teaser.shot.js",
  "titleCard": { "from": 0, "to": 2, "text": "Moss Knight", "sub": "a first look", "backdrop": "dim" },
  "captions": [
    { "from": 2.5, "to": 5, "text": "Every pixel here is code", "pos": "bottom" }
  ],
  "endCard": { "from": 13.4, "to": 15, "text": "Moss Knight", "sub": "coming soon", "backdrop": "solid" },
  "music": { "song": "theme" },
  "out": "teaser.mp4"
}
```

| Field | What it is | Default |
|---|---|---|
| `aspect` | `9:16` (1080×1920), `16:9` (1920×1080) or `1:1` (1080×1080) | `9:16` |
| `length`, `fps` | seconds (1–180), frames a second (12–60) | 15, 30 |
| `page` | the page to boot, relative to the game folder, with any query | game.json `entry` |
| `ready` | JS that is truthy once the game can be filmed (polled up to 60 s) | page loaded |
| `settle` | ms to wait after `ready` | 500 |
| `setup` | a JS file next to the recipe, run once before filming (awaited) | none |
| `shot` | a JS file next to the recipe, run the moment filming starts | none |
| `titleCard`, `endCard` | `{ from, to, text, sub, backdrop }`, backdrop `dim` · `solid` · `none`; or `null` | none |
| `captions` | `[{ from, to, text, pos }]`, pos `top` · `middle` · `bottom` | `[]` |
| `music` | `{ "song": "<song id of this game>" }` or `null` | `null` |
| `colors` | optional `{ text, shade, box, border, accent, bg }` as `#rrggbb` | studio navy + gold |
| `probeAt` | optional times (s) for probe stills | start, each card/caption, end |
| `out` | the MP4's file name | `<name>.mp4` |

Times are seconds on the clip's clock. A card or caption shows while `from ≤ t < to`. Unknown fields are
kept when the studio saves the form (it only changes aspect, length, the cards, captions and music).

## Setup and shot scripts
Plain JS **expressions** (usually an arrow function called at once) evaluated in the game page; they may
return a Promise and a small JSON-able summary (printed). The page has `window.__clip`:
`t()` seconds since the first frame · `length` · `fps` · `aspect` · `started()`.
Move things by `__clip.t()`, never by counting frames: frames are paced by the wall clock.
```js
// teaser.shot.js
(() => {
  const cam = window.__game.camera;
  const tick = () => { const t = __clip.t(); cam.x = 40 + t * 12; if (t < __clip.length) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { from: cam.x };
})()
```

## How it is filmed
- **A committed version, never the working tree**: `git archive` of the game at `--ref` (default `HEAD`;
  the game's own repo, or the harness when the game is committed there) plus the harness's `engine/`,
  `cli/`, `studio/data/`, into a temp folder. The recipe and its scripts are read as they are now (they
  direct the film; they are not the game). A game with no commit can't be filmed (the error says how).
- Offscreen Electron window, throwaway browser profile: no visible window, the user's saves untouched.
- The window is the output size divided by the largest whole factor `k` that still fits the game, so the
  game draws at its own whole-number scale and ffmpeg scales every frame up `k` times, nearest-neighbour.
- The words are drawn in the engine's pixel font (`engine/shell/font.js`) on an overlay with one pixel
  per game pixel: captions about 4% of the short side, the title twice that. 9:16 keeps words out of the
  top 12% and bottom 20% (the apps' buttons sit there).
- Music: `node cli/yak.mjs render-song <game> <song> --out <wav> --seconds <length>` in the copy, muxed as
  AAC with a 1.5 s fade-out. If that command doesn't exist, the clip is made without music and says so.
- Needs **ffmpeg** (the `FFMPEG` environment variable — the program or its folder — or `ffmpeg` on the
  PATH; not bundled) and **git** + **tar** (both ship with Windows 10+, macOS, Linux).

## What it writes
| File (all in `games/<id>/clips/out/`, gitignored) | What |
|---|---|
| `<out>.mp4` | the clip (H.264 + AAC, faststart) |
| `<name>.json` | what was filmed: `at`, `game {commit, subject, dirty}`, `harness`, `media {duration, width, height, fps, audio}`, `music`, `bytes`, `consoleErrors`, `notes` |
| `<name>-probe/still-<t>s.png` + `probe.json` + `console.txt` | `--probe`: stills at window size, no video |

`local/clips.json` — `{ "copyTo": "<folder>" }` also copies each MP4 to `<folder>/<game id>/` (the
user's own setting; the studio keeps its copy in `clips/out/` to play).

## The recorder's progress lines
`<electron> tools/clip.cjs <game> <name> [--probe] [--ref <rev>] [--music-file <wav>] [--cancel-file <path>]`
prints one `CLIP {json}` line per step (`parseClipLine` reads them): `{stage, text}` ·
`{stage: "film", frame, of}` · `{note}` · `{error, console}` · `{cancelled: true}` · `{done: true, …}`
(the render info above, or `{probe: true, dir, stills}`). When `--cancel-file` appears the run stops and
removes what it made. `--music-file` uses a WAV of your own instead of rendering the song.
