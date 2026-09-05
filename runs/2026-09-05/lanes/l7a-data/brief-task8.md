# L7a Task 8 — implementer brief (maintenance actions, and this lane's wrap-up)

You are the implementer for L7a Task 8 — the toolbar's maintenance actions
(rebuild catalog, real; delete/forget session and quarantine review,
stubbed) and this lane's final task: the whole-suite gate, the coverage
check, and `TASKS.md`. No spec change needed. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **HEAD must be Task 7's commit** ("app: Data tab
  session metadata editor over save_session_metadata stub"). Verify with
  `git log -1` and `git status`; if not there, STOP and report.
- Work ONLY there. Never touch `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md` in full
  (this is the lane's last task — its whole "R53 rulings" and "Parity gaps"
  sections are what `TASKS.md`'s tick must reflect); `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`
  needs 3 and 4 (`delete_session`, `list_quarantine`/`resolve_quarantine`);
  the plan's Task 8 and its **Parity gaps table**
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`, lines
  477–541) — this is what `TASKS.md`'s tick must name, unabridged; the
  operating brief §4's gate section; `app/src/ipc/catalog.ts`'s
  `RebuildReport` (`sessions_indexed`, `workbooks_indexed`, `tracks_indexed`,
  `duration_ms`).

## The task (plan Task 8, Steps 1–3, plus the lane wrap-up Steps 4–5 below)

**Files:**
- Modify: `Data/index.tsx` (toolbar overflow menu), `Data/ipcStubs.ts`,
  `CHANGELOG.md`, `TASKS.md`
- Create: `Data/maintenance.ts`, `Data/maintenance.test.ts`

**Interfaces:**
- `maintenance.ts`: a pure reducer for the toolbar's long-running
  maintenance actions — `rebuildCatalog()` (**real**, calls
  `app/src/ipc/catalog.ts`'s `rebuildCatalog`) plus the stubbed
  `deleteSession(sessionId, deleteBlob)`, `forgetSession(sessionId)`
  (idl0's non-blob-deleting variant — map it to `deleteSession(id, false)`
  in `ipcStubs.ts` if that's simpler than a fourth stub function; say which
  you chose in your report) and `listQuarantine`/`resolveQuarantine` —
  tracking `{ action: string, status: "idle" | "running" | "done" |
  "failed", result?: string, error?: string }` and producing the summary
  line each real action shows, e.g. "Indexed 42 sessions, 3 workbooks, 1
  track in 1.2 s" from a `RebuildReport`.

- [ ] **Step 1: Write the failing tests**

  - `maintenance — rebuildCatalog succeeds — summary names every count from the RebuildReport`
  - `maintenance — rebuildCatalog with zero of everything — summary says the store is empty, not "0 0 0"`
  - `maintenance — an action rejects with kind io — status failed, the error's text is kept`
  - `maintenance — a second START while one is running — refused, the running action is untouched`
  - `maintenance — a stubbed action — status failed with the "not wired up yet" text, never a crash`

- [ ] **Step 2: Implement the overflow menu**

  `Rebuild catalog` is real, calling `rebuildCatalog()` and showing the
  summary. `Delete session`, `Forget session` and `Review quarantine` call
  stubs (add `deleteSession`, `listQuarantine`, `resolveQuarantine` to
  `Data/ipcStubs.ts`, following Task 6's `NotImplementedError` convention)
  and say so via the "not wired up yet" text; each is confirmed by a dialog
  first, because they are destructive the moment they become real — build
  that confirmation step even though the action underneath is a stub, so
  the UX doesn't have to change again when the command lands.

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 5 new tests passed, 0 failed.

- [ ] **Step 4: Lane merge gate — whole TS suite, then coverage**

  ```
  cd app && npx tsc --noEmit && npx vitest run
  ```
  Every file across every concurrent lane's committed work must pass (L7b,
  L7c and L6 are landing commits on `main`/their own branches concurrently
  — this worktree only sees what has been merged into it, so a failure here
  outside `Data/**` is a merge-order artifact, not necessarily this lane's
  bug; if you see one, STOP and report rather than fixing another lane's
  file).

  Then, once, run the coverage check named in the operating brief:
  ```
  cd app && npx vitest run --coverage src/routes/pages/Data
  ```
  Report the per-file percentages for every pure module in `Data/` (not
  `.tsx` files — `.tsx` is excluded from coverage by `vitest.config.ts` and
  rendering is not unit-tested, CLAUDE.md §4). Every pure module should
  clear 80%; if one does not, say which and by how much rather than adding
  a test purely to move a number — a real gap (an untested branch) is worth
  fixing, a cosmetic one is worth naming and leaving.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Data/maintenance.ts app/src/routes/pages/Data/maintenance.test.ts app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/ipcStubs.ts CHANGELOG.md TASKS.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + TASKS**

  `TASKS.md`'s L7a line is ticked here, and **only** if it names what is
  outstanding, R50-style: every write-command IPC need this lane stubbed
  (1–4; need 5 dropped outright, not stubbed), and the full Parity gaps
  table's dispositions (deferred-to-wave-3 items, dropped items, moved-to-
  L7b items) — not a bare checkmark claiming full parity.

- [ ] **Step 7: Commit**

  ```bash
  git add app/src/routes/pages/Data/maintenance.ts app/src/routes/pages/Data/maintenance.test.ts app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/ipcStubs.ts CHANGELOG.md TASKS.md
  git commit -m "app: Data tab maintenance actions; L7a lane complete pending write commands"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not tick `TASKS.md` without naming what's outstanding.
- Do not fabricate an `IpcError` kind for any stub.
- Do not "fix" a failing test outside `Data/**` yourself at the whole-suite
  gate — report it.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

No spec change needed (plan's own declaration for Task 8).

## Report back (concise)

Commit hash + `git show --stat`; the exact test commands and result lines
(both the targeted gate and the whole-suite gate, with `passed` counts);
the coverage report's per-module numbers for `Data/`; the `TASKS.md` line's
exact final text; confirmation the NUL-byte check printed `0` for every
file; anything ambiguous you resolved (say how) or that needs a lead ruling
— including, explicitly, whether the whole-suite gate showed anything
outside `Data/**` failing.
