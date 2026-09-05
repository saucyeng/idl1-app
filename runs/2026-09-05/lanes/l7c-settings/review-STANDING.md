# L7c (Settings tab) — standing reviewer brief

Reusable across every L7c task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
file, e.g. `brief-task2.md`) — that brief's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`. The dispatch message gives the exact commit
  (`git show --stat <hash>`) — review that commit's diff, not the whole
  branch, unless told otherwise.
- Read-only there, with one exception: writing your findings file. Never
  `git revert`, `git checkout <path>`, `git reset`, or `git stash` in this
  worktree.
- Do NOT touch the shared checkout or any other worktree. Do NOT push. Do
  NOT fix the code yourself — findings only.
- **You never build.** No `npm ci`, no `npm install`.

## COMPUTE RULES — non-negotiable

**No cargo, ever** — the §8/§4 hook denies cargo under
`idl1-app-worktrees/wave2-*`. Run the task's own gate command **exactly
once**:
```
cd app && npx tsc --noEmit && npx vitest run <the filter the task's brief names>
```
Non-zero `passed` required — a filter matching nothing is a failed gate, and
if the implementer's own reported run shows `0 passed`, that alone is
grounds for NEEDS_FIXES regardless of what else you find. `tsc --noEmit`
must print nothing. Do not rerun the whole TS suite unless the task under
review is Task 6 (the lane merge gate).

## What to verify (generic — every task)

- **The task's own brief's rulings win over the plan's prose.** In
  particular: **R53 Settings Q1** — the prefs model lives behind
  `PrefsBackend`, `localStorage` is the only backend implemented in wave 2,
  and no task calls a real `get_settings`/`set_settings` command (they don't
  exist yet; a call to either is a Critical finding — the lane must be
  calling the stub or the local store, never inventing an early command
  call). **R53 Q3** — sync status/pairing belong in this tab; do not flag
  their presence as scope creep.
- **Ownership boundary (operating brief §2).** `git diff --stat` against the
  commit: every path must be under `app/src/routes/pages/Settings/**`, this
  lane's own `*.test.ts` files, `CHANGELOG.md`, `TASKS.md` (Task 6 only), or
  — additive type fixes only — `app/src/ipc/sync.ts` / `app/src/ipc/engine.ts`.
  `docs/IDL0_SPEC.md` only on spec-during tasks (2, 4, 5, 6) and only §27
  (and §28's superseded banner, Task 5 only). **Any** touch to `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts` is a Critical
  finding.
- **No new command in `app/src/ipc/sync.ts` / `engine.ts`.** A type fix is
  additive; a brand-new exported function calling `invoke` with a command
  name not already in C3 §3.1/§3.9 is out of scope — flag it.
- **Stubs never invent an `IpcError` kind.** `Settings/ipcStubs.ts` throws a
  local `NotImplementedError`, never a fabricated `IpcError`. `sync_status`
  / `sync_now` / `pair_peer` must **not** be stubbed at all (they are real
  C3 §3.9 commands) — a stub wrapping one of these three in this lane's
  diff is itself a finding (it hides a real, already-landed contract call
  behind an unnecessary placeholder).
- **Every `localStorage` access wrapped, from Task 2 on.** A read or write
  that can throw uncaught (private browsing, cleared site data, a policy) is
  a Critical finding — the plan's own stated invariant is that a failure
  yields defaults on read and a reported failure on write, never a crash.
- **Engine-prefs field parity, from Task 2 on.** `EnginePrefs`'s three
  fields (`data_dir`, `rider_name`, `unit_system`) and their "" / null
  conventions must match `rust/core/src/store/settings.rs`'s `AppSettings`
  and C4 §1 exactly — a drift here means the eventual `get_settings`/
  `set_settings` command needs a translation layer the plan explicitly
  intends to avoid.
- **No cargo in the diff or the reported commands** — any `cargo`/
  `npm run tauri` invocation in the implementer's reported steps is
  Critical.
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each; test names literally `thing — condition — result` (em dash). Pure
  modules (the prefs model, the store, the unit table, `validateDataDir`,
  `pairCode`, `syncState`, `controls`, `about`) are tested; **no rendering
  tests**.
- **CLAUDE.md §5.** Doc comment on every exported symbol, units on every
  numeric value, no `Err(String)`-equivalent, errors routed on `kind` never
  `.message`.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer,
  explicit `git add` paths (not `-A`); nothing under `rust/` or
  `app/src-tauri/` touched.

## Findings file

Write to `runs/2026-09-05/lanes/l7c-settings/review-task<N>.md` (or
`-fix<N>.md` for a re-review). Structure, matching
`runs/2026-09-03/lanes/l2-importers/review-task*.md`:

1. Header: task name/scope, worktree, branch, commit hash under review, one
   line naming what's in scope (and what's out of scope, if present).
2. `## Test command and result` — the exact command run, its full output,
   and a one-line confirmation it reproduces what the implementer reported.
3. `## Findings` — a table:

   | Severity | file:line | Finding | Fix |
   |---|---|---|---|

   **Critical** (breaks the gate, a shipped-behaviour bug, an ownership
   violation, a fabricated `IpcError` kind, an uncaught `localStorage`
   throw, a stub wrapping a real C3 §3.9 command, an `EnginePrefs` field
   drifted from `AppSettings`), **Important** (a real defect with a
   concrete consequence), or **Minor** (style, a missing doc comment).
   State "No Critical/Important findings" explicitly when true.
4. `## Checks performed (all pass)` — bullet list of everything verified
   that did *not* produce a finding.
5. `## Verdict rationale` — one paragraph, no hedging.
6. Final bare line: `VERDICT: CLEAN`, `VERDICT: NEEDS_FIXES`, or
   `VERDICT: NEEDS-REWORK`.

## Report back

In your final message: the findings-file path, the verdict line, and a
one-sentence summary. If you found something implying a lead ruling is
needed, say that explicitly and separately.

## Added 2026-09-05 — IPC-driving effects (operating brief §4, after two Criticals)

Trace every React `useEffect` that starts IPC or `postMessage` work: compare
its dependency array against what it dispatches. An effect whose own
cleanup can cancel the work it started (because it depends on the state it
dispatches into) is **Critical**. The decision logic must live in a pure,
unit-tested driver module with an injected async function; the effect only
calls it. Check the driver's tests cover dismiss-while-running, stale
response, and (for the sandbox) rebuild re-priming.
