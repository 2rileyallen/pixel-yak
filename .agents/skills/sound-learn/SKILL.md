---
name: sound-learn
description: Distill the person's sound edits (the studio's sound lessons) into the game's sound design file and instruments, so new songs and effects need fewer fixes. Use when the person asks to learn from their music edits, pastes the Sound view's "Teach the AI" prompt, or when several new sound lessons have piled up. Best done by a strong model.
---

# Sound-learn: turn their edits into the game's sound

Every save in the studio's Sound view appends a lesson to `games/<id>/design/lessons/sound.jsonl`:
the tempo they set, the notes they changed (the bars before and after, in notation), the mix, the
instrument knobs, the tracks they added (by MIDI, humming or by hand), the sound-effect knobs, and
their note on why. Your job is to find the **patterns** and make your next songs start there. Fewer
and smaller edits per new song is how you know it worked.

## Procedure
1. `node cli/yak.mjs sound-lessons <game> --new` lists every sound lesson since the last
   distillation, with their notes and the before/after bars.
2. `node cli/yak.mjs song <game> <id>` shows a song as it plays now, their bars next to yours, when
   a lesson needs context. Render before/after to compare numbers if it helps
   (`render-song … --ai` is your version).
3. Read `design/sound.md` (the current rules) and `design/instruments.js`.
4. Look for patterns, and read them as music:
   - **Tempo:** did they speed up or slow down every song? By how much?
   - **Melody:** raised or lowered (`raised N semitones`), notes made longer with holds, notes cut
     to rests (they want space), a phrase ending moved?
   - **Mix:** a role always turned down or up (`vol`, `echo`)?
   - **Instrument knobs** (these change every song): brighter, softer attack, more echo?
   - **Added tracks** (hum, MIDI): their own melodies show the shapes, ranges and rhythms they reach
     for. Treat them as their writing, not material to reuse in other songs without asking.
   - **Sound effects:** shorter, lower, quieter?
5. Draft rules that are specific, checkable, and cite lessons:
   - ✓ "Battle songs run 150–160 bpm; they raised both from 144 (S-…, S-…)."
   - ✓ "The lead ends phrases on the root, held a full beat; they changed three endings from the 5th (S-…)."
   - ✗ "Better melodies." ✗ "More energy."

   Keep **sound rules** (true for every song) apart from **one-off fixes**, which already live in
   their edits. A rule needs 2+ lessons, or 1 whose note states it.
6. Apply where it pays most:
   - **`design/sound.md`**: rules with citations under the right section (tempo, scales, mix,
     do / don't…); add a changelog line.
   - **`design/instruments.js`**: adopt knob values they set repeatedly as the instrument's own (their
     `instruments.json` edit then matches yours, and the drift note tells them). Say what you changed:
     it changes every song.
   - **Future songs and effects** follow the new rules. Never rewrite songs or tracks they edited.
     Revising *unedited* songs to the new rules is fine when they asked; otherwise ask.
7. Record it: `node cli/yak.mjs sound-distilled <game> --through <last lesson id> --summary "<what changed>"`.
8. Tell them in plain words what you learned, what you changed, and what you couldn't decide.
9. If the sound is now worth reusing in other games, offer to promote it to the library (skill design).

## Honest limits
Learning happens through written rules and instrument knobs, not training. Tempo, mix, timbre,
range and phrase habits transfer well. A melody's character only partly does. Theme tunes keep a
final human pass. Say so.
