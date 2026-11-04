---
name: collaborate
description: Work on a Pixel Yak game through GitHub the same way whether the person works alone or with others — sync at the start of a session, summarize what others (people and AIs) did, branch for anything not tiny, write pull requests in plain words, and claim tickets so two AIs never take the same one. Use at the start of a session on a game that is its own git repo with a remote, or when the person mentions a collaborator, a branch, a pull request or merging.
---

# Collaborate

Treat every game repo as if someone else works on it too. Then nothing changes when someone
actually does. GitHub is the meeting place: commits, branches, pull requests. The game's own files
travel with every pull: tickets, F9 moments, art and sound edits, design files, decisions. So
another person's tickets, and their AI's work, reach you when you pull.

## Start of a session (a game with a remote)
1. `git -C games/<id> fetch --all --prune`, then compare with what you have.
2. Tell the person in a few lines what changed since they were last here:
   - commits by others (who, what, in plain words);
   - new or changed tickets: `node cli/yak.mjs inbox <id>`, after pulling;
   - branches and pull requests waiting (`gh pr list`);
   - anything that touches what they're about to work on.
3. Pull (fast-forward) their main branch if it's clean. If local work is in the way, ask before
   stashing, rebasing or merging anything.

## While working
- **Claim before you start:** `node cli/yak.mjs start <R-id> --by <your name>` (or set `YAK_AGENT`)
  records who is working a ticket, and `start` refuses one someone else already has. Skip it and say
  so; `--take` only when the person says to take it over.
- **Branch for anything not tiny**, with a name that says what it is (`weather-system`,
  `fix-title-flicker`). Small, verified fixes can go straight to main if that's how the person works.
- **Commit explicit paths** in plain language. Other people's files and drafts stay out of your
  commits.
- **Pull requests:** written for a person who wasn't in the room. Say what changed, why, how to see it
  (what to play), and the decision numbers it follows (`DECISIONS.md`). Create them with `gh pr create`
  on the person's word. Review someone else's PR by reading it, running its checks, and playing it;
  then report in plain words.
- **Decisions stay one place:** a collaborator's new decision goes into `DECISIONS.md` with a number,
  in their words, the same as the person's own.
- **Conflicts:** never resolve one by throwing away someone's work. Their edits (pixels, sound,
  tuning) and decisions win over your code. When unsure, show both sides and ask.

## Pushing
Push only where the person has said pushing is fine (many say "always push my own repos"; ask once
and remember it). Never force-push a shared branch. A public push (anything others can see) is the
person's call.

## Collaborating on Pixel Yak itself
The harness is open source. A change to it goes on a branch with a pull request to the Pixel Yak repo,
explained in plain words, with the checks passing (`CONTRIBUTING.md`). Personal things never go in:
paths, accounts, private games, their ideas (those live in `local/`).
