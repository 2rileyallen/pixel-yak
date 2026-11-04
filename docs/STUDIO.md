# The studio — the manual (for you and for the AI)

The studio is the desktop app where you and your AI make games together. The AI writes code: games,
art generators, music. You see every asset and song of every game, play it, paint over the art,
change the music, feel alternatives the AI exposes, and file requests. Your edits go back into the
game instantly and become lessons the AI learns your taste from.

**Launch:** `npm start` (or `launch.bat` on Windows). It opens on the game and view you had last.
Everything lives in plain files in this folder; nothing goes to a cloud.

```
 AI writes generators, songs, game code ──► the studio shows every asset and song ──► you play, paint, tune, ask
          ▲                                     (live, no restart)                          │
          │                                                                                  ▼
 the AI distills lessons into the game's ◄── every save is a lesson ◄── the game updates live
 design files (art.md, sound.md …)            (games/<id>/design/lessons/)
```

## Views (keys 1–8)
| View | What it's for |
|---|---|
| **1 Art** | Every visual asset of the open game, by category, including its font and UI widgets when the game registers them. **Painting:** pencil, eraser, fill, eyedropper, line, rectangle, shade ±, select/move/copy/paste/flip, mirror. **Viewing:** onion skin, hold C to compare with the AI's version, V to highlight your changes. **Timeline:** add, hold, reorder and remove frames; "In-betweens…" asks the AI. **"Do the same to other frames…"** carries a fix to sibling frames instantly. **Save** updates the running game and records a lesson. **Bake** locks a frame as final. **Revert** undoes your edit on a frame or the whole asset. |
| **2 Sound** | Every song and sound effect. A song is a tracker grid per track over a strip of the whole song. **Playing:** play, loop a section, solo/mute. **Editing:** notes (keys or buttons), instrument and track knobs, tempo. **Save** writes a sound edit (an overlay; the AI's version is kept) and a lesson. **Bringing music in:** import MIDI, hum a melody, or attach a WAV/MP3 as a reference for the AI. |
| **3 Inbox** | Requests between you and the AI, for the open game (Other games: pick one from a list that shows what waits in each; only that game's tickets load). **Brief me first:** the AI briefs each request (what it thinks you asked, what it would change, what it's unsure of, how big) and waits. You answer with **Go**, **Add note** or **Not now**. Tick "Just do it" when filing to skip the brief. F9 moments and players' tickets arrive here too. |
| **4 Lessons** | What the AI is learning from this game's art edits: each save as a before/after card, the **repaint scoreboard** (how much of each AI frame you repainted; it should fall), the game's `design/art.md`, and a Distill button that copies the prompt. |
| **5 Clips** | Short promo videos of the game, each made from a recipe. Watch one. Change its words, timing, music, length or shape in a form and **Re-render**, or **Probe** for stills. **New clip…** asks the AI for one. |
| **6 Designs** | The design library: art, sound and game design files a game starts from, and the Systems shelf (game code a game copies in). See swatches, samples and instruments, and which games use each. Buttons copy prompts to use, pull or promote one. |
| **7 Games** | Every game in `games/`: stage, size, designs, open requests, its engine version (or "shared engine"), Play, folder. Each card comes from a small summary, so 200 games cost little. **New game** copies the blank template, starts it from the design files you pick, makes it its own git repo, and files a kickoff request. |
| **8 Ideas** | Your backlog, in `local/ideas/`. Capture an idea fast, sort it into lanes, start a game from it. |

Help is on F1.

## While a game is playing (games opened from the studio)
| Key | What it does |
|---|---|
| **F9** | "Talk about this moment." It captures a screenshot, the last ~5 seconds as one picture, the game's state, the F8 values, recent console lines and a save of that exact moment (so the AI can load it), then opens a request with your note. |
| **F8** | The tuning panel: the knobs and variants the AI exposed. Change them live while you play; **Keep** the one that feels right and say why. Your choice becomes a lesson and the AI builds it in. |
| **F5** | Restart the game (it picks up code the AI just wrote). |
| **F12** | The game's developer tools. |

**Your saves are kept.** A game opened from the studio saves into the studio's own browser storage,
which a reinstall or a new computer loses. So the studio copies each game's saves to
`local/saves/<id>/` when its window closes and every five minutes while it runs (only when something
changed; the newest ten copies plus one a day for a month). When a game starts with no saves on this
computer and a copy exists, the studio asks before putting it back. Saves that are there are never
written over.

## Talking to the AI
- **Ask AI** (top bar, and in each view) writes a request. Pick the kind and how strong a model it
  needs: **smart** for design, new rigs, style learning, hard bugs; **builder** for content and small
  fixes.
- **Copy prompt** puts a short message on your clipboard to paste into your AI chat (any harness
  opened in this folder). The AI uses `node cli/yak.mjs`, briefs you, and marks each request done
  with what it changed. You watch it happen live.
- The AI can ask *you* things (reviews, decisions). Those show as "for you".
- The studio never calls an AI itself: no keys, no spending.

## For AI models: the CLI
`node cli/yak.mjs` lists every command. The ones you'll use most:

| Command | What it does |
|---|---|
| `inbox <game>` / `show` / `context <R-id>` | Read one game's requests (no game: a count per game); `context` gives everything about the target asset in one go |
| `decisions <game> [#n\|system\|word]` | Look decisions up in the register instead of reading it through |
| `plan` / `start` / `done` / `wontfix` | Brief, claim, close |
| `propagate <game> <asset> <pose>` | Carry the person's fix to sibling frames |
| `edits <game> [asset]` | What the person edited, as text |
| `sheet <game> [prefix]` | Contact sheet PNGs to look at |
| `sound` / `song` / `render-song` / `sound-lessons` | The music, as data and as WAV |
| `lessons <game> --new` / `distilled` | Art lessons and recording a distillation (skill art-learn) |
| `tuning <game>` | F8 choices to build in |
| `clips` / `clip` / `clip-new` | Promo clips |
| `designs` / `design` / `design-use` / `design-promote` / `design-diff` | The design library, including the systems shelf |
| `engine [game]` / `engine-diff` / `engine-pull` / `engine-adopt` | Each game's own engine copy: what's new in the harness, bringing it in on purpose |
| `games` / `new-game` / `check` / `test <game> [--changed\|--full]` / `hooks` | Games and their checks |
| `doctor` | Is this computer ready (Node, git and your git name, packages, ffmpeg), and which games a harness change could reach |

Skills (`.agents/skills/`) say how to use these for each kind of task. `AGENTS.md` has the table.

## Where everything lives
| What | Where |
|---|---|
| A game | `games/<id>/` with `game.json`. It is usually its own git repo. |
| The game's look, sound, design | `games/<id>/design/` (`game.md` the index, `systems/<id>.md` one page per system, `art.md`, `palette.js`, `sound.md`, `instruments.js`, `genre.md`) |
| The game's code | `games/<id>/game/` (`systems/` the rules, `scenes/`, `save.js`, `main.js`) on its own engine copy, `games/<id>/engine/` |
| **Your pixel edits** | `games/<id>/game/art/edits/<asset>.json` (+ generated `index.js`) |
| **Your sound edits** | `games/<id>/game/sound/edits/` (one file per edited song or effect) |
| **Your F8 choices** | `games/<id>/tuning/<knob>.json` |
| Lessons | `games/<id>/design/lessons/` (art `log.jsonl` + cards, `sound.jsonl`, `tuning.jsonl`, `distilled.jsonl`) |
| Requests | `games/<id>/requests/` (+ attachments and F9 save-states). About Pixel Yak itself: `local/inbox/`. |
| Clips | `games/<id>/clips/<name>.clip.json` (+ shot scripts); renders in `clips/out/` |
| The design library | `designs/<art|sound|game>/<id>/`; yours in `local/designs/` |
| **Your playtest saves** (a copy) | `local/saves/<id>/` |
| What your games taught | `local/LESSONS.md` (yours); `docs/LESSONS.md` ships with Pixel Yak |
| The file formats | `docs/contracts/` |

## Live sync
- The studio watches `games/`, `designs/`, `local/` and `engine/`. New games, assets, songs,
  requests, lessons and edits show up within a second, with a slow background sweep as a safety net.
  The sweep goes deep only into the games open this session or running; every other game is swept
  shallowly (its folder and requests), and history (`archive/`) and generated output are skipped. If
  the system drops file events under a burst, a sweep runs at once.
- On Linux, which has no recursive file watching of its own, the studio watches folder by folder:
  every folder of the games open this session, and only the folder and requests of the others — never
  `.git`, `node_modules` or history — so 200 games cost a few hundred watches, not a walk of the disk.
- **Each game loads when you open it.** The studio holds the open game's requests, lessons and
  edits; every other game is a small summary (counts) until you open it.
- A file that exists but can't be read (a merge conflict, a half-written file) is named in a
  warning, never skipped quietly. An edit file like that can't be painted over: the asset opens as an
  error, and saves wait until the file is fixed. A broken `game.json` keeps the game listed and open.
- Only **art code** reloads the art: the files a game's art host actually loaded. Game logic, tests
  and docs never trigger a reload.
- When the AI changes an asset you have open, the frames re-render in place and a toast names which
  ones changed. Your edits stay on top.
- **Live** in the top bar shows the activity log.

## Boundaries and security
- **Isolation:** each game's code runs in its own sandboxed frame and window, on its own origin
  (`studio://host-<id>`, `studio://play-<id>`, `studio://sound-<id>`). Games never share modules,
  globals or saves, and a game's origin can read only its own folder, the shared engine, the studio's
  frame pages and three.js — never another game, `local/` or the design library. Permission requests
  from a game (microphone, camera…) are refused; fullscreen and pointer lock are allowed. Opening a
  script file from the studio shows it in its folder instead of running it.
- **A game's code never becomes the studio's** (`studio/main/origins.mjs`, `tests/origins.test.mjs`):
  the studio's origin holds the bridge, so none of its pages can be framed (`frame-ancestors 'none'`),
  and it runs code only from Pixel Yak itself and the design library. A game's files reach it as data
  (pictures, sound, video, JSON, text), never as a page or a script, and no answer's type is guessed
  from its bytes.
- **Bridge:** the studio UI reaches the disk only through `studio/main/preload.cjs`. Every id is
  validated and every path checked to stay inside its folder.
- **Network:** nothing listens on it. `npm run web` is a separate read-only server on 127.0.0.1 for
  playing games in a browser; it answers only requests addressed to this computer and refuses dot
  folders, including through Windows short names (`GIT~1`).

## Testing the studio (look at your work)
`npx electron . --capture=<steps.json> --out=<dir>` runs the studio headless with a throwaway profile:
```json
{ "w": 1500, "h": 940, "steps": [
  { "until": "window.__studioReady === true", "timeout": 20000 },
  { "js": "__studio.go('sound'); 'ok'" }, { "wait": 800 }, { "shot": "sound.png" },
  { "js": "window.studio.game.launch('yak-trail').then(() => 'ok')" }, { "wait": 2000 },
  { "gameKey": { "project": "yak-trail", "key": "F8" } }, { "gameShot": { "project": "yak-trail", "file": "f8.png" } } ] }
```
- **Step kinds:** `wait`, `until` (a JS condition), `js`, `key` (+ `modifiers`), `click [x,y]`, `shot`,
  `gameShot`, `gameJs`, `gameKey`.
- **Output:** the PNGs plus `console.txt`. `window.__studio` is the app object.
- **Game capture tests** (`games/<id>/dev/tests/*.json`, run by `node tools/run-captures.mjs <id>`)
  are described in `docs/contracts/CHECKS.md`.
