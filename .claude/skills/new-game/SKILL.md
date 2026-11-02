---
name: new-game
description: Start a new game in Pixel Yak — from an idea, a story or the studio's kickoff prompt to a running game the person can play, asking only what blocks you. Use when the person wants a new game, asks what to build next, or pastes the studio's kickoff prompt. Also covers growing a toy into a big game.
---

# New game

The goal is the person **playing something** as soon as possible, then steering from there. Ask
only what blocks you, and default the rest out loud.

## 1. Look before you make
- `node cli/yak.mjs games` lists the games that exist; don't start a duplicate.
- `node cli/yak.mjs ideas` shows the person's backlog in `local/ideas/`. Their game may already be
  written down.
- `node cli/yak.mjs designs` shows the design library: art, sound and game design files to start
  from. Reusing a look that already learned their taste saves the most art time.

## 2. Make it (skip if the studio already did)
`node cli/yak.mjs new-game <id> --name "<Name>" --genre "<genre>" --size toy|demo|big --art <design> --sound <design> --game <design> [--idea <slug>] [--pitch "<their notes>"]`

This copies `templates/blank/` into `games/<id>/`. It already boots, has the art pipeline wired
(it shows up in the studio at once), its tests pass, and the chosen design files are copied into
`design/`. Those copies are the game's own from now on.

## 3. Ask what blocks you, default the rest
Blocking (you can't build the first playable without these):
- **The fantasy and the core verb.** What is the player, and what do they *do* every few seconds?
- **Genre and camera** (side view, top-down, grid…).
- **The look**: which art design, or a new one from a reference they name (skill design).
- **The size**: toy (a quick test), demo (a small finished slice), or big (built to grow for years).
  A big game gets the engineering scaffolding from day one (skill optimize).

Everything else gets a sensible default, listed so they can change it. That covers controls,
resolution, saves, pacing, menus, music mood and the name. Fan games of someone else's story: write
a short sourced canon sheet first. They know the story better than you, and they'll catch mistakes.

## 4. Brief, then build the first playable
Brief in a few lines: what they'll be able to do in the first playable, what it will look like, and
what you defaulted. Wait for their go. Then build it small and real. Real level design, real art
from the design file, no greybox placeholders they have to imagine past. Then get them playing:
Games → Play, F9 to tell you about a moment, F8 for anything you exposed to tune.

Write down what you agreed:
- `AGENTS.md` (the one page, with **Now**)
- `design/game.md` (how it plays, in plain words)
- `DECISIONS.md` (the person's calls, numbered, in their words)
- `CHANGELOG.md` (what they can play)

In their brain dumps everything is a thought until they call it a decision.

## 5. Growing it
Each round: they play and tell you (F9, requests), then the same loop starts again.
1. Explore cheaply (paper math, a test level, F8 variants).
2. They decide.
3. Brief.
4. Build with the quick checks.
5. Run the full checks before pushing.
6. They play.

When a toy turns out to be worth growing, change `size` in `game.json` and read skill optimize
before the content multiplies. A few habits pay for themselves:
- Content is data, one small file per thing.
- Logic stays pure and deterministic, so it's testable.
- One place per fact.

`docs/LESSONS.md` → Building big has the details.

## Its own repo
A game worth keeping becomes its own git repo inside `games/<id>/`; the harness ignores it. With the
person's go, `git init` it there and create a private GitHub repo (`gh repo create <name> --private
--source . --push`). Skill collaborate covers working on it with others.
