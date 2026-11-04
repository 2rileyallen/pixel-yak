---
name: polish
description: The repeatable "make it better" pass — play the game headless, look at it, list the few most valuable improvements in plain words, brief the person, and build only the ones they pick. Run it as often as they like. Use when the person says polish / improve / make it better / what would you change, or pastes the polish prompt.
---

# Polish

"Better" is ambiguous, so this pass makes it concrete and keeps the person steering. Every round
ends with them playing something that changed.

## One round
1. **Know where it's going.** Read the game's `AGENTS.md` (Now), `design/game.md` (the index), the
   `design/systems/` pages of what you'll look at, and the latest `CHANGELOG.md` entries. Skim the open tickets (`node cli/yak.mjs inbox <game>`); their requests
   come before your ideas.
2. **Play it headless and look.**
   - Run the capture tests (`node tools/run-captures.mjs <game>`) and open the screenshots.
   - Write a short tour test of your own if the game has none for what you want to see: boot,
     play a minute, the menus, a win and a loss.
   - Look at the contact sheets (`node cli/yak.mjs sheet <game>`).
3. **List the 3–5 most valuable improvements.** Each one: what you saw (point at a screenshot), why
   it matters to the player, what you'd change, and how big it is (S/M/L). Mix kinds:
   - **feel**: input response, impact, timing;
   - **clarity**: can you read what's going on?
   - **look**: one weak asset, a palette clash;
   - **sound**: a missing cue, a repetitive loop;
   - **friction**: an extra click, a confusing menu.

   Prefer improvements to what exists over new features. If you're not sure which of two
   directions is better, say so and offer to put both behind F8 (skill explore).
4. **Brief and wait.** They pick, cut or change items. In their brain dumps, everything is a thought
   until they call it a decision.
5. **Build only what they picked**, each one small. Run the quick checks
   (`node cli/yak.mjs test <game> --changed`), look at the result, add a `CHANGELOG.md` entry, and
   commit.
6. **Hand it back to play:** a short list of what changed and where to see it. Ask them to press F9
   on anything that feels off.

## Advice
- One change they can feel beats five they can't. Small steps keep the game playable between rounds.
- Their taste lives in the design files and `DECISIONS.md`. A polish never quietly undoes a
  decision; propose changing it instead.
- Don't explain on screen what the game could teach by play (`designs/game/basics`).
