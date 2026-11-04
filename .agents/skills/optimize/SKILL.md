---
name: optimize
description: Could this game work at 100× its size? Measure everything, report every inefficiency in plain words, then — after one go-ahead — optimize the game (and the shared engine or studio code it needs) end to end. Also the everyday rules for code in a game meant to grow big. Use when the person says optimize / scale audit / future-proof <game> / "could this handle 100×", when a game's size is "big", or before changing a big game's simulation, rendering or saves.
---

# Optimize: could this game work at 100×? Then make it.

Read `docs/LESSONS.md` → Building big first (and `local/LESSONS.md`, the person's own, if there is
one). When you're done, add what you learned to `local/LESSONS.md` (it carries no game's names or
facts: those stay in the game's folder). It goes in `docs/LESSONS.md`, which ships with Pixel Yak,
only when the person says it's for everyone.

## Everyday rules for a big game's code (advice that has held up)
- **Nothing per tick or per frame loops over everything.** Keep indexes per kind, update them on add or
  remove, and key caches by a version counter.
- **No allocation in hot paths.** No closures, string keys or filtered arrays per entity per frame.
- **Draw only what's visible.** Cull with a spatial index; pre-render static layers in chunks.
- **No map-size assumptions.** No fixed W/H constants, no bitmask caps.
- **Every new system gets a bench fixture and a budget.** Behaviour-neutral work keeps the golden
  replay identical.
- **Content is data**, one small file per thing.
- **One system, one slice.** A system (`game/systems/<id>`) writes only its own part of the world and
  talks to the others through events or their exported functions, so a rewrite stays inside it. Never
  mix many modules onto one shared object: every field becomes everyone's, and the save format turns
  into the in-memory layout.
- **Saves are versioned per system** (`engine/shell/systems.js`): a changed save section is a new
  version plus a migration, proven by `dev/saves/` fixtures.
- **The reading load is a budget too.** One page per system; `yak check` warns when a must-read page
  outgrows it (docs/contracts/README.md → the reading budget). Measure must-read tokens like any
  other cost.

The game's `ENGINEERING.md` has its own versions of these: its caches, budgets and fixtures. Keep it
current as you add any.

## The deep pass (the one checkpoint is the report)
1. **Orient.** Read the game's `AGENTS.md`, `ENGINEERING.md` and any previous report.
   `git status`; leave other people's untracked files alone.
2. **Audit; measure, don't guess.**
   - Read the hot code yourself, in full: the update loop or simulation, map and pathing, drawing,
     data, saves.
   - Delegate side surveys to read-only agents with file:line evidence: art pipeline, tools, the
     agents' reading load.
   - Measure with throwaway scripts outside the repo:
     - simulation per tick at 3+ sizes;
     - one player action;
     - drawing per part, awake and zoomed out;
     - save size and time;
     - test time;
     - must-read tokens (bytes ÷ 4).
   - Extrapolate each to 100× and name what grows faster than the game, plus the **hard walls**:
     things that throw or silently stop at size.
   - Work through `report-template.md` → Hunt list.
3. **Report in plain words** (`report-template.md`): "double the buildings, four times the work", not
   big-O. End with the decisions only the person can make, especially anything that would change
   **how the game plays**. **Then stop and wait for the go-ahead.**
4. **Run it.**
   - Commit a restore point.
   - Write a short plan in the game (phases, file ownership, budgets).
   - Work in waves, in parallel only when files don't overlap (`phase-brief-template.md` for agent
     briefs): safety nets and behaviour-neutral speedups first, then the approved behaviour changes,
     then docs.
   - After each wave:
     - run the full suite;
     - look at screenshots;
     - check the golden replay (identical, or regenerated with a stated reason);
     - commit.
5. **Finish.**
   - A before → after table, and what the player will notice.
   - A playtest request (`node cli/yak.mjs ask-user <game> "…" --kind review`).
   - New entries in `local/LESSONS.md`.
   - What's left.

## Still binding during an optimization
- The person's edits are never touched.
- Their saves always migrate: old saves load (a migration per changed system, a fixture per version).
- No deploys or spending.
- History is archived, never deleted.
- Commit explicit paths.
- A change to how the game *plays* is their call.
