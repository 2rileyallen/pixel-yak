# Contributing to Pixel Yak

Thanks for making Pixel Yak better. It grows by being used, so the best contributions come from
making a game with it and fixing what got in your way.

## Good first contributions
- **A design file** for the library (`designs/art|sound|game/<id>/`): a look, a sound or a kind of
  game you got right in one of your games. Use the shape in `docs/contracts/DESIGN-FILES.md`.
  Describe styles in your own words. Never include copied art, music, or someone else's characters
  and stories.
- **A lesson** in `docs/LESSONS.md`: something that worked or bit you, with the reason.
- **A fix or a feature** in the studio, the CLI, the engine or a skill.

## How
1. Fork, then branch with a name that says what it is.
2. Keep the folders' jobs separate: the studio UI talks to the disk only through `studio/main` and
   `studio/data`; games only import `engine/`; the AI's commands live in `cli/commands/`.
3. Match the code around you: a header comment per file, plain-English comments, small functions,
   no frameworks, no build step, no new dependencies without a good reason in the PR.
4. Check your work:
   - `node cli/yak.mjs test yak-trail --full` (the demo game);
   - the studio headless: `npx electron . --capture=<steps.json> --out=<dir>` (see `docs/STUDIO.md` → Testing);
   - **look at the screenshots** of what you changed.
5. Open a pull request that says what changed, why, and how to see it.

## Skills and docs
Skills (`.agents/skills/`) are guidance for AI models. Keep them lean: a few hard lines with reasons,
the file contracts, and advice phrased as advice. Edit skills in `.agents/skills/`, then run
`npm run sync-skills` to mirror them into `.claude/skills/`.

## Never in this repo
Personal paths, account names, tokens or keys; anyone's private games or ideas (those live in
`local/` or their own repos); copyrighted art, music or story material.
