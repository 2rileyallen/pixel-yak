# Lessons — what past games taught (advice, not rules)

Experience from the games made before and with Pixel Yak. Each entry says what worked or what bit,
and why. Nothing here is binding. If you have a better way, say why and use it. Skim the section
you need; read **Building big** before a game is meant to grow.

**Adding to it:** a pattern that worked or a trap that cost you time, as one short entry in the
right section (what, why). Keep the file lean: merge entries instead of growing it.

## Working with the person
- **Their playing is the valuable part, and the slow part.** Save them time around it (short briefs,
  F9 at the moment, F8 alternatives), never instead of it. The AI can't judge fun or balance; they
  can.
- **In a brain dump, everything is a thought until they call it a decision.** Split what's decided
  from what's thinking out loud, and confirm the split.
- **Brief before you build.** Misreadings caught in a three-line brief cost seconds; caught after a
  rebuild they cost an afternoon.
- **Turn "make it better" into 2–4 concrete versions** they can feel (F8). Vague praise or vague
  complaints become a pick.
- **Decide in order of cost to change:** mechanics, then story structure, then content, then final art.
  Pin the look early with a small proof in one view, so the first demo doesn't disappoint.
- **A numbered decision register in their own words** (`DECISIONS.md`). Everything else cites the
  number. One place per fact; a decision summarized in seven files drifts in seven ways.
- **Ship experimental balance as a tagged test patch** with a fallback save, so trying an idea is
  cheap to undo.

## Art
- Paint **materials and shades**, never raw colours; outline, rim and crease come from a finishing
  pass. A palette change then recolours everything, the person's edits included.
- **Every asset is an id with a fixed size, anchor and poses.** Upgrading art never touches game code.
- **Human edits are an overlay on deterministic generators.** No randomness in art code, because
  patches sit on exact pixels.
- **Style learning = written rules that cite 2+ lessons, plus knobs and reusable parts.** Measure the
  repaint % and watch it fall. Say honestly what doesn't transfer (new silhouettes, expressions).
- **Two motion systems:** move a still sprite in whole pixels, or step frames at 6–12 fps. Per-pixel
  60 fps wiggles read as noise.
- **Light and effects at the sprites' own resolution.** Smooth high-res light over chunky pixels
  clashes; dither or band it.
- **A fix on one frame carries to its siblings with a tool** (`propagate`), not a redraw.
- **Name 2–4 style knobs** (outline weight, shading bands, saturation…) so "make it different" becomes
  predictable.
- **Look before saying done.** A linter is a floor: an old audit found zero lint errors beside 63 raw
  draws, and two "different" screenshots that were byte-identical.

## Game design
- **Teach once, then get out of the way.** Don't keep on screen what a player learns once; help lives
  where they can find it. When in doubt, show less.
- **Panels show state, not sentences;** a "?" explains. Numbers players optimize by must be honest
  (whole numbers over a full minute, not a flickering instant).
- **Show only what's unlocked** and what's needed now and next. Hidden future requirements frustrate.
- **Teach new mechanics one at a time** (never two dependent tiers in one unlock).
- **Combat wants weight:** hit-stop, a few impact frames, knockback, a little shake. Monsters bigger
  than the hero. Pause freezes everything.
- **Respect the hands:** with the left hand on WASD, only Space and Shift are free; put actions on the
  mouse or J/K/L, and support a controller.
- **Design a phase on paper with a script whose checks are tests** before building it.

## Building big
*From a big automation game that had to grow 100×, rebuilt once at a cost of a long day. Declaring
"big" at kickoff would have saved most of it.*

**Measure before you believe**
- Profile first. The suspected culprit (the simulation) was fine; the real problems were drawing,
  per-click rebuilds, the tools, and the agents' reading load.
- Measure **a player action**, not just the tick. The click is what the player feels.
- Bench at 3+ sizes and look at the ratio. 2.3× the content costing 3.9× the time means something
  grows faster than the game; find it before 100×.
- Keep benches as fixtures with budgets at about 1.5–2× the measured medians.

**Safety nets that make big refactors cheap**
- **Golden replay:** a deterministic simulation (hash-based randomness) plus a fingerprint of its
  state after N simulated minutes, recorded from the unmodified code. Hash the state, not the save
  string.
- **Pixel fingerprints** for art refactors, **frame hashes** for scene refactors, **integrity tests**
  for data split across files, **old-save fixtures** so the new code must load an old save.

**Patterns that scaled (simulation)**
- Index, don't scan: per-kind lists updated on add/remove; caches keyed by a version counter the
  writer bumps.
- Neighbours from an occupancy grid, not all-pairs.
- Per-chunk change counters, so caches invalidate locally.
- Distance fields per target, repaired from a change log; a portal graph only on huge maps.
- Score candidates by a cheap lower bound first, and ask the real cost only of those that could win.
- **Sleeping entities:** something in a stable state costs nothing until what it waits for happens.
- Off-screen level of detail. Fast-forward with bigger steps, then prove the drift is small.

**Patterns that scaled (drawing)**
- Static layers pre-rendered in chunks, redrawn only when a chunk changes.
- Cull with a spatial index that owns its entries.
- A far zoom with its own cheap renderer.
- Cache rendered text. No closures, string keys or filtered arrays per entity per frame.
- Draw fewer things: atlases didn't help in canvas2D at this size.

**Saves**
- IndexedDB, one database per game. localStorage is one small quota shared by every game opened from
  files, and its failed writes were silently ignored.
- Two records per slot, switched in one transaction, so the previous save is the backup.
- A small summary record for the title screen.
- Say when saving fails and keep retrying.
- Never `String.fromCharCode(...bigArray)`; it throws past about 200,000 items.

**Code and data that stay small as content grows**
- Content is data: one file per thing, assembled by an index that computes derived tables. Adding
  content touches new small files.
- **One system, one slice of the state** (`game/systems/`, `engine/shell/systems.js`). Splitting a
  giant class into modules mixed onto one shared object made files smaller but not separable: every
  module could touch every field, so ripping one system out meant auditing all of them, and saving
  that object wrote the in-memory layout to disk. A system that writes only its own slice and talks
  through events can be rewritten alone.
- **Version saves per system, and keep a fixture per version.** A big game that bumped one save
  number for every change ended up refusing every older save, twice. Per-system versions with
  migrations, plus a stored save of each old version that tests must load, keep 100 hours of play
  alive through a rewrite.
- Generated references (asset lists, item lists) with a `--check` mode never go stale.
- Agents' must-read stays under about 5k tokens per task, however big the game gets: one page per
  game, a short index of systems with one page each, the register looked up by number
  (`yak decisions`). A single "how it plays" page and a single engineering page grew to 6k and 9k
  tokens in nine days on a big game; `yak check` now warns before that happens.
- History moves to `archive/`, which searches skip: a busy register's old plans otherwise answer
  every search before the current truth does.

## Tools and tests
- Agent-facing CLIs print one line per item by default, plus a one-shot "everything about X".
- `node:test` is built in: split files, filters, timeouts, no dependency.
- Capture tests need `waitFor`/`expect` checks (not fixed waits), a throwaway browser profile per
  run, and a timeout on screenshots.
- **Run the checks that match the change** (`yak test <game> --changed`) and the full set before a
  push. Running everything for every pixel made small changes three times slower.

## Working with parallel agents
- One git worktree per agent, explicit file ownership, merge only after the full suite passes.
  Integration bugs only appear when branches meet.
- Commit explicit paths, never `git add -A`; another agent's draft may be sitting in the folder.
- A finding in another running agent's files goes to that agent, not into your hands.
- Benches are noisy while other agents run: interleave old and new runs and report medians.

## Traps (each cost real time)
- **One shared engine for every game:** a game's old commits stopped booting the day the engine moved,
  and a hash tweak would have reshaped saved maps. Each game keeps its own engine copy now.
- **An editor or indexer holding a new folder** (Zed, Windows Search): deleting a just-made folder
  fails with EBUSY for a moment. Delete with retries (`fs.rm(…, { maxRetries, retryDelay })`).
- **A `node_modules` link inside a worktree:** removing the worktree can follow the link and delete
  the real `node_modules`. Remove the link first.
- **The person's studio may be running** and locking files; never kill it.
- **Line endings:** some Windows tools write CRLF into LF files, turning every edited file into a merge
  conflict. Keep LF (`.gitattributes`).
- **`printf` mangles backslashes:** write `.bat`/`.cmd` files with an editor tool.
- **A Karplus-Strong string read `d[-1]` and produced NaN audio;** offline audio tests catch that.
