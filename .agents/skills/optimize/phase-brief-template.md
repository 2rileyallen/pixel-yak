# Phase briefs and the coordinator's checklist

## A phase agent's brief (Agent tool, `isolation: "worktree"`, `run_in_background: true`)
```
You are Phase <X> of the <game> scale work: <one line — what this phase makes true>.

SETUP: your current directory is a git worktree on its own branch (create it inside the repo folder,
e.g. .worktrees/<name>, so node_modules resolves from the parent). Work and commit only here — never
edit files in the main checkout. If you ever link node_modules into a worktree, remove the link before
removing the worktree (removal can follow it and delete the real node_modules).

READ FIRST: the game's plan file, its SCALE-REPORT.md §<n>, its ENGINEERING.md, AGENTS.md, docs/LESSONS.md (+ local/LESSONS.md if there is one)
(advice). Then only the code you own.

YOU OWN: <paths>. In parallel: <phase> owns <paths>, <phase> owns <paths> — don't touch those; keep
every public method/field their code uses working with the same meaning. If you need a change
outside your files, write it in your report.

BEHAVIOUR: none — the golden replay stays identical after every commit.
  (or) allowed per the user's decision <n>: each behaviour-changing commit regenerates the golden with
  a reason and shows production over 10 simulated minutes within ±5% on every fixture; every rule test
  passes unchanged (never weaken a rule).

TASKS (commit each, plain-language messages ending with the Co-Authored-By line):
1. <safety net first if the game lacks it: node:test suite, bench fixtures, golden replay from the
   UNMODIFIED code, perf budgets at ~1.5–2× measured medians>
2. …

GATES: tests · perf budgets · golden · `node tools/run-captures.mjs <id>` + look at screenshots ·
`node cli/yak.mjs check <id>` · bench before/after (the machine is shared — interleave runs,
report medians).

REPORT (≤ 600 words): branch and worktree path, commits, a before/after table, every behaviour change
and its measured effect, anything left or needing a decision.
```
Tips: point the agent at files instead of pasting them; name what's ruled out; give it the profile
numbers you have; tell it which other phases run in parallel and what they own; if its worktree was
created from an older commit than main, tell it (`git log main` works — refs are shared).

## The coordinator's checklist (after each agent finishes)
1. `git -C <worktree> status --porcelain` is clean; `git log --oneline main..<branch>`.
2. **Scope**: `git diff --name-only main...<branch>` lists only files the phase owns.
3. `git merge --no-ff -q <branch> -m "Merge phase <X>: <what it made true>"`.
4. **The full suite on main**, not just the phase's own checks (parallel branches meet here):
   tests, perf budgets, golden, ALL capture tests + a console-error scan
   (`grep -l "\[error\]\|js-error\|\[crash\]" games/<id>/dev/out/*/console.txt`), `studio check`,
   the art fingerprint. Look at one or two screenshots of what changed.
5. Fix forward or hand it on: an integration failure goes to a small follow-up agent (or the running
   agent that owns the file, via SendMessage) — never revert silently.
6. Push, where the person has said pushing is fine.
7. **Remove the worktree safely**: stop leftover processes in it (an agent's `tail -f` keeps it
   locked), delete any `node_modules` link first, then `git worktree remove --force <path>` and
   `git branch -d <branch>`. Check the main `node_modules` is intact afterwards.
