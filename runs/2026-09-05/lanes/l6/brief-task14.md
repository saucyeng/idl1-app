# L6 Task 14 — implementer brief (save with `based_on_hash`, conflict handling, and live reload)

You are the implementer for L6 Task 14 of the idl1 rewrite — the pure
`saveFlow` state machine over injected save/read functions, and the
frontend-side self-write suppression check that is defence-in-depth on top
of the Rust watcher's own expected-hash set. ONE commit, then report.

## Before anything else: verify Task 13 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/model/workbookState.ts` (Task 13) with
its `WorkbookState` shape, and the `ipcStubs/readWorkbook.ts` N1 stub. **If
either is missing — STOP and report.** Read Task 13's *actual* committed
`WorkbookState` fields (`handle`, `markdown`, `hash`, `cells`, `outputs`,
`dirtyCellIds`, `status`) before writing this task — this brief assumes the
plan's sketch of that shape; if Task 13's implementer refined it (the brief
allowed that), use the real shape.

Also read, before writing anything:
- `app/src/ipc/workbook.ts` — `saveWorkbook(id, markdown, basedOnHash)` and
  `watchWorkbook(id, onEvent)`, both already landed. Read `saveWorkbook`'s
  doc comment on `basedOnHash: null` meaning "creating a new workbook" (an
  existing target then errors, per `write_atomic`'s own semantics) — this
  task's "creating a new workbook" test depends on getting that null case
  right.
- C4 §4 "Atomic writes" in full
  (`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`, lines
  197–288) — read the whole section, not just the excerpt below; it explains
  *why* two independent belts exist (the Rust `ExpectedHashSet` plus this
  task's frontend check) and what "re-run" means for workbooks (the per-cell
  merge, assigned to L11, not this task).
- Ruling R44 (`runs/2026-09-03/decisions.md`, search "R44") — the `conflict`
  kind rationale.
- Task 13's `readWorkbook` stub (`Notebook/ipcStubs/readWorkbook.ts`) — this
  task's "creating a new workbook" and "hash last read" tests interact with
  whatever `status: "not_implemented"` state Task 13 built around N1's
  absence. If `read_workbook` genuinely has not landed by the time you start
  (check `app/src/ipc/workbook.ts` for a `readWorkbook` export — if present,
  N1 landed and Task 13's stub should already have been swapped; if it
  wasn't, that's a Task 13 follow-up, not yours to silently fix here, but
  flag it), this task's save flow still needs *some* `based_on_hash` to pass
  — say explicitly in your report what value you use in the
  `not_implemented` state (there may not be a legally correct one, in which
  case "save" itself may need to also report as unavailable in that state —
  this is worth a paragraph in your report, not a silent guess).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**

## C4 §4, the two-belt rationale (read the whole section; excerpt)

> **The race this must survive: an external edit arriving between write and
> rename.** [...] Step 4's optimistic check catches this [server-side]. [...]
> **Workbooks:** re-run through the same per-cell merge (design §7) used by
> LAN sync [...]. **Watcher scope.** Only `<data>/workbooks` is watched [...]
> Hash present and matches → this was the app's own write; consume [...] and
> do **not** re-parse [...]. Hash absent, or present but different → external
> edit; proceed with the documented debounce (~100 ms) → re-parse [...].

The Rust watcher's `ExpectedHashSet` is the **primary** mechanism and already
correctly ignores the app's own writes server-side. This task's
`isSelfWrite` is a **second, independent belt** for the case where a save's
own rename races the frontend's `watchWorkbook` subscription — it compares
an incoming `WorkbookEvent` against the hash the last `SaveResult` returned,
with the same 5-second TTL C4 §4 states for the server-side set. State this
explicitly in the doc comment so nobody later removes the Rust mechanism
thinking this one replaces it.

## Interfaces (from the plan, Task 14)

```ts
/** Injected deps so saveFlow is testable without mocking Tauri. */
interface SaveFlowDeps {
  save(id: string, markdown: string, basedOnHash: string | null): Promise<SaveResult>;
  now(): number; // ms epoch, injected for deterministic TTL tests
}

type SaveFlowState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; hash: string; savedAtMs: number }
  | { status: "conflict" }         // C3 §2, R44 -- offers reload-or-overwrite, not a generic error
  | { status: "error"; error: IpcError };  // kind !== "conflict"; document dirty stays true

/** Drives one save attempt. On success, records the new hash for later
 *  isSelfWrite checks. On a `conflict`-kind rejection, transitions to the
 *  conflict state rather than surfacing a toast. Any other rejection
 *  surfaces as `error` and leaves the caller's document dirty. */
function saveFlow(deps: SaveFlowDeps): {
  save(id: string, markdown: string, basedOnHash: string | null): Promise<SaveFlowState>;
  state(): SaveFlowState;
};

/** The frontend half of C4 §4's self-write suppression (defence in depth --
 *  the Rust ExpectedHashSet is primary). `lastSavedHash`/`lastSavedAtMs`
 *  come from the most recent `saved` SaveFlowState; `nowMs` is injected. */
function isSelfWrite(
  event: WorkbookEvent,
  lastSavedHash: string | null,
  lastSavedAtMs: number | null,
  nowMs: number,
  ttlMs: number  // 5000, matching C4 §4's stated TTL
): boolean;
```
Adjust the exact `SaveFlowState`/`SaveFlowDeps` shapes as needed to make the
7 tests below exact — the plan states this loosely ("a pure-ish state
machine"); document your refinement. Consumes `ipc/workbook.ts`.

## The task

**Files:**
- Create: `Notebook/model/saveFlow.ts`, `Notebook/model/saveFlow.test.ts`,
  `Notebook/components/ConflictBanner.tsx`
- Modify: `Notebook/model/workbookState.ts`, `Notebook/index.tsx`

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  - `saveFlow — a save with the hash last read — passes it as based_on_hash and stores the returned hash`
  - `saveFlow — a rejection with kind conflict — enters the conflict state, does not surface a generic error`
  - `saveFlow — a rejection with kind io — surfaces an error and leaves the document dirty`
  - `saveFlow — creating a new workbook — passes based_on_hash null (C3 §3.4)`
  - `isSelfWrite — a watch event arriving right after our own save — is suppressed`
  - `isSelfWrite — a watch event after an external edit — is not suppressed and triggers a reload`
  - `isSelfWrite — a watch event more than the TTL after our save — is not suppressed (C4 §4)`

  7 tests, matching the plan's Step 1 list exactly. A/A/A with blank lines
  between sections. Use an injected fake `save` (never a real `invoke`/mock
  of Tauri) and an injected `now()` for the TTL tests — no real timers, no
  `vi.useFakeTimers()` needed if `now()` injection is enough on its own
  (simpler than Task 8's `settle.ts`, which genuinely needed a timer).

- [ ] **Step 2: Implement**

  `saveFlow`: a small class or closure holding one `SaveFlowState`. On
  `save()`, transition to `saving`, call `deps.save(...)`, and on resolution
  transition to `saved` (recording `hash`/`savedAtMs` via `deps.now()`) or,
  on rejection, branch on the rejection's `kind`: `"conflict"` →
  `conflict` state; anything else → `error` state, `document dirty stays
  true` per the test name (i.e. do not clear whatever dirty-tracking
  `workbookState.ts` owns on a non-conflict error — confirm how
  `workbookState.ts`'s `dirtyCellIds` should be told about this; a save
  failure must not silently mark the document clean).

  `isSelfWrite`: `event`'s associated hash isn't itself in `WorkbookEvent`
  (per `ipc/workbook.ts`, `WorkbookEvent` only carries `kind`/`cell_ids`,
  **no hash**) — re-read `ipc/workbook.ts`'s `WorkbookEvent` interface
  carefully before assuming the signature above is implementable as
  literally written. If the real Rust-side watch event genuinely carries no
  hash, `isSelfWrite` cannot compare hash-to-hash on the frontend at all —
  in that case, the honest frontend belt is narrower than the plan's sketch
  implies: it can only compare **timing** (an event within the TTL after our
  own save, on the same workbook id, with `kind: "changed"`) as a heuristic,
  which is weaker than a hash comparison. **This is worth stopping on**: if
  `WorkbookEvent` truly has no hash field, say so explicitly in your report
  as a real gap between the plan's sketch and the landed C3 contract, propose
  the timing-only heuristic as the best available frontend belt, and ask
  whether the lead wants `WorkbookEvent` amended to carry the resulting
  hash (a C3 change, out of this lane's authority) rather than silently
  implementing a weaker check than the plan implied without flagging it.

  Conflict UI (`ConflictBanner.tsx`): *Reload from disk* (discard local
  edits — re-run `readWorkbook`/whatever Task 13 built for N1, replace
  `workbookState`'s markdown/cells/hash) or *Overwrite* (re-read, re-apply
  local edits on top, save again with the new hash). The per-cell merge C4
  §4 names as the eventual answer is **L11's** job (a pure function this
  lane does not reimplement) — leave a `// TODO(idl0):` pointing at L11 on
  the banner's implementation, per the plan's explicit instruction, so
  nobody mistakes this banner for the final merge UI.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/saveFlow
  ```
  Expected: 7 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Workbook save with optimistic concurrency, conflict banner, live reload (L6 Task 14).** `conflict`-kind rejections offer reload-or-overwrite, not a generic error (R44); frontend self-write check is defence in depth alongside the Rust ExpectedHashSet (C4 §4).
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/saveFlow.ts src/routes/pages/Notebook/model/saveFlow.test.ts src/routes/pages/Notebook/components/ConflictBanner.tsx src/routes/pages/Notebook/model/workbookState.ts src/routes/pages/Notebook/index.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: workbook save with optimistic concurrency, conflict banner, live reload
  ```

## Do not

- Do not implement the per-cell merge yourself — that is explicitly L11's
  pure function (C4 §4, design §7). The conflict banner offers
  reload-or-overwrite only.
- Do not silently implement `isSelfWrite` against a hash field
  `WorkbookEvent` doesn't actually have — if it's genuinely absent, stop and
  report per Step 2's instructions rather than inventing one or
  approximating without saying so.
- Do not clear a document's dirty state on a non-conflict save error.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol, with units (`ttlMs`/`savedAtMs`/
`nowMs` in ms epoch or ms duration, stated per field); state explicitly in
`isSelfWrite`'s doc comment that this is defence in depth, not the primary
mechanism (C4 §4); `// TODO(idl0):` never bare `// TODO`; A/A/A tests with
blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(expect 7 passed); confirmation of whether `WorkbookEvent` (as actually
landed in `ipc/workbook.ts`) carries a hash `isSelfWrite` can compare
against, or only `kind`/`cell_ids` — if the latter, flag the resulting
weaker heuristic explicitly as described in Step 2, do not bury it; what
`based_on_hash` value the save flow uses while Task 13's N1 stub reports
`not_implemented` (or confirmation N1 landed by the time you started, in
which case say so); per-step done/deviated; anything ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
