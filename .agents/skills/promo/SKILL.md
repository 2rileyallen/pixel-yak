---
name: promo
description: Make a short promo video (an MP4 for Shorts / Reels / TikTok / YouTube) of a game from a clip recipe — "make me a video like this…", a teaser, a trailer shot, footage of a new feature, or a Clips-view request (kind promo). Covers writing the recipe and its shot script, probing and looking at stills, rendering, checking the MP4 and handing it over. No voice-over; posting is the user's call.
---

# Promo clips

The user says "I need a video like this: …" (in chat, or **New clip…** in the studio's Clips view). You make
a basic clip; they adjust its words, timing, music, length and shape in the Clips view and re-render. A clip
is a recipe (`games/<id>/clips/<name>.clip.json`, format in `docs/contracts/CLIPS.md`) plus, usually, a
setup and a shot script next to it. A recipe that worked is the template for the next one.

Tools: `node cli/yak.mjs clips <game>` (list) · `clip-new <game> <name> [--aspect 9:16] [--length 15]`
(starter recipe + empty shot) · `clip <game> <name> [--probe] [--ref <rev>]` (probe / render).

## Hard lines
- **Film a committed version, never the working tree** — another agent may be mid-edit. The recorder
  does this for you (it archives the last commit); commit the game first, and tell the user when it
  reported uncommitted changes that are not in the clip.
- **Never open a visible window** and never touch the user's saves: the recorder runs offscreen with a
  throwaway profile. Don't launch the studio or the game to "check".
- **Nothing costs money, nothing goes online**: no paid music, voices or stock footage; posting anywhere
  is the user's call, in chat.
- **The user's edits are sacred.** Shot and setup scripts change the game's *state* in the copy being
  filmed — never its files. A hook the game lacks is a game change: ask, then commit it like any other.
- Stay inside the game you were asked about.

## Procedure
1. **Agree the clip in one line** before writing anything: what it shows, shape (9:16 by default), length
   (15 s by default), music (one of the game's songs, or none), which version (the last commit unless
   they name a branch). Ask only what you can't sensibly default.
2. **Recipe**: `clip-new` (or copy a recipe that worked) and set the words: title card, captions, end card,
   their times. Name things in the user's words.
3. **Setup and shot**: find the game's hooks (its `AGENTS.md` / `ENGINEERING.md`, `window.__…` debug hooks,
   `?query` options). Setup puts the game in a state (a level, the HUD hidden, a time of day); the shot
   moves the camera by `__clip.t()` (seconds), never by counting frames.
4. **Probe and LOOK**: `clip <game> <name> --probe`, then open every still in `clips/out/<name>-probe/` and
   its `console.txt`. Framing, words readable and not covering the action, nothing broken. Fix, probe again.
5. **Render**: `clip <game> <name>`.
6. **Check the MP4** — the CLI prints its size, length and fps (ffprobe). Pull 2–3 stills from the MP4 itself
   and look at them:
   `ffmpeg -v error -y -ss 3 -i games/<id>/clips/out/<name>.mp4 -frames:v 1 scratch/<name>-3s.png`
   Unique frames (`ffmpeg -i <mp4> -vf mpdecimate -fps_mode vfr -f null - -stats`) tell a still scene or a
   stutter apart from smooth motion.
7. **Hand over**: it plays in the Clips view; say its length and size, one line per shot, and the honest
   caveats (what's staged, any stutter, music skipped and why), plus the obvious next tweak. If it came from
   a request, mark it done with that summary.

## Advice (each with its reason — a model may set one aside if it says why)
- **15 s, few slow moves.** One drift, one zoom, one pan reads well; fast pans smear on phones and outrun a
  voice-over added later.
- **Short captions** (under ~40 letters), a handful at most: people read them in a glance while watching.
- **Portrait wants the action big.** A landscape game is a band across a 9:16 frame: zoom the game's camera
  in a setup if it can, or offer 1:1 / 16:9 for wide games. The overlay keeps captions out of the top 12%
  and bottom 20% that the apps cover; keep important game action out of them too.
- **Title card ≤ 2 s, end card with the name and one line** ("coming soon"; a store line only if the user
  gave one).
- **Music from the game's own songs**; the recorder fades it out. If `render-song` is missing or fails, the
  clip still renders — say so rather than sourcing music elsewhere.
- **Frames are paced by the wall clock**, so a heavy scene can stutter: check unique frames; simplify or
  shorten the shot rather than hiding it.
- **Keep the recipe the user's to tweak**: put words and timing in the recipe, motion in the shot script,
  so the Clips view's form can change the words without touching code.

## Files
- `games/<id>/clips/<name>.clip.json`, `<name>.setup.js`, `<name>.shot.js` — committed with the game.
- `games/<id>/clips/out/` — renders, render info (`<name>.json`), probe stills (gitignored; made again
  from the recipes).
- `local/clips.json` `{ "copyTo": "<folder>" }` — the user's choice of a folder that also gets each MP4.
  Never write a folder the user didn't name.
- ffmpeg is a requirement, not bundled: `FFMPEG` environment variable (program or folder) or the PATH.
