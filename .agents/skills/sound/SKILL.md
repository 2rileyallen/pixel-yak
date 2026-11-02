---
name: sound
description: Write or change a game's music and sound effects in Pixel Yak's sound engine (songs in tracker notation, effects as recipes, instruments as knobs in game/sound.js and design/instruments.js), and check them without listening. Use when asked for a song, a theme, music for a scene, a sound effect, a mix change, or when a request of kind audio comes in. The person's own sound edits are never overwritten.
---

# Sound: music and effects as code

Everything a game plays is data in `game/sound.js` (contract: `docs/contracts/SOUND.md`): songs in a
tracker notation, sound effects as layer recipes, instruments from `design/instruments.js`. The
person sees each song as a grid in the studio's **Sound view**, changes notes and knobs, and saves.
Their changes live in `game/sound/edits/` and are laid over your songs when the game loads.

## Hard lines
- **Their sound edits are theirs.** Never edit `game/sound/edits/`, and never copy their notes into
  your song code or rewrite a track to "absorb" or undo their change — it already plays. `yak song`
  shows their bars as USER rows next to yours.
- **No audio files in a game.** A recording they attach to a request is a reference to learn from
  (`yak analyse-audio`), never something to ship or sample.
- **Stay inside the game you were asked about.** A game's instruments are its own; a library sound
  design changes only when someone promotes to it (skill design).

## Before you write
1. `node cli/yak.mjs sound <game>`: every song and effect, what they edited, any drift.
2. Read `design/sound.md` (how this game sounds) and `design/instruments.js` (its instruments).
3. For a request: `node cli/yak.mjs context <R-id>` prints the request and the song it's about.
4. For a song you'll change: `node cli/yak.mjs song <game> <id>`.

## Writing
- **Notation:** one token per step (16 steps a bar at `spb: 4`): `E5` a note, `C4+E4+G4` a chord,
  `.` rest, `-` hold, `|` bar line, drum letters on a kit track, `!` accent, `_` soft.
- **Use the roles** (`lead keys bass pad bell drums`, kit `K S h o C`) and the design's own extras.
  A new instrument goes into `design/instruments.js`, with knobs from `PARAMS` in `engine/sound/song.js`.
- **Keep ids stable.** Edits and lessons are filed by song id, sound-effect id and track key
  (`<section>/<id or instrument>`). Don't rename them. When a section gets two tracks with the same
  instrument, give them `id`s. Add new tracks and sections freely.
- **Changing a track they edited** works (their changed steps still land on top), but it flags drift
  and they have to check it by ear. Prefer adding a section or a track. If a rewrite is really
  needed, say so in your brief first.
- Advice, with its reason: loops of 4–8 bars (shorter tires the ear, longer is rarely heard whole);
  bar 4 or 8 ends in a fill so the loop point sounds like a phrase; track `vol` 0.3–0.7 leaves
  headroom for sound effects; one clear melody at a time; a game's songs share its instruments, so
  its sound stays one sound.
- **Sound effects:** short (0.05–0.6 s), one idea each. A tone layer for weight (a pitch drop), a
  noise layer for texture (a filter sweep), a bell note for "good". Pitch up means reward, down means hurt.
- In game code: `SOUND.unlock()` from the first click or key (browsers only start audio then),
  `SOUND.music(id)` per scene, `SOUND.play(id)` for effects, `SOUND.volume({ music, sfx })` for settings.

## Checking without listening
1. `node cli/yak.mjs render-song <game> <id> --out scratch/<id>.wav` prints the length, peak and
   loudness. Healthy music peaks around −6 to −1 dBFS, averages −22 to −14 dB RMS, with no NaN and no
   silence, and its length matches the bars you meant. Render your sound effects with `render-sfx`.
2. `node cli/yak.mjs song <game> <id>` reads your notes back bar by bar: check that the bars line up
   and the holds land where you meant.
3. `node cli/yak.mjs analyse-audio scratch/<id>.wav`: the tempo and key it hears should match what
   you wrote.
4. `node cli/yak.mjs check <game>` and the game's tests: every song and effect compiles and renders.
5. Say plainly that nobody listened, and ask them to play it in the Sound view. Their ear is the test;
   your numbers only catch broken renders.
