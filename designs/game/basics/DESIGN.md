# Basics

The general game sense every game starts from, whatever its genre: how much to explain, how the screen looks, pause, controls, saves, and working with the person who plays. Genre entries build on it; any game may override it in its own copy.

## This game

(Filled in at kickoff: the game in one sentence, and its 2–4 pillars — the things every feature is judged against.)

## What this is

Not a genre: the full list of defaults, each with its reason. A genre entry adds to it and wins where they differ; the game's own `design/game.md` wins over both, citing the decision, like (#4). A model may set a default aside if it says why.

Under all of it: **the user playing and judging is the bottleneck.** Everything serves getting them playing sooner and hearing what they think faster. So do what was asked, without surprise edits or detours.

## Pacing and progression

- **Get the user playing early**, because nobody knows if it's fun until they play; prove the fun in a short demo before planning the whole game.
- **Pin the direction first**: a story seed (vague is fine), genre and camera, the mechanic to feel, the art direction. A demo that nails the mechanics but misses the look disappoints.
- **Decide in order of cost to change**: mechanics, structure, content, then final art, because polished art on a mechanic that changes is thrown away.
- **A first playable still needs real level design**; bare corridors read as unfinished.
- **Progress is earned**: each new thing asks for more of the old first, because fast, easy unlocks feel hollow.
- **Pace and balance are judged by the user's own play**, not scripted timing runs. Keep checks fast so they play sooner.

## What the screen shows and explains

- **Teach once, then get out of the way.** Don't keep on screen what a player learns once; help lives in pause → help. How much to explain is each game's call, and a short opening guide is fine when it fits. AI over-explains by habit — right for web apps, wrong for games — so when in doubt, show less.
- **Pixel art everywhere**: text, menus, buttons, numbers, bars, cursors, drawn in code at the game's resolution through the art layer. No browser-styled UI, no system fonts, because one web-looking button makes the whole game feel like a web page.
- **Panels show state, not sentences**; a "?" opens the help. A toggle shows its state by its look (lit on, grey off).
- **Status sits on the thing** (a light on a machine), where the player is already looking.
- **Show only what's unlocked.** No greyed-out lists of later things; a choice with one option isn't a choice.
- **Numbers a player optimizes by must be honest**: counted over a real window (a minute of finished seconds), never guessed from the last second. A readout showing 35.5 when the truth is 36 teaches distrust.
- **The HUD is small by default** and grows only when something needs the player, so the game stays the picture.
- **Fill the window** at a whole-number scale, with fullscreen, because a letterboxed pixel game feels far away.

## Controls

- **Keyboard and mouse, and a controller**, from the first playable. Every menu works by keys and pad, because a pad has no hover.
- **Respect where the hands sit**: the left hand on WASD (thumb on Space, little finger on Shift), common actions on nearby keys (Q, E, R, F, Tab, 1–4), the rest on the mouse or the right hand (J, K, L). Don't scatter bindings.
- **Pause freezes everything**: simulation, timers, cooldowns, animations that matter, sound fades. A leaky pause reads as a bug.
- **Esc or Start pauses**; Esc, right click or a click outside closes a panel.
- **A key never does two things**: the key that closes a panel doesn't also press a button in it.

## What to build for its size

Declare the size at kickoff, **toy**, **demo** or **big**, because deciding "big" late means a costly retrofit.

**Every size**: a title screen, a pause menu (help, settings, fullscreen), pixel-art UI, saves. **Saves: the game decides** the slots; auto-save is a good default; saves survive reloads; an unreadable save falls back to the one before and is never written over (it's kept, and the player is told); an older save is brought forward by migrations, because a player's hours are worth more than a tidy format. Every game is made of **systems**, each owning its part of the state with its own save version (the template's `game/systems/`), because "rework combat" should touch combat, not the whole game.

- **Toy**: a mechanic to feel in an afternoon; one check that it boots.
- **Demo**: proves the fun over a real stretch of play; rule tests, and screenshots you open.
- **Big**: the scaffolding from day one:
  - Content as data, one small file per thing, with generated indexes: a new thing is a new file plus one line.
  - The simulation indexes instead of scanning: nothing per frame loops over everything, caches keyed by a version counter, only what's on view drawn, no assumed map size.
  - A deterministic simulation, so tests and replays are exact.
  - Test fixtures at three sizes, a golden replay (hash the state; a refactor keeps the hash), and time budgets enforced by a test.
  - Old-save fixtures: a stored save of every system version, which the tests must load.
  - Starting any task costs little reading however big the game gets: a one-page `AGENTS.md`, a short `design/game.md` listing the systems, one page per system, decisions looked up by number, one changelog.

## Do / Don't

**Do**
- Keep a numbered decision register in the user's own words and cite the number elsewhere, because a rule retold in five places drifts five ways.
- Treat a brain dump as thoughts until the user calls something a decision, because they are thinking aloud.
- Try a mechanic cheaply (paper math, a test map, two versions to switch between) before rebuilding around it; a trial costs minutes, a rebuild days.
- Ship an experiment as a test patch with a fallback (a tagged version, a kept save), so going back costs nothing.
- Keep one rule for every case of a kind (bend the art, not the rule), because exceptions are what players trip on.
- Smoothing off, whole-number scaling, clamped frame deltas (`Math.max(0, Math.min(isNaN(dt) ? 0 : dt, 0.1))`), because a stalled tab returns one huge step.

**Don't**
- Change a locked decision without asking.
- Coin new framework words in a proposal; the user then has to learn them.
- Add unasked things without saying so plainly.

## Lessons from games that used it

- **A short action-adventure demo**, beaten in four minutes with plain corridors: too short, too easy, too basic.
- **A big factory-automation game** kept no tutorials, but its opening was easy to get wrong, so it gained one exception: an outline where the next building goes and one line of words, over after a few buildings. It went in circles partly because decisions were retold in many places and ideas were rebuilt before being tried cheaply.

## How to ask for a feature

A good ask names **the moment** (F9 while playing sends a screenshot and the game's state), **what you felt and wanted**, **decision or thought**, **what must not change**, and **what "done" feels like**.

- "The start is confusing: I didn't know where the first building goes. Add the lightest guide that fixes it."
- "Jumping feels floaty. Give me three versions to switch between while playing; I'll pick."
- "Brain dump below, all thoughts: tell me what you'd do, ask, and leave."

## Changelog

- 2026-11-04 · Saves migrate and are never written over; every game is made of systems with their own save versions and pages (the template's shape).

- 2026-11-02 · Seeded from the house rules of the studio this harness grew out of.
- 2026-11-02 · Seeded from cross-game design lessons from several games' playtests.
- 2026-11-02 · Seeded from running a big factory-automation game.
