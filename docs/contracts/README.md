# Contracts: the file formats Pixel Yak's parts agree on

Pixel Yak is modular. The studio, the CLI, the engine and each game are separate boxes that only meet
through these formats. Keep a format and you can rebuild either side of it freely. Change a format on
purpose: update its page, bump its version string, and keep reading the old version where you can.

| Contract | What it covers | Page |
|---|---|---|
| Art | Registry entries (id, size, anchor, poses, anims, gen), the person's edit overlay (patch / baked), deterministic generators, font and widgets as art | [ART.md](ART.md) |
| Sound | Songs in tracker notation, instruments, SFX recipes, the sound edit overlay, sound lessons | [SOUND.md](SOUND.md) |
| Requests | Tickets between the person and the AI: kinds, statuses (open → planned → approved → in-progress → done), the brief, notes, claims | [REQUESTS.md](REQUESTS.md) |
| Moments (F9) | What a game hands over when the person presses F9: state, a save-state, the last seconds | [MOMENTS.md](MOMENTS.md) |
| Tuning (F8) | Knobs and variants a game exposes, kept choices, tuning lessons | [TUNING.md](TUNING.md) |
| Design files | The library's shelves (art, sound, game), a DESIGN.md's sections, code twins, use / promote / pull | [DESIGN-FILES.md](DESIGN-FILES.md) |
| Clips | A clip recipe: shots, cards, captions, music, shape and length | [CLIPS.md](CLIPS.md) |
| Checks | `checks.json` (which checks for which change) and the capture-test step format | [CHECKS.md](CHECKS.md) |
| The engine copy | Each game's own `engine/` (version, `COPY.json`), its public modules, what is frozen | [engine/README.md](../../engine/README.md), [CHANGELOG](../../engine/CHANGELOG.md) |
| A world save | `pixel-yak-world@1`: `{ tick, seed, systems: { <id>: { v, data } } }` — every system's slice under its own version; what F9 moments and `game/save.js` store | `engine/shell/systems.js` (top of the file) |

**The game manifest** (`games/<id>/game.json`) is small enough to live here:

```json
{ "id": "my-game", "name": "My Game", "genre": "platformer", "size": "toy", "stage": 2, "status": "active",
  "resolution": { "width": 320, "height": 180, "pixelScale": 3 },
  "entry": "game/index.html", "assets": "assets.js", "edits": "game/art/edits", "sound": "game/sound.js", "soundEdits": "game/sound/edits",
  "designs": { "art": "gba-bright", "sound": "wuxia-adventure", "game": "basics", "systems": ["follow-camera"] }, "engine": "2" }
```

- Paths are relative to the game's own folder, so a game works wherever it's cloned into `games/`.
- `size` is `toy`, `demo` or `big`.
- `stage` goes from 1 (Idea) to 5 (Released).
- `designs` names the library entries the game started from; its own copies live in `design/`
  (`systems` lists the systems it copied in).
- `engine` is the version of the game's own engine copy (`games/<id>/engine/version.json`; set by
  `new-game`, `engine-pull`, `engine-adopt`). A game imports **its own copy** by relative path:
  `../engine/...` from `game/` and `design/`. Nothing a game ships may import from outside its folder
  (`yak check` errors on it); its tooling (`dev/`, `web/`) may use the harness's CLI and data layer.

## A game's pages: the reading budget
Starting any task on any game should cost a few thousand tokens, however big the game grows. So the
pages an AI reads before a task stay short, and `node cli/yak.mjs check <game>` warns past these:

| Page | Words | What it holds |
|---|---|---|
| `AGENTS.md` | 1,000 | the one page: Now, what it is, which file for which task |
| `design/game.md` | 1,200 | the index: the game in a sentence, pillars, the loop, the list of systems |
| `design/systems/<id>.md` | 1,500 each | one system's rules, decisions, events, code, save version |
| `design/art.md`, `design/sound.md` | 1,500 | the look and the sound |
| `ENGINEERING.md` | 1,500 | the code map, how to run and check, saves, the engine copy |

`DECISIONS.md` has no limit because nobody reads it through: `node cli/yak.mjs decisions <game>
<#n | system | word>` looks entries up (its table has a System column). History goes to `archive/`,
which searches skip (`.ignore`).
