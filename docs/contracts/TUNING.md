# Tuning (F8) — knobs, variants and the choices the user keeps

When "better" is unclear, the game offers 2–4 real alternatives the user can **feel while playing**.
Game code declares them with `engine/link/studio.js`; F8 opens a pixel-art panel over the running game;
**Keep** saves the user's choice for the AI to build in.

## In game code
```js
import { studio } from '../../../engine/link/studio.js';
studio.attach(screen); // optional (createScreen's screen): the panel uses the game's own pixel size
const speed = studio.knob('Kobold walk speed', 1.0, { min: 0.5, max: 2, step: 0.1 });
const title = studio.variant('Title music', ['A · calm harp', 'B · war drums', 'C · music box']);
const roof  = studio.variant('Warren roof art', ['warren_roof_a', 'warren_roof_b']);

x += speed() * dt;              // a getter: call it every frame, it's a plain function call
playSong(SONGS[title()]);       // a variant returns the chosen option itself …
sprite(roof(), 'idle');         // … so options can be keys, asset ids, colours
title.index();                  // … or its position (0, 1, 2)
```
- Make each knob **once, at load** (module top level); read the getter wherever it's needed.
- The **name is the identity**: its slug (`kobold-walk-speed`) names the files. Renaming makes a new knob.
- Knob options: `min`, `max`, `step` (sensible defaults from the value). Variant option: `{ default: i }`.
- Variant letters: a label starting `A ·`, `B ·` … shows that letter; otherwise A, B, C by position.

## Where it's live
| Opened… | Knobs and variants | F8 | Keep |
|---|---|---|---|
| from Pixel Yak (`window.studioLink`) | live values | the panel | writes the files below; the studio shows "Kept B · war drums for Title music" |
| with `?tune=1` (any browser) | live values | the panel | copies a one-line summary to the clipboard to paste to the AI |
| anywhere else (a shipped build) | the code's default | nothing | — |

In a shipped build nothing is drawn, listened to, stored or loaded: every getter returns its default.

## The panel (F8)
↑↓ pick · ←→ change (Shift: ×10 for knobs) · **K** (or Enter) keep, then type an optional one-line *why*
and Enter (Esc cancels) · **R** reset to the code's default · **Tab** move to another corner · **Esc** or
**F8** close. Mouse: click a row, drag a slider, click an option, the wheel nudges what it's over.
A row shows ✓ when its value is the one kept, a dot when it differs from the code's default.
While open the game keeps running; the panel takes only the keys above (WASD still plays) and clicks
on itself.

**Live values** persist across F5 per game (localStorage `yak-tune:<slug>` = `{ "v": value, "d": default }`).
A stored value only applies while the code's default is still `d`, so a default the AI changed wins.

## Files (written by the studio on Keep)
`games/<id>/tuning/<slug>.json` — a kept choice the AI hasn't built in yet (a newer Keep replaces it):
```json
{ "format": "pixel-yak-tuning@1", "name": "Title music", "slug": "title-music", "kind": "variant",
  "chosen": "B · war drums", "label": "B · war drums", "default": "A · calm harp",
  "options": ["A · calm harp", "B · war drums", "C · music box"],
  "note": "drums fit a dragon", "at": "2026-11-02T15:14:58.643Z", "by": "user" }
```
A knob has `"kind": "knob"`, numbers for `chosen` / `default`, and `"range": { "min", "max", "step" }`
instead of `options`.

`games/<id>/tuning/done/<slug>.json` — the same, plus `doneAt` and `doneNote`, once it's built in.

`games/<id>/design/lessons/tuning.jsonl` — one line per Keep (never rewritten):
```json
{"id":"L-tune-261102151458-fdc","ts":"…","kind":"tuning","game":"<id>","name":"Title music","slug":"title-music","chosen":"B · war drums","default":"A · calm harp","options":[…],"note":"drums fit a dragon","lesson":"Kept B · war drums for Title music (over A · calm harp, C · music box) — drums fit a dragon","by":"user"}
```

## The CLI
- `node cli/yak.mjs tuning <game>` — kept choices not built in, one line each (with where the knob is
  made in the code), and what to do.
- `node cli/yak.mjs tuning <game> --done <slug> "what you changed"` — mark one built in.
- `--all` also lists the built-in ones.

## For tools and tests
`window.__yakLink.tune` (only when tuning is live): `list()`, `set(name, value)`, `keep(name, note)`.
