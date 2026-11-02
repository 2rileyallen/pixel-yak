---
name: explore
description: When the user is unsure what's wrong or what they want ("something's off", "make it feel better", "I can't say what"), turn the vague ask into 2–4 concrete alternatives behind F8 that they can feel while playing, ask them to keep one, then build the winner in and remove the rest. Also use when `node cli/yak.mjs tuning <game>` lists kept choices waiting to be built in.
---

# Explore: alternatives the user can feel (F8)

"Better" is ambiguous, and the user judges by playing. Rather than guess one answer and rebuild it
three times, build a few real alternatives side by side, let the user flip between them live, and keep
the one they choose. The contract is `docs/contracts/TUNING.md`.

## Procedure
1. **Name the axis.** Say in one line what you think "off" might be (speed? weight? colour? the music's
   mood?). If you see two different axes, offer both — one knob or variant each.
2. **Build 2–4 alternatives** in the game's code:
   - a number → `studio.knob('Hero walk speed', 1.0, { min: 0.5, max: 2, step: 0.1 })`
   - a different thing → `studio.variant('Title music', ['A · calm harp', 'B · war drums', 'C · music box'])`
   Each option is real and finished enough to judge — a variant you'd be glad to ship, not a sketch.
   The code's default stays what the game had, so nothing changes until the user picks.
3. **Tell the user**, one line per alternative, then how: *"Play it, press F8, flip between A/B/C while
   you play, press K on the one you like, say why if you want, Enter."* Then stop and wait.
4. **Build the winner in** once they've kept one: `node cli/yak.mjs tuning <game>` lists each kept
   choice, its why, and where the knob is made. Make the kept value the code's own (a knob becomes a
   plain constant; a variant keeps only its chosen branch), **delete the losers** (their code, art,
   music) and the `studio.knob` / `studio.variant` call, check the game, then
   `node cli/yak.mjs tuning <game> --done <slug> "what you changed"`.
5. **Learn from it.** The why lands in `games/<id>/design/lessons/tuning.jsonl`. When a choice says
   something about the game's taste (e.g. "heavier always felt better"), it belongs in the game's design
   file too — propose the line, don't just write it.

## Hard lines
- The user's choice is theirs: build in what they kept, not what you preferred.
- Stay inside the game you were asked about.
- Don't leave knobs behind: a shipped game shouldn't carry experiments the user already decided.

## Advice (with reasons; set it aside if you say why)
- **2–4 options, not 10.** More than four blur together while playing; if you need more, the axis is wrong.
- **Make them different enough to feel.** 1.0 vs 1.05 is noise; spread the range so the ends are
  clearly too much and too little — the user finds the middle.
- **One knob per question.** Two knobs that change the same feeling make a choice impossible to read.
- **Don't build the panel's job into the game** (no debug menus of your own): F8 is already there,
  pixel-art, and invisible in shipped builds.
- **Use F9 moments.** A request from F9 carries the screen, the last seconds, the F8 values that were
  live and a save-state you can load (`docs/contracts/MOMENTS.md`) — reproduce before you change.
