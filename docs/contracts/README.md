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

**The game manifest** (`games/<id>/game.json`) is small enough to live here:

```json
{ "id": "my-game", "name": "My Game", "genre": "platformer", "size": "toy", "stage": 2, "status": "active",
  "resolution": { "width": 320, "height": 180, "pixelScale": 3 },
  "entry": "game/index.html", "assets": "assets.js", "edits": "game/art/edits", "sound": "game/sound.js", "soundEdits": "game/sound/edits",
  "designs": { "art": "gba-bright", "sound": "wuxia-adventure", "game": "basics" }, "engine": "1" }
```

- Paths are relative to the game's own folder, so a game works wherever it's cloned into `games/`.
- `size` is `toy`, `demo` or `big`.
- `stage` goes from 1 (Idea) to 5 (Released).
- `designs` names the library entries the game started from; its own copies live in `design/`.
- A game imports the engine by relative path from `games/<id>/game/`: `../../../engine/...`.
