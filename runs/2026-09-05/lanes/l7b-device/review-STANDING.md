# L7b (Device tab) — standing reviewer brief

Reusable across every L7b task review. The dispatch message appends the
task-specific scope (commit hash, files touched, and the task's own brief
file, e.g. `brief-task2.md`) — that brief's rulings are what you check
against; this file is the process/format contract that doesn't change task
to task.

## Where

- Worktree under review: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7b-device`,
  branch `wave2-l7b-device`. The dispatch message gives the exact commit
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
review is Task 9 (the lane merge gate).

## What to verify (generic — every task)

- **The task's own brief's rulings win over the plan's prose.** In
  particular: **R53 Device Q1 narrows Task 4** (channel-registry preview)
  to enable state, rate, and unit only — no `scale`, no predicted
  `channel_id`, no data-type column, and no `scale = range / 32768`
  arithmetic anywhere in TypeScript. If a Task 4 diff computes that formula
  in `Device/`, that is a Critical finding regardless of test coverage — it
  is CLAUDE.md §2's "no number the sync model depends on is computed in
  JavaScript" and the physics belongs to `core::parse`.
- **Ownership boundary (operating brief §2).** `git diff --stat` against the
  commit: every path must be under `app/src/routes/pages/Device/**`, this
  lane's own `*.test.ts` files, `CHANGELOG.md`, `TASKS.md` (Task 9 only), or
  — additive type fixes only — `app/src/ipc/device.ts`. `docs/IDL0_SPEC.md`
  only on spec-during tasks (2, 3, 4, 5, 6, 7, 8, 9) and only §8 or §23 as
  the task's own brief names. **Any** touch to `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts` is a Critical finding.
- **No new command in `app/src/ipc/device.ts`.** A type fix is additive; a
  brand-new exported function calling `invoke` with a command name not
  already in C3 §3.8 is out of scope — flag it.
- **Stubs never invent an `IpcError` kind.** `Device/ipcStubs.ts` throws a
  local `NotImplementedError`, never a fabricated `IpcError`.
- **The push invariant, once Task 3 lands (checked on every task from there
  on):** any code path that calls `pushConfig` does so only after
  `validateConfig` returns zero error-severity issues (`isPushable`) — a
  push call reachable without that gate is a Critical finding, not a style
  nit, per the plan's own stated invariant.
- **Unknown-key and read-only-field preservation, once Task 2 lands
  (checked on every task that touches the config model, edit ops, or
  serialise):** `unknown`, `device_id`, `config_version` must survive a
  parse → edit → serialise round trip in every new code path — a form or
  edit function that reconstructs a `DeviceConfig` object literal without
  spreading `unknown` forward is a finding.
- **No `scale`-snapping.** SPEC §8 off-list values are reported, never
  silently corrected to the nearest valid one (a deliberate divergence from
  idl0 the plan calls out) — any "nearest valid value" logic anywhere in
  this lane's diff is a finding.
- **No cargo in the diff or the reported commands** — a UI lane; any
  `cargo`/`npm run tauri` invocation in the implementer's reported steps is
  Critical.
- **No assertion against a live radio.** A test that requires a real BLE
  device to pass (rather than mocking `invoke`/the IPC layer) is a finding —
  the plan states no real device is available to any task.
- **CLAUDE.md §4 (testing).** Arrange/Act/Assert with a blank line between
  each; test names literally `thing — condition — result` (em dash). Pure
  modules (the config model, the validator, the registry preview, the edit
  operations, the profile/push reducers) are tested; **no rendering tests**.
- **CLAUDE.md §5.** Doc comment on every exported symbol, units on every
  numeric value, no `Err(String)`-equivalent, errors routed on `kind` never
  `.message`.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer,
  explicit `git add` paths (not `-A`); nothing under `rust/` or
  `app/src-tauri/` touched.

## Findings file

Write to `runs/2026-09-05/lanes/l7b-device/review-task<N>.md` (or
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
   violation, a fabricated `IpcError` kind, a push reachable without
   validation, a lost `unknown`/read-only field, a `scale = range / 32768`
   computed outside R53 Q1's narrowed scope), **Important** (a real defect
   with a concrete consequence), or **Minor** (style, a missing doc comment).
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
