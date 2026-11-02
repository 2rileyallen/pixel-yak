# The scale report — outline and hunt list

## Outline (in chat; saved in the game as `SCALE-REPORT.md` once the person has answered)
1. **The short version** (≤ 6 bullets): healthy today? what breaks at 100×? the hard walls? fixable
   without changing how it plays? the biggest long-term risk (often the agents' reading load).
2. **How I measured**: what was read, what was delegated, which benches ran (scripts in `%TEMP%`).
3. **Measurements today** — tables: sim per tick and per player action at 3+ sizes; drawing per part
   awake and at the farthest zoom; save size/time; test time; docs tokens. Then **at 100×**, labelled
   as extrapolation, saying what grows faster than the game.
4. **What I found**, by area, worst first — Simulation · Drawing · Saving · Map/world · Art · Pixel
   Studio and tools · Tests and checks · What agents have to read · Code structure. Each finding:
   what it is, `file:line`, why it hurts at scale in plain words, the fix.
5. **Already right** — so nobody spends effort there.
6. **The plan** — phases, what each changes, how it's verified, which ones change how the game plays.
   A targets table (today → target at 100×).
7. **Your call** — behaviour changes as decisions; what "100×" means for this game (more buildings,
   a bigger map, more content — usually all); git/backup if missing; shared code; archiving docs.
   Then wait.

## Hunt list — check every one (each was found in a real game)
**Simulation**
- An all-pairs rebuild on every player action (e.g. chutes: every building × every building × items).
- A fresh whole-map search every time an agent walks; "is this tile walkable?" scanning a list
  (search cost = tiles × list length).
- Whole-map scans inside small, frequent questions (e.g. "is this passage open?").
- One whole-map distance field per building (memory = buildings × tiles), all thrown away on any change.
- Every worker scoring every job × every source on every decision.
- Every entity updated every tick even when idle; fast-forward = N full ticks per frame.
- `array.find/filter` lookups and new objects/arrays built inside getters on hot paths.
- Read-outs recomputed from scratch (counts, estimates) every tick or every click.
**Drawing**
- Every tile and every entity drawn every frame, no culling; nothing cached for static layers.
- Per-frame garbage: a closure per entity, sprite keys built as strings, filtered arrays per tile.
- Text drawn one glyph at a time (× shadow, × outline); panels recounting everything per frame.
- A zoom that can show "everything" with full art (a cost that grows with the map).
**Saving**
- `localStorage` (one ~5–10 MB quota shared by every game opened from files); failed writes ignored.
- `String.fromCharCode(...bigArray)` (throws past ~200,000 items); no backup record; the title reading
  whole saves; stringify on the main thread.
**Map / content**
- Bitmask caps (16 chambers in a 16-bit mask), fixed map W/H constants, a hand-typed layout in code.
- One giant data file; one giant class; art modules with copy-pasted helpers that drifted apart.
- Names used as a mini-language (`t3_hot_2` parsed with `startsWith`/`slice(-1)` → a V3 or an 11th
  frame silently draws the wrong thing).
**Studio and tools**
- Synchronous whole-repo scans on a timer; "reload everything" on any file change; one edit save
  rebuilding every edit; lists rebuilt per keystroke; an inbox that prints everything; a contact
  sheet taller than the screenshot cap.
**Tests**
- One giant test file, no filtering or timeouts; perf thresholds 10× looser than reality; capture
  tests that assert nothing; a linter that doesn't recurse; tests depending on gitignored files.
**Agent context**
- Must-read over ~10k tokens a session; each decision written 3–4 times; several "read this first"
  orders; stale facts; history that grows with every session.
