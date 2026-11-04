# Systems — one page each

Every system in `game/systems/` gets one page here, `design/systems/<id>.md`: the page to read before
changing that system, however big the game grows. `design/game.md` lists them all.

A page holds, in this order (skip what doesn't apply yet):
- **What it does** — one or two sentences, in the player's terms.
- **Rules** — how it works right now, citing decisions (#n). Rewrite a rule when it changes; history
  lives in `DECISIONS.md` and `CHANGELOG.md`.
- **Talks to** — the events it emits and reacts to, and the other systems' functions it calls.
- **Numbers** — where its tuning lives (`game/data/…`, F8 knobs in `game/tune.js`).
- **Code** — its files, its version, what its save section holds, its migrations, its tests.
- **Open** — what's undecided (the ❓ decisions, by number).

Keep a page under ~1,500 words (`node cli/yak.mjs check` warns): a system that outgrows its page is
usually two systems. A decision about a system carries its id in `DECISIONS.md`'s System column, so
`node cli/yak.mjs decisions <game> <id>` prints just those.
