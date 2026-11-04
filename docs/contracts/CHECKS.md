# Checks — the contract

How a game says which checks guard which of its parts (`checks.json`), how `node cli/yak.mjs test`
picks and runs them, the pre-push hook, and the capture-test format. Code: `tools/checks.mjs`,
`cli/commands/checks.mjs`, `tools/run-captures.mjs`, `tools/game-capture.cjs`.

**The rule:** done = the checks for what you changed pass, and you looked at what you changed. The
full set runs before every push (the hook), so nobody has to babysit it.

## `games/<id>/checks.json`
```json
{
  "format": "pixel-yak-checks@1",
  "checks": {
    "unit":     { "run": "node --test \"games/{{ID}}/dev/**/*.test.mjs\"" },
    "studio":   { "yak": "check" },
    "boot":     { "captures": ["boot"] },
    "captures": { "captures": "*" },
    "golden":   { "run": "node games/{{ID}}/dev/golden.mjs", "timeout": 120, "note": "a big game's own check" }
  },
  "areas": {
    "game/sprites.js": ["unit", "studio", "boot"],
    "game/art/**":     ["studio", "boot"],
    "design/**/*.js":  ["studio", "boot"],
    "design/**":       [],
    "game/sim/**":     ["unit", "golden"],
    "game/**":         ["unit", "boot"],
    "dev/tests/**":    ["captures"],
    "requests/**":     [],
    "**/*.md":         []
  },
  "quick": ["unit"],
  "full":  ["unit", "studio", "captures", "golden"],
  "perf":  []
}
```
- **`checks`** — each named check has exactly one of:
  - `run`: a shell command, run from the Pixel Yak folder. `{{ID}}` and `{{DIR}}` (= `games/<id>`) are filled in.
  - `yak`: a `node cli/yak.mjs` command; the game id is appended unless the text has `{{ID}}`.
  - `captures`: capture tests by name (`["boot", "title"]`), or `"*"` for all of `dev/tests/`.
  - optional `timeout` (seconds, default 600) and `note`.
- **`areas`** — glob → the checks a change there needs. Paths are relative to the game folder; `**` is any
  folders, `*` stays within one name. **A changed file takes the checks of the first pattern it matches**,
  so specific patterns go first. `[]` means "no checks" (docs, tickets). A file in no area is reported.
- **`quick`** — the fast set (`test <game> --quick`). **`full`** — what the hook runs (default: every
  check). **`perf`** — budgets and benchmarks, run only on purpose (`--perf`): hot-path work, releases.
- A game without a `checks.json` gets the default set in `tools/checks.mjs` (the same as
  `templates/blank/checks.json`). A game may add its own checks (golden replays, perf budgets) freely.

## `node cli/yak.mjs test <game> [check…] [--changed|--quick|--full|--perf] [--since <ref>] [--fail-fast] [--list]`
- **`--changed`** (the default): what changed, then only the checks its areas name.
  - The game is its own repo (`games/<id>/.git`): `git diff HEAD` + untracked files there.
  - Else, in the harness repo: the same, limited to `games/<id>/`.
  - Else (a game folder git ignores): files modified since the last run that passed.
  - `--since <ref>` compares with a commit instead of `HEAD` (e.g. everything on this branch).
- A game's own engine copy (`engine/**`) is an area like any other: the template's `checks.json`
  gives it unit, studio and boot, so pulling an engine update runs them. An edit to the harness's
  `engine/` changes no game (each has its own copy); it runs Pixel Yak's own `npm test`.
- Several selected checks that each run some capture tests become **one** run of their union, so a
  capture test never runs twice at once (two runs writing one `dev/out/<test>/` corrupt each other).
- Checks run in parallel (up to half the CPU cores, at most 4; `--jobs n`). One line each (`PASS studio 0.5 s`); a failure prints its command and the
  part of its output that matters; a summary line; exit code 1 on any failure. `--list` shows the
  checks, the areas and the sets.

## The pre-push hook: `node cli/yak.mjs hooks <game> --install`
Writes `pre-push` into the game's own repo (`git rev-parse --git-path hooks`). It runs
`node cli/yak.mjs test <game> --full --fail-fast` from the harness folder (two folders up) and stops
the push if anything fails. `--uninstall` removes it (and puts back a hook it replaced with `--force`);
no flag says whether it's installed. `git push --no-verify` skips it once — only when the user says so.

## Capture tests: `games/<id>/dev/tests/<name>.json`
One headless run of the game (`tools/game-capture.cjs`, each run in its own throwaway browser
profile, so it never touches the user's saves):
```json
{
  "page": "games/slime-hop/game/index.html?fresh=1",
  "w": 960, "h": 540,
  "steps": [
    { "waitFor": "window.__studioMoment && __studioMoment().tick > 2", "ms": 8000, "label": "the game is running" },
    { "key": "Space" },
    { "hold": "ArrowRight", "ms": 400 },
    { "expect": "__studioMoment().scene", "equals": "play", "label": "Space starts the game" },
    { "shot": "01-play.png" }
  ]
}
```
| Step | Does |
|---|---|
| `{"wait": ms}` | a fixed pause — prefer `waitFor` |
| `{"key": "KeyX", "ms": 50}` | press and release (`KeyboardEvent.code` values) |
| `{"hold": "ArrowRight", "ms": 300}` | hold, then release |
| `{"down": "ShiftLeft"}` / `{"up": "ShiftLeft"}` | press / release separately |
| `{"js": "…"}` | run code in the page; its value goes to `console.txt` as `[js]` |
| `{"shot": "name.png"}` | a screenshot |
| `{"expect": "…"}` | a check: the value must be truthy… |
| `{"expect": "…", "equals": <json>}` | …or deep-equal this JSON |
| `{"waitFor": "…", "ms": 5000}` | a check: poll until truthy, fail on timeout |
| `"label": "…"` | on any check: the name it's reported by |

A failed check is marked `[FAIL]` in `console.txt`, listed in `result.json`, and the run exits 1. Steps
keep running so the screenshots still show what happened — unless the test has `"failFast": true` or the
run gets `--fail-fast`: then it stops at once and saves `fail-step-<n>.png`.

`node tools/run-captures.mjs <game> [name…] [--jobs N] [--fail-fast]` runs them into
`games/<id>/dev/out/<name>/` (screenshots, `console.txt`, `result.json`) — in parallel, min(4, half the
CPUs) at a time by default — and prints PASS/FAIL per test. Read that first; open the screenshots of
what you changed or what failed. A test with no `expect`/`waitFor` only proves the page loads.

## Testing the studio itself
`electron . --capture=<steps.json> --out=<dir>` drives the studio headless (throwaway profile). Steps:
`wait`, `until` (a JS condition, `timeout`), `js`, `key` (+`modifiers`), `click [x, y]`, `shot`,
`gameShot`, `gameKey`, `gameJs`. `window.__studio` is the app object (e.g. `__studio.go('inbox')`).
Output: the PNGs and `console.txt`.
