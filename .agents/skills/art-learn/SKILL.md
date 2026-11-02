---
name: art-learn
description: Distill the person's art edits (the studio's lessons) into the game's art design file, palette, reusable parts and better generators, so new assets need less repainting. Use when the person asks to learn from their edits, pastes the studio's Distill prompt, or when several new lessons have piled up. Best done by a strong model.
---

# Art-learn: turn their edits into the game's look

Every save in the studio's Art view appends a lesson to `games/<id>/design/lessons/log.jsonl`, with
a card image (`design/lessons/cards/<lesson>.png`) showing what the AI generated, before, after, and
the changes in magenta. Your job is to find the **patterns** in what they change and make the
generators produce that from the start. The repaint % in the studio's Lessons view should fall.

## Procedure
1. `node cli/yak.mjs lessons <game> --new` lists every lesson since the last distillation: metrics,
   their note, colour swaps, changes by material, and the card path. `--rows` adds exact pixels.
2. **Open every card.** The numbers say where; only the pictures say why.
3. Read `design/art.md` (the current rules) and `design/palette.js`.
4. Draft rules that are specific, checkable, and cite lessons:
   - ✓ "Eyes are 2×3 with a 1 px catchlight top-right, never a single dot (L-…, L-…)."
   - ✗ "Better shading."

   Keep **look rules** (true for every asset) apart from **one-off fixes**, which already live in
   their edits. A rule needs 2+ lessons, or 1 whose note states it. Propagated lessons
   (`via: propagate`) show they accepted a fix across frames, but they count once.
5. Apply where it pays most:
   - **`design/art.md`**: numbered rules with citations; bump the version line; add a changelog
     entry.
   - **`design/palette.js`**: ramps and finish knobs. A ramp change recolours every sprite in this
     game, so say so first.
   - **Parts**: reusable pixel clusters cut from their art (eyes, hands, tufts), stamped with
     `engine/art/parts.js`. Their pixels beat your guesses.
   - **Generators** that make *future* assets. Never redraw assets they edited. Regenerating
     *unedited* assets with the new rules is fine when they asked; otherwise ask.
6. Record it: `node cli/yak.mjs distilled <game> --version <N+1> --through <last lesson id> --summary "<what changed>"`.
   Stamp `gen.v` on every entry you regenerate.
7. Tell them in plain words what you learned, what you changed, and what you couldn't decide.
8. If the look is now worth reusing in other games, offer to promote it to the library (skill design).

## Honest limits
Learning happens through written rules, palette knobs, parts and generator changes, not training.
Palette use, outlines, shading habits and proportions transfer well. New silhouettes and expressions
only partly do. Hero assets keep a final human pass. Say so.
