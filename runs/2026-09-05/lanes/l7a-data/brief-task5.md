# L7a Task 5 — implementer brief (import: file picking, Channel<Progress>, result)

You are the implementer for L7a Task 5 — the import queue and panel over
C3 §3.3's `import_file`/`list_importers`. This task rewrites part of
`docs/IDL0_SPEC.md` §24 in the same commit (spec-during). TDD, ONE commit,
then report.

## A gap in the plan you must not guess past — read before Step 1

The plan's Task 5 text says "The Import button opens the file picker" but
**no file-picker mechanism exists anywhere in this codebase.**
`@tauri-apps/plugin-dialog` (the standard way to get a native "choose a
file" dialog with an Tauri app) is **not** in `app/package.json`, is not
listed in the M0 ecosystem report, and using it would need both a new npm
dependency (forbidden without a lead ruling) and a capability/plugin
registration in `app/src-tauri/` (a file this lane may never touch). This is
exactly CLAUDE.md §1's case: a layer/dependency question no contract or
plan states, so it is not this implementer's call.

**What to build anyway, so the task is not blocked on the answer:** the
queue reducer, the progress display, and the result handling are the
testable substance of this task and do not depend on how a path arrives.
Build `ImportPanel.tsx`'s trigger as a plain text input where the user types
or pastes an absolute file path, with an "Import" button that enqueues it —
no dependency, no `app/src-tauri` change, and it exercises the real
`importFile`/`listImporters` calls identically to however a future dialog
would. Label it in the UI as provisional ("Paste a file path" rather than
"Browse…").

**File this as a question in your report, do not silently resolve it as
permanent:** should the lead add `@tauri-apps/plugin-dialog` (with its
`app/src-tauri` capability entry) as a shell task so a later task can swap
the text input for a real native picker? State the bundle-size/native-
dependency cost is unknown to you (you have not measured it) and that this
is the lead's call, not this lane's.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **HEAD must be Task 4's commit** ("app: Data tab
  session detail pane over get_session/list_laps"). Verify with `git log -1`
  and `git status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §24 in this worktree is this
  lane's spec-during obligation — the one exception to "never touch shared
  docs elsewhere." Never touch `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever. No `npm install`.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md`; the
  plan's Task 5 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`,
  lines 335–386); `app/src/ipc/import.ts` in full (`Progress`,
  `ImporterInfo`, `importFile`, `listImporters` — these are **real, landed
  C3 §3.3 commands whose Rust side lands with L5 Task 9 on the Rust track,
  concurrently**; until then both calls reject and that is the correct
  behaviour, not a bug); `docs/IDL0_SPEC.md`'s current §24 import prose
  (idl0's Dart runs-provider flow, which this task's rewrite replaces).

## The task (plan Task 5, Steps 1–5, unchanged except the picker note above)

**Files:**
- Create: `Data/importQueue.ts`, `Data/importQueue.test.ts`, `Data/ImportPanel.tsx`
- Modify: `Data/index.tsx` (toolbar Import button), `docs/IDL0_SPEC.md` §24

**Interfaces:**
- `importQueue.ts`: a pure reducer over `{ items: ImportItem[] }` where
  `ImportItem = { path: string; importerId: string | null; phase: string;
  done: number; total: number | null; status: "queued" | "running" | "done"
  | "failed"; error?: string; sessionId?: string }`, actions `ENQUEUE`,
  `START`, `PROGRESS` (an `import.ts` `Progress` payload), `SUCCEEDED` (a
  `SessionSummary` from `app/src/ipc/catalog.ts`), `FAILED` (an `IpcError`),
  `DISMISS`. Plus `overallPercent(state): number | null` — `null` when any
  running item has `total === null`.

- [ ] **Step 1: Write the failing tests**

  - `importQueue — PROGRESS with total null — item shows a phase and a count, overallPercent is null`
  - `importQueue — PROGRESS then SUCCEEDED — status done, session id recorded, progress no longer advances`
  - `importQueue — FAILED with kind import_gpx_no_trackpoints — status failed, the kind's text is kept for display`
  - `importQueue — one file fails, another succeeds — the failure never cancels the other item`
  - `importQueue — PROGRESS for an item already done — ignored, no state change`
  - `overallPercent — three items, two done — reports progress across the queue, not per file`
  - `importQueue — DISMISS a failed item — removed; a running item — refused`

- [ ] **Step 2: Implement and wire**

  Enqueue runs items **one at a time, serialised** — this machine is
  memory-bound (R13) and import is CPU/I/O-heavy. Each call is
  `importFile(path, importerId, onProgress)`. An importer override menu
  reads `listImporters()`; `null` means extension auto-detection. On the
  queue draining (every item done or failed), the tab re-runs
  `listSessions()` so newly imported sessions appear without a manual
  refresh.

  **Do not add a stub for `import_file`/`list_importers`** — they are
  contract commands, not IPC needs; a rejection before L5 Task 9 lands is
  the correct, honest behaviour, shown through `describeIpcError` (Task 1).

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's import section**

  Describe: the picker is a pasted absolute path in wave 2 (name the gap
  above, one sentence, pointing at this brief rather than inventing spec
  language for a dialog that doesn't exist); the queue is serialised, one
  file at a time; progress streams via `Channel<Progress>` with `phase` and
  an optional `total`; a forced-importer override is available via
  `listImporters()`; idl0's Dart runs-provider import flow is gone.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Data/importQueue.ts app/src/routes/pages/Data/importQueue.test.ts app/src/routes/pages/Data/ImportPanel.tsx app/src/routes/pages/Data/index.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Data/importQueue.ts app/src/routes/pages/Data/importQueue.test.ts app/src/routes/pages/Data/ImportPanel.tsx app/src/routes/pages/Data/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Data tab import queue over import_file/list_importers"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not add `@tauri-apps/plugin-dialog` or any other new dependency.
- Do not touch `app/src-tauri/`.
- Do not stub `import_file`/`list_importers` — they are real contract calls.
- Do not import more than one file concurrently.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §24's import section rewritten in this
commit, per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; **the file-picker question above, stated explicitly
as needing a lead ruling** — do not let it pass as a settled decision;
confirmation the queue runs one file at a time; confirmation the NUL-byte
check printed `0` for every file; anything else ambiguous you resolved (say
how) or that needs a lead ruling.


## Lead ruling 2026-09-05 (R55) — file picker

Build the import entry point behind a `FilePicker` seam in this directory
(`pickImportFile(): Promise<string | null>`), whose wave-2 implementation is
the plain pasted-path text input this brief describes. Do NOT add
`@tauri-apps/plugin-dialog` or any capability entry: the dialog plugin needs
an `app/src-tauri` crate + capability change (a Tauri build), which is queued
for the Rust write-amendment lane; when it lands, the lead swaps the seam's
implementation in a shell task. Report the picker as "seam, text input" —
not as an open question.
