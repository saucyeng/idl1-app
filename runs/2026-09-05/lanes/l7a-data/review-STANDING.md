# L7a (Data tab) — standing reviewer brief

Reusable across every L7a task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
file, e.g. `brief-task2.md`) — that brief's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. The dispatch message gives the exact commit
  (`git show --stat <hash>`) — review that commit's diff, not the whole
  branch, unless told otherwise.
- Read-only there, with one exception: writing your findings file. Never
  `git revert`, `git checkout <path>`, `git reset`, or `git stash` in this
  worktree — not even to check a test fails pre-fix. If you want that, check
  out the parent commit in a disposable `git worktree add` to a throwaway
  path.
- Do NOT touch the shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`
  or any other worktree. Do NOT push. Do NOT fix the code yourself — findings
  only; a fix is a separate dispatched task.
- **You never build.** No `npm ci`, no `npm install`.

## COMPUTE RULES — non-negotiable

**No cargo, ever** — this is a UI lane; the §8/§4 hook denies cargo under
`idl1-app-worktrees/wave2-*` and you have no reason to need it. Run the
task's own gate command **exactly once**, from `app/`, to reproduce the
implementer's reported result:
```
cd app && npx tsc --noEmit && npx vitest run <the filter the task's brief names>
```
`vitest` must report a non-zero `passed` count — a filter matching nothing is
a failed gate (operating brief §4), and if the implementer's own reported run
shows `0 passed`, that alone is grounds for NEEDS_FIXES regardless of what
else you find. `tsc --noEmit` must print nothing. Do not rerun the whole TS
suite unless the task under review is Task 8 (the lane merge gate).

## What to verify (generic — every task)

- **The task's own brief's rulings win over the plan's prose.** Where
  `docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`'s task text
  and the dispatched brief disagree, the brief is authoritative — do not flag
  a deviation from the plan that the brief explicitly addressed. Do flag a
  deviation from the *brief*.
- **Ownership boundary (operating brief §2).** `git diff --stat` against the
  commit: every path must be under `app/src/routes/pages/Data/**`, this
  lane's own `*.test.ts` files, `CHANGELOG.md`, `TASKS.md` (Task 8 only), or
  — additive type fixes only — `app/src/ipc/catalog.ts` / `app/src/ipc/import.ts`.
  `docs/IDL0_SPEC.md` only on the spec-during tasks (3, 5, 7) and only §24.
  **Any** touch to `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`,
  `main.tsx`, `routes/types.ts`, `state/AppState.tsx`, `package.json`,
  `vite.config.ts` is a Critical finding regardless of what the change does —
  those are lead-owned files this lane may never edit.
- **No new command in `app/src/ipc/*.ts`.** A type fix is additive
  (widening/correcting a field) — a brand-new exported function calling
  `invoke` with a command name not already in C3 §3 is out of scope for this
  lane; flag it.
- **Stubs never invent an `IpcError` kind.** `Data/ipcStubs.ts` (from Task 6
  on) throws a local `NotImplementedError`, never a fabricated `IpcError`
  with a `not_implemented` kind — C3 §2's kind vocabulary is additive-only.
- **No cargo in the diff or the reported commands.** This is a UI lane; a
  `cargo`/`npm run tauri` invocation anywhere in the implementer's reported
  steps is a Critical finding on its own.
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each; test names literally `thing — condition — result` (em dash). Pure
  modules (view-models, formatters, reducers, the filter predicate, the
  import queue reducer, the metadata-form draft) are tested; **no rendering
  tests** — no React Testing Library, no snapshot of a component tree, no
  jsdom DOM assertions. A `.test.ts` file exercising a `.tsx` component's
  rendered output rather than a pure module it imports is a finding.
- **CLAUDE.md §5 (documentation and errors).** Doc comment on every exported
  symbol; units on every numeric value's doc comment (`_ms`, `_bytes`); no
  `Err(String)`-equivalent silent string errors; every `invoke` rejection
  routed through `describeIpcError`'s `kind`, never string-matched on
  `.message`.
- **R53 rulings, checked against the task actually under review** (not every
  ruling applies to every task — see `runs/2026-09-05/lanes/l7a-data/BRIEF.md`
  for the full list): Q2 (no has-gates/has-GPS facets, Task 3 on), Q3 (the
  `selection` slice is read from `state/AppState.tsx` once it exists on
  `main`, never invented locally, from the task that first needs it), Q4
  (lap counts/tables render "—"/empty honestly, no fabricated non-zero
  value, Tasks 4 and 8), Q5 (lap table shows a sector count only, never
  parses `sectors`/`neutral_zone_visits` beyond `.length`, Task 4).
- **Spec discipline.** The task's declared discipline (no-change / spec-during)
  matches what the diff actually does to `docs/IDL0_SPEC.md`; a spec-during
  task's §24 edit reads as a real rewrite of the relevant subsection, not a
  one-line stub.
- **Repo hygiene.** Commit message is a single line, no AI attribution
  trailer; `git add` used explicit paths (a stray file pulled in by
  `git add -A` is a finding); nothing under `rust/` or `app/src-tauri/`
  touched.

## Findings file

Write to `runs/2026-09-05/lanes/l7a-data/review-task<N>.md` (or
`-fix<N>.md` for a re-review of a fix-up). Structure, matching
`runs/2026-09-03/lanes/l2-importers/review-task*.md`:

1. Header: task name/scope, worktree, branch, commit hash under review, one
   line naming what's in scope (and explicitly what's out of scope, if the
   worktree has other uncommitted/unrelated changes present).
2. `## Test command and result` — the exact command run, its full output
   (including the `Test Files`/`Tests` summary line with the `passed`
   count), and a one-line confirmation it reproduces what the implementer
   reported.
3. `## Findings` — a table:

   | Severity | file:line | Finding | Fix |
   |---|---|---|---|

   Severity is one of **Critical** (breaks the gate, a shipped-behaviour bug,
   silently wrong output, an ownership-boundary violation, a fabricated
   `IpcError` kind), **Important** (a real defect with a concrete
   consequence — a missed edge case a test should have caught, a spec
   deviation), or **Minor** (style, a missing doc comment, a pre-existing
   pattern gap this task merely matches). State "No Critical/Important
   findings" explicitly when true.
4. `## Checks performed (all pass)` — bullet list of everything you verified
   that did *not* produce a finding.
5. `## Verdict rationale` — one paragraph, no hedging.
6. Final bare line: `VERDICT: CLEAN`, `VERDICT: NEEDS_FIXES`, or
   `VERDICT: NEEDS-REWORK`. CLEAN = ship as is. NEEDS_FIXES = correct
   approach, one or more Important/Critical findings with a small/mechanical
   fix. NEEDS-REWORK = the approach itself is wrong (wrong layer, wrong
   ownership, a ruling not followed at all) — expect the task re-dispatched.

## Report back

In your final message (not just the file): the findings-file path, the
verdict line, and a one-sentence summary. If you found something implying a
lead ruling is needed (a genuine ambiguity the task's brief didn't resolve,
not an implementer slip) — say that explicitly and separately.

## Added 2026-09-05 — IPC-driving effects (operating brief §4, after two Criticals)

Trace every React `useEffect` that starts IPC or `postMessage` work: compare
its dependency array against what it dispatches. An effect whose own
cleanup can cancel the work it started (because it depends on the state it
dispatches into) is **Critical**. The decision logic must live in a pure,
unit-tested driver module with an injected async function; the effect only
calls it. Check the driver's tests cover dismiss-while-running, stale
response, and (for the sandbox) rebuild re-priming.
