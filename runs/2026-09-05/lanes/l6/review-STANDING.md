# L6 (Notebook tab) — standing reviewer brief

Reusable across every L6 task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
file, e.g. `brief-task3.md`) — that brief's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. The dispatch message gives the exact commit
  (`git show --stat <hash>`) — review that commit's diff, not the whole
  branch, unless told otherwise.
- Read-only there, with one exception: writing your findings file. Never
  `git revert`, `git checkout <path>`, `git reset`, `git stash`, or any
  command that mutates tracked files or index state in this worktree — not
  even to "verify the test fails without the fix." If you want to see a
  test fail pre-fix, read the diff and reason about it, or check out the
  parent commit in a disposable `git worktree add` to a throwaway path —
  never touch the shared worktree's working tree or index.
- Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` (shared
  checkout), the `rust/` submodule, or any other worktree. Do NOT edit
  anything under `docs/`. Do NOT push. Do NOT fix the code yourself —
  findings only; a fix is a separate dispatched task.

## COMPUTE RULES — non-negotiable

**No cargo, ever, in a `wave2-l6*` worktree** — the §8 hook denies it, and
this lane's tasks never need it: everything under review is TypeScript.
Run the task's targeted gate exactly once, from the worktree's `app/`, to
reproduce the implementer's reported result:
```
npx tsc --noEmit && npx vitest run <filter named in the task's brief>
```
`tsc` must be silent (no errors) and `vitest` must report a non-zero
`passed` count with `0 failed` — a filter matching nothing is a failed gate,
not a pass, and if the implementer's own reported run shows `0 passed`,
that alone is grounds for `NEEDS_FIXES` regardless of what else you find.
Do not run the whole-suite gate (`npx vitest run` with no filter) at a
per-task review — that is the lane merge gate only (Task 16). Do not rerun
the same command twice "to be sure." Do not run `npm install`/`npm ci`
unless the worktree's `node_modules` is missing entirely (if it's missing,
say so in your findings — that itself may indicate the task added a
dependency it shouldn't have, per the no-new-dependency rule below).

## What to verify (generic — every task)

- **The task's own brief's rulings win over the plan's prose.** Where
  `docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`'s task text
  and the dispatched brief disagree (a corrected test name, an added
  ruling, a re-derived case count), the brief is authoritative — do not
  flag a deviation from the plan that the brief explicitly addressed. Do
  flag a deviation from the *brief*.
- **No new npm dependency.** Check `git show --stat <hash>` for any touch
  to `package.json` or `package-lock.json`/`npm-shrinkwrap.json` — Tasks
  1–4 need none (verified against the plan at brief-writing time); any such
  touch is a Critical finding regardless of how small, since
  `package.json` is lead-owned (operating brief §2) and this lane may not
  edit it.
- **Ownership.** `git show --stat <hash>` touches only files under
  `app/src/routes/pages/Notebook/**` (plus `CHANGELOG.md`, since every task
  ends with a CHANGELOG bullet) — nothing in `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`. Task 1 is the one exception worth double
  checking closely: it must leave `App.tsx` completely untouched (the shim
  is the mechanism precisely so `App.tsx` doesn't need editing) — any diff
  to `App.tsx` in a Task 1 commit is a Critical finding.
- **Spec conformance — C2 grammar.** For Tasks 2–3 (`plotForm`): every
  generated/parsed string is checked against C2 §5.3's EBNF and its four
  worked examples, byte-for-byte where the brief says byte-for-byte
  (`generate`'s output) or deep-equal where the brief says deep-equal
  (`parse`'s output). `x.type` never appears in `types.ts`'s `XAxisProps`
  and is never emitted by `generate` — grep the diff for `x.type` and
  `"linear"` inside `generate.ts` to confirm. For Task 4 (`model/cells.ts`):
  every range returned is a UTF-8 byte offset (grep for `TextEncoder` and
  confirm ranges are indexed into its output, not into the raw JS string);
  an unrecognised fence attribute round-trips verbatim in `infoLine`; a
  fence with no `id=` reports `id: null`; an invalid `id=` value reports
  `idRaw` set and `id: null` (ruling R21, this lane's Q3 non-authoritative
  scope, per `brief-task4.md`).
- **D13 semantics** (Properties + Code as the two editing surfaces; the
  React Flow graph view is wave 3 and re-homes the same Properties form
  component) — not directly checkable in Tasks 1–4 (no component exists
  yet), but confirm nothing in these four tasks pre-commits to a shape that
  would make the wave-3 re-homing harder (e.g. a hidden dependency on
  `Notebook/index.tsx`'s DOM structure baked into `plotForm/` or `model/`
  — both must stay pure and React-free, verified below).
- **Purity.** `plotForm/` and `model/` modules import nothing from `react`,
  `@tauri-apps/api`, or any DOM global (`document`, `window`,
  `HTMLElement`). Grep the diff for these. A pure module reaching into a
  browser global — even something as innocuous as `TextEncoder`, which
  *is* available in both browser and Node/vitest and is fine to use — must
  not reach for `document`/`window`/`localStorage`, which vitest's default
  environment may or may not provide and which would silently make a
  "pure" module non-portable.
- **Performance budget statements (P1–P8), as far as Tasks 1–4 touch them.**
  These four tasks add no gesture handler, no `invoke` call, and no
  rendering — so most of P1–P8 are vacuously satisfied. Confirm this by
  grepping the diff for `invoke(` (should not appear anywhere in
  `Notebook/**` yet — Tasks 1–4 have no IPC surface of their own; Task 1's
  moved file keeps its existing `fetchTile`/`listSessions`/`getSession`
  calls unchanged, which are pre-existing wave-1 code, not new) and for
  `onPointerMove|onWheel|onTouchMove|requestAnimationFrame` (should not
  appear at all in these four tasks). Grep commands to run against the
  diff:
  ```
  git show <hash> | grep -n "invoke("
  git show <hash> | grep -nE "onPointerMove|onWheel|onTouchMove|requestAnimationFrame"
  ```
  Any hit in Tasks 1–4 is worth a question in your findings (not
  automatically a defect — Task 1's moved file has legitimate existing IPC
  calls — but confirm the call sites are the pre-existing ones from
  `NotebookPage.tsx`, not new).
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each section; test names `thing — condition — result`, exactly matching
  the names the task's brief specifies (a renamed test is a Minor finding
  unless the rename loses information the original name carried, in which
  case Important); tests beside the module as `*.test.ts`; vitest reports
  the exact `passed` count the brief's gate step expects — a lower count
  (fewer tests than specified) is an Important finding even if all present
  tests pass, since the brief's test list is not optional coverage, it's
  the spec's own worked examples and edge cases.
- **CLAUDE.md §5 (documentation and errors).** Doc comment on every
  exported symbol; units on every numeric value's doc comment
  (`strokeWidth` in px, ranges in bytes, delays in ms); `// TODO(idl0):`
  never bare `// TODO`; no function that should return `null`/a typed
  result instead throws on well-formed-but-unrepresentable input (`parse`
  must never throw; `generate` must never throw on any value the type
  system admits).
- **Coverage.** `plotForm/` and `model/` are pure TS modules and must
  exceed 80% (design §10) — for Tasks 1–4 this is checkable by inspection
  (every branch in `generate.ts`/`parse.ts`/`cells.ts` has a corresponding
  test in the brief's Step-1 list); if `vitest run --coverage` is available
  without adding a dependency, run it once for the task's filter and report
  the percentage, but do not add a coverage tool if one isn't already
  wired in — inspection against the brief's test list is sufficient for
  this review.
- **Repo hygiene.** Commit message is a single line, no AI attribution
  trailer; `git add` used explicit paths (check `git show --stat` against
  the brief's file list — a stray file pulled in by `git add -A` is a
  finding, and Task briefs explicitly forbid `git add -A`); nothing under
  `docs/` touched; the shared checkout untouched and still on `main`; no
  `cargo fmt`/`cargo tarpaulin`/`cargo doc` invocation anywhere (none of
  these tasks should invoke cargo at all).
- **Cross-task consistency** (Tasks 2+ only). Task 3 imports Task 2's
  `types.ts`/`generate.ts` rather than redeclaring `PlotProps`/`MarkProps`/
  etc. Task 3's round-trip tests use Task 2's actual reported
  indentation/key-order/trailing-newline policy (check Task 2's commit
  message for what that policy is, and confirm Task 3's fixtures match it
  byte-for-byte) — a drifted assumption here is a Critical finding since it
  would mean the round-trip tests are checking the wrong thing and could
  pass by coincidence or fail spuriously.

## Findings file

Write to
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-05\lanes\l6\review-task<N>.md`
(or `-fix<N>.md`/`-fix.md` for a re-review of a fix-up). Structure:

1. Header: task name/scope, worktree, branch, commit hash under review, one
   line naming what's in scope (and explicitly what's out of scope, if the
   worktree has other uncommitted/unrelated changes present — say so and
   ignore them).
2. `## Gate command and result` — the exact command run, its full output
   (including `tsc`'s silence or errors, and vitest's
   `Test Files ... Tests ... passed ...` summary line), and a one-line
   confirmation it reproduces what the implementer reported.
3. `## Findings` — a table:

   | Severity | file:line | Finding | Fix |
   |---|---|---|---|

   Severity is one of **Critical** (breaks the gate, a shipped-behaviour
   bug, silently wrong output — a byte-mismatched worked example, an
   `eval`/`new Function` call, a touched lead-owned file, a new dependency
   — belongs here), **Important** (a real defect with a concrete
   consequence — a missing test from the brief's list, a wrong severity of
   error handling, a spec deviation that isn't silently-wrong-output but is
   still a defect), or **Minor** (style, a missing doc comment, a
   pre-existing-pattern gap this task merely matches rather than
   introduces — say so explicitly when true, it's mitigating, not
   absolving). State "No Critical/Important findings" explicitly when true
   rather than leaving the reader to infer it from an empty table.
4. `## Checks performed (all pass)` — bullet list of everything you
   verified that did *not* produce a finding: the grammar/spec checks, the
   specific rulings from the task's brief and confirmation each was
   followed, purity checks (no React/IPC/DOM import in `plotForm/`/`model/`),
   test coverage adequacy against the brief's Step-1 list, hygiene checks.
   This is the section that lets a later reader trust "CLEAN" without
   re-deriving your work.
5. `## Verdict rationale` — one paragraph. State plainly what's correct,
   name the specific finding(s) (if any) that keep it from CLEAN, and say
   whether the fix is small/mechanical or a real rework. Don't hedge; if
   it's clean, say so without qualification.
6. Final line, bare, nothing after it on the line: `VERDICT: CLEAN`,
   `VERDICT: NEEDS_FIXES`, or `VERDICT: NEEDS-REWORK`. CLEAN = ship as is.
   NEEDS_FIXES = correct approach, one or more Important/Critical findings
   with a small/mechanical fix — expect a fix-up dispatch, not a redo.
   NEEDS-REWORK = the approach itself is wrong (wrong layer, wrong
   ownership, a ruling not followed at all, not just imperfectly — e.g. an
   `eval`-based parser, or logic reaching into `App.tsx`) — expect the task
   re-dispatched, not patched.

## Report back

In your final message (not just the file): the findings-file path, the
verdict line, and a one-sentence summary. If you found something that
implies a lead ruling is needed (a genuine ambiguity the task's brief
didn't resolve, not just an implementer slip) — say that explicitly and
separately, don't bury it in a Minor finding.
