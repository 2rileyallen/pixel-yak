# The sound contract

A game's music and sound effects are **data written in code**: songs in a tracker notation, sound
effects as recipes, instruments as parameter sets. The engine (`engine/sound/`) turns that data into
sound sample by sample — in the game (an audio worklet), in the studio, and in Node (WAV renders,
tests). The user sees every song in Pixel Yak's **Sound view** as a grid, changes notes and knobs,
and saves; their changes are kept in separate files and laid on top at load, so the AI can keep
improving its songs without ever touching what the user changed. No audio files ship in a game.

## Where it lives

| File | What it is |
|---|---|
| `game/sound.js` (game.json `"sound"`) | exports `SOUND = defineSound({ … })` — the game's songs, sound effects and instruments |
| `design/instruments.js` | `export const INSTRUMENTS = { … }` — the game's own instruments (copied from a sound design, then grown) |
| `design/sound.md` | how the game sounds, in words (the design file; skill sound-learn keeps it current) |
| `game/sound/edits/` (game.json `"soundEdits"`) | the user's edits: `song.<id>.json`, `sfx.<id>.json`, `instruments.json`, and a generated `index.js` |
| `design/lessons/sound.jsonl` | one line per save in the Sound view: what the user changed and why |

```js
// game/sound.js
import { defineSound } from '../../../engine/sound/index.js';
import { INSTRUMENTS } from '../design/instruments.js';
import { SOUND_EDITS } from './sound/edits/index.js';

export const SONGS = {
  theme: {
    name: 'Theme', bpm: 112, loop: true, order: ['A', 'B'],   // spb: 4 steps a beat, beats: 4 a bar (defaults)
    sections: {
      A: { tracks: [
        { inst: 'lead',  vol: 0.5,  notes: 'E5 - - - D5 - C5 - D5 - E5 - - - . . | C5 - - - A4 - - - C5 - F5 - E5 - - -' },
        { inst: 'bass',  vol: 0.6,  notes: 'A2 . . . A2 . E2 . A2 . . . A2 . G2 . | F2 . . . F2 . C3 . F2 . . . F2 . E2 .' },
        { inst: 'drums', vol: 0.55, notes: 'K . h . S . h . K . K . S . h h | K . h . S . h . K . S . S S S! S!' },
      ] },
      B: { tracks: [ /* … */ ] },
    },
  },
};
export const SFX = {
  coin: { vol: 1, layers: [{ note: ['B5', 'E6'], every: 0.06, inst: 'bell', len: 0.08, vel: 0.35 }] },
  hit:  { vol: 1, layers: [{ noise: 'lowpass', from: 2400, to: 400, len: 0.1, vol: 0.5 }, { tone: 'sine', from: 160, to: 70, len: 0.1, vol: 0.45 }] },
};
export const SOUND = defineSound({ game: 'my-game', instruments: INSTRUMENTS, songs: SONGS, sfx: SFX,
  edits: SOUND_EDITS, editsModule: new URL('./sound/edits/index.js', import.meta.url).href });

// in the game: SOUND.unlock() from the first click/key · SOUND.music('theme') · SOUND.play('coin') · SOUND.volume({ music: 0.8 })
```

## The notation
One token per **step**; a step is `60 / bpm / spb` seconds (spb 4 → a sixteenth note, 16 steps a bar).

| Token | Means |
|---|---|
| `C4` `F#3` `Bb2` | a note (C4 = middle C); `oct: 1` on a track shifts it by octaves |
| `C4+E4+G4` | a chord |
| `.` | rest · `-` the note before rings one step longer · `|` a bar line (no time) |
| `K` `S` `h` `K+h` | drum hits on a drum-kit track (the letters are the kit's) |
| `E4!` `K_` | accent (×1.25) · soft (×0.55) |

A song's sections play in `order`; `loop: true` repeats from the start, a number repeats from that
order index, `false` plays once. A section is as long as its longest track.

## Instruments and sound effects
An instrument is `{ type, …knobs }`: `synth` (up to three oscillators, filter with a sweep, envelope,
vibrato, scoop), `pluck` (a plucked string), `fm` (a bell), `drums` (a kit: each letter a list of
hit layers). Every knob, its range and default is listed in `PARAMS` in `engine/sound/song.js` —
the Sound view builds its knobs from that list. A track may override any knob for itself
(`{ inst: 'pluck', bright: 0.75, notes: … }`). Every sound design defines the roles `lead keys bass pad
bell drums` (kit `K S h o C`), so any song works with any design.

A **hit layer** is one tone or noise burst: `{ tone: 'sine'|'triangle'|'saw'|'square'|'pulse' | noise:
'lowpass'|'highpass'|'bandpass'|'none', from, to (Hz), sweep, len (s), vol, attack, q, lp, at }`. A
sound effect is `{ vol, layers: [hit layers, { note, every, inst, len, vel }, { drum, inst, vel }] }`.

## The user's edits (the overlay)
Written only by the studio (or `node cli/yak.mjs` on the user's word). Format and code:
`engine/sound/edits.js`.

**Versions.** A format string's meaning never changes. A new one is added to `SOUND_EDIT_FORMATS`,
and old ones stay readable forever. The studio writes a game only a format its own engine copy reads
(`studio/data/formats.mjs`).

```json
{ "format": "pixel-yak-sound-edit@1", "kind": "song", "game": "my-game", "song": "theme",
  "bpm": 120, "baseBpm": 112,
  "tracks": { "A/lead": { "base": "d3742b14", "steps": { "4": "E5", "8": ".", "12": "G5" }, "vol": 0.45 } },
  "added": [{ "id": "hum-1", "section": "A", "inst": "lead", "notes": "A4 - - - C5 …", "from": "hum" }],
  "notes": [{ "ts": "…", "text": "brighter opening, faster" }] }
```
- A track is keyed `<section>/<track>`: its `id`, else its instrument, else `inst#n` — so adding or
  reordering other tracks never moves an edit. `steps` holds only the tokens the user changed.
- `base` is a hash of the AI's notes when the user saved. When the AI changes that track later, the
  user's steps still apply and the track is flagged as **drift** (the studio, `yak sound`, `yak check`).
- `sfx.<id>.json` holds `{ layers: { "<index>": { knob: value } }, vol }`; `instruments.json` holds
  `{ instruments: { <id>: { set: { knob: value }, base: { knob: AI value } } } }` (every song).

**Never hand-edit these files and never write the user's notes into the song code** — they already
apply. Improve the song itself; the user's changes stay on top.

## Lessons
Each save appends to `design/lessons/sound.jsonl`:
`{ id: "S-…", ts, game, kind, song | sfx, note, changes: [{ what: notes|mix|tempo|track-added|track-param|instrument|sfx, … }], summary, design }`.
A `notes` change carries the bars it touched, before and after, in notation. Skill sound-learn
distills them into `design/sound.md` and `design/instruments.js`.

## Commands
| Command | What it does |
|---|---|
| `yak sound <game>` | songs and sound effects, one line each, with the user's edits and drift |
| `yak song <game> <id> [--section A] [--ai]` | the song bar by bar; changed bars show the AI's row and the user's |
| `yak render-song <game> <id> --out f.wav [--seconds N] [--ai]` | a WAV (44.1 kHz stereo) + length, peak, loudness, NaN check |
| `yak render-sfx <game> <id> --out f.wav` | the same for a sound effect |
| `yak sound-lessons <game> [--new]` · `yak sound-distilled …` | the user's sound lessons; record a distillation |
| `yak analyse-audio <file.wav>` | a reference recording as numbers: length, loudness, a tempo and key guess, its tune |
| `yak check <game>` | also loads the sound and renders every song and effect |

Requests can target a song (`target: { song, section, bars }`) or a sound effect (`{ sfx }`);
`yak context <R-id>` then prints the song. A reference recording the user attaches (WAV/MP3) is for
the AI to study and never goes into a game.
