# L6 Task 14 review — workbook save with optimistic concurrency, conflict banner, live reload

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `b851665` (parent merge
`2f47651`, "Merge branch 'main' into wave2-l6-notebook"). In scope: the
`b851665` diff only —
`Notebook/model/saveFlow.ts`, `saveFlow.test.ts`, `Notebook/components/ConflictBanner.tsx`,
`Notebook/model/workbookState.ts`, `Notebook/index.tsx`, `CHANGELOG.md`.
Out of scope, noted but not graded: an uncommitted working-tree change to
the `rust` submodule pointer (`73179925…` → `75589bc…`, "commits not
present") present in the worktree at review time — not part of `b851665`,
not staged, consistent with the dispatch's note that a Task 13b implementer
may be committing concurrently in the shared worktree.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage.reporter=json-summary src/routes/pages/Notebook/model
```
`tsc` — silent, no errors.
`vitest` —
```
Test Files  16 passed (16)
     Tests  150 passed (150)
```
0 failed. This reproduces the implementer's reported "saveFlow 7 passed"
(the filter above runs the whole `model/` directory, which includes
`saveFlow.test.ts`'s 7 tests among 150 total across 16 files — all pass).
`coverage/coverage-summary.json` was not produced (coverage reporting isn't
wired into this project's vitest config); per the standing brief this is
acceptable and coverage is assessed by inspection instead (see below).
`coverage/` was not created, so nothing to delete.

Also ran once, per dispatch: `npx vite build` — succeeded, 793 modules
transformed, no errors (two chunks flagged >500 kB, pre-existing and
unrelated to this diff). `dist/` and `coverage/` deleted after both runs.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `Notebook/components/ConflictBanner.tsx:22-23` (text) | The banner's copy ("This workbook changed on disk since it was last read here.") never states that "Reload from disk" discards the user's local, unsaved edits — the button label alone doesn't convey that a click loses in-editor work. The brief's own prose acknowledges this is "discard local edits," but that framing isn't in the rendered UI. | Add a sentence or tooltip to the `onReloadFromDisk` button (or the banner body) making the data-loss explicit, e.g. "Reload from disk (discards your unsaved edits)." |
| Minor | `Notebook/model/saveFlow.ts:66-68` | The removed runtime `IpcError` type guard (`const error = reason as IpcError`) means a non-`IpcError` rejection (e.g. a raw `Error` from a transport-level `invoke` failure, or a non-object throw) is miscast: `error.kind === "conflict"` silently evaluates `false` and the flow falls into the generic `error` state, and `index.tsx`'s `saveFlowState.error.message` render depends on `.message` existing on whatever was thrown. For a real `Error` this degrades gracefully (its own `.message` still renders); for a non-object throw (`throw "disk full"`) it would render `undefined`. This matches the doc comment's stated precedent ("none of which type-guards a rejection either") and is pre-existing codebase style, not a defect this task introduces new severity into — Minor, not Important. | Optional: a narrow `isIpcError` guard at this one call site, falling back to a synthesized `{ kind: "internal", message: String(reason) }` for anything else, would close the `undefined`-message edge case without changing behavior for the common path. |

No Critical or Important findings.

## Checks performed (all pass)

- **`saveFlow` purity / one save in flight.** `saveFlow.ts:37-52` — a single
  closure-held `current: SaveFlowState`; `save()` is the only mutator, and
  since it's `async` with a single `await`, `state()` reads the latest
  value synchronously between calls. No timers, no internal effect, no
  hidden interval. Driven exclusively by explicit `save()` calls from
  `index.tsx`'s `handleSave`/`handleOverwrite` (button clicks), never from
  an effect.
- **Watch effect's dependency array unchanged.** `index.tsx`'s
  `watchWorkbook` effect (around line 157) still depends only on
  `[state.handle?.id]` — the diff adds an `isSelfWrite` call inside the
  callback reading `lastSavedHashRef.current`/`lastSavedAtMsRef.current`
  (refs, not effect dependencies) and `Date.now()` (no dependency needed).
  No function prop was added to the dependency array; the effect's own
  cleanup (`disposed = true`) is unchanged and still only guards against a
  stale subscription, not a self-cancel. Satisfies operating brief §4's
  tightened rule.
- **`based_on_hash` provenance.** `handleSave` (`index.tsx`) passes
  `state.hash` (Task 13's `WorkbookState.hash`, set only by
  `markdownReady`/`saveResult`) — never a fabricated value. Save is
  disabled (`saveUnavailable = state.hash === null || state.markdown ===
  null`) with an honest label ("save not available yet (read_workbook is
  not implemented)") while N1 is stubbed, matching the brief's explicit
  instruction not to guess a `based_on_hash`.
- **`isSelfWrite` semantics** (`saveFlow.ts:98-108`), each independently
  tested in `saveFlow.test.ts`:
  - missing `hash` (today's real wire shape, `WorkbookEvent` verified in
    both `app/src/ipc/workbook.ts` on `main` and in this worktree to still
    carry only `kind`/`cell_ids` — R67/L8w Task 4b not yet landed) ⇒
    `false` (reload) — matches R67's "unknown ⇒ reload" default, checked by
    reading the function body (not directly one of the 7 tests, since a
    real `WorkbookEvent` has no `hash` key at all under the current type,
    but the `undefined`-check at line 99 covers it structurally).
  - equal hash + within TTL ⇒ `true` — test "arriving right after our own
    save — is suppressed" (`hash: "h2"` vs `lastSavedHash: "h2"`, `nowMs -
    lastSavedAtMs = 200 <= 5000`).
  - mismatched hash ⇒ `false` — test "after an external edit... not
    suppressed."
  - equal hash, stale (`nowMs - lastSavedAtMs = 5001 > 5000`) ⇒ `false` —
    test "more than the TTL after our save."
  - Arithmetic re-derived by hand for each test case above; all three match
    the function's `<=`/`!==` branches exactly.
- **TTL is a named constant with units.** `index.tsx`:
  `SELF_WRITE_TTL_MS = 5000` with a doc comment stating it matches "C4 §4's
  stated expected-hash-set TTL (5 s)." Verified against C4 §4 / R67's text:
  5000 ms matches the ruling.
- **Is the TTL still needed once the hash is present?** Graded as asked:
  once L8w Task 4b lands `hash: string` as always-present on a genuine
  self-write event (per `brief-task4b.md`, the Rust watcher only ever
  builds a `WorkbookEvent` from a successful read whose bytes it just
  hashed, and the server-side `ExpectedHashSet` already suppresses true
  self-writes before an event is even built), the TTL's only remaining job
  is guarding against a **hash collision or reuse** case: if the *same*
  content is saved again later (e.g. undo back to a prior exact state, or a
  no-op re-save) `lastSavedHash` from an old save could equal a *new*,
  independently-arrived-at external edit's hash coincidentally producing
  the same bytes — vanishingly unlikely for sha256 but the TTL is what
  bounds how long a stale-but-equal `lastSavedHash` can wrongly suppress a
  later legitimate external event with the same content. A stale-but-equal
  hash *is* still verifiably the app's own content in the collision-free
  case, so the TTL is not needed to distinguish app-writes from external
  writes once hash comparison is authoritative — but it is cheap, already
  named/tested, and guards the reuse edge case, so keeping it is correct
  conservatism, not redundant work. This module's own doc comment already
  states the TTL "matches the server-side set's own expiry so this belt
  never outlives the primary one's own suppression window," which is the
  right framing.
- **`markdownReady` clears `conflict`.** `workbookState.ts` diff: the
  `markdownReady` reducer branch now sets `conflict: false` with a comment
  explaining a fresh read is either "Reload from disk" landing or the
  first open; `saveResult` also clears it. Both paths a successful
  save/reload could take are covered.
- **A second conflict during Overwrite's re-read/re-save window.**
  `handleOverwrite` (`index.tsx`) re-reads for a fresh hash, then calls
  `saveFlowRef.current.save(...)` with that hash; if that second save also
  rejects `conflict`, the same `dispatch({ type: "saveConflict" })` path
  fires and the banner stays visible for another attempt — no crash, no
  silent loss, no double-fire. Matches the brief's described flow exactly
  (it does not specify a second, separate confirmation dialog beyond the
  banner's own two buttons, so the single-click Overwrite matches scope).
- **`isSelfWrite`'s wire-shape honesty (R67/addendum).** Confirmed by
  reading `app/src/ipc/workbook.ts` in both this worktree and on `main`:
  `WorkbookEvent` still has only `kind`/`cell_ids`, no `hash`. The
  implementer's local `WorkbookEventWithHash extends WorkbookEvent` with
  `hash?: string`, plus the "missing hash ⇒ false" branch, is exactly the
  documented interim seam R67 calls for, and the CHANGELOG entry states
  this explicitly rather than burying it.
- **Non-conflict error leaves the document dirty.** `saveFlow.ts`'s
  `error` branch never touches `dirtyCellIds`; `index.tsx`'s `handleSave`
  only dispatches `"saveResult"` (which clears dirty) on `status ===
  "saved"`, never on `"error"`. Test "a rejection with kind io — surfaces
  an error and leaves the document dirty" asserts the returned state and
  documents (via comment) that `workbookState.ts` is untouched on this
  path — correctly scoped, since `saveFlow.ts` itself carries no dirty
  flag to assert against directly.
- **`ConflictBanner`'s `TODO(idl0)`** correctly formed and points at L11's
  per-cell merge, matching the brief's explicit instruction.
- **Ownership.** `git show --stat b851665` touches only
  `CHANGELOG.md` and five files under `Notebook/**` — exactly the brief's
  file list, no stray file, no `package.json`/`package.json` touch, no new
  npm dependency.
- **Merge commit `2f47651`.** `git show --stat` confirms it brings in
  `main`'s history (L8w tasks, L2 importers, other L6 tasks, no rust
  crate/`app/src-tauri` change originating in this lane); the CHANGELOG
  conflict was resolved by keeping both bullets (L2 importers' bullet and
  the lane's own prior bullets both present), matching the R19 pattern
  the operating brief specifies. No hand-edit to any other file in the
  merge commit.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  `git show --stat` confirms `git add` used explicit paths (matches the
  brief's listed `git add` command, no `-A`); nothing under `docs/`
  touched by `b851665` itself; no cargo invocation anywhere in this
  review.
- **Tests A/A/A, named per the brief.** All 7 `saveFlow.test.ts` names
  match the brief's Step-1 list verbatim; each has a blank-line-separated
  Arrange/Act/Assert (or Arrange/Act+Assert where the assertion is a
  single `expect` following the act, still separated). Each test's
  assertion is specific (exact object equality via `toEqual`, not a
  weaker truthy check) and would fail if its named rule broke — verified
  by inspection of each assertion against the described behavior.
- **Doc comments and units.** Every exported symbol in `saveFlow.ts` has a
  doc comment; `savedAtMs`/`nowMs`/`ttlMs` are each annotated "ms epoch" or
  "ms duration" per the brief's style instruction; `isSelfWrite`'s doc
  comment states explicitly that this is defence in depth, not the primary
  mechanism (C4 §4), matching CLAUDE.md §5 and the brief's explicit ask.
- **CHANGELOG accuracy.** The added bullet states the R44/C4 §4 rationale
  and explicitly flags the still-missing `WorkbookEvent.hash` field and
  the interim typed seam — matches what was actually implemented, no
  overclaim (it does not claim the Rust suppression is fixed by this task,
  correctly attributing that to the existing `ExpectedHashSet`).

## Verdict rationale

The implementation is correct and honest about its own limits: `saveFlow`
is a pure, single-save-in-flight state machine driven only by explicit
handlers; `based_on_hash` is always the real last-read hash with an honest
disabled state when none exists; the conflict/reload/overwrite flow handles
a second conflict in the overwrite window without losing data or crashing;
the frontend self-write belt is coded against the wire shape that actually
exists today (no hash field) rather than assuming the not-yet-landed R67
amendment, with the documented safe default of always reloading until L8w
Task 4b lands; the watch effect's dependency array is untouched and reads
mutable state only through refs, satisfying the operating brief's tightened
IPC-effect rule. The two Minor findings are a UX-copy gap (the reload
button doesn't say it discards local edits) and a pre-existing,
already-disclosed type-cast pattern at the rejection boundary — neither
changes behavior in the tested paths, neither is a spec deviation, and both
are cheap to address in a follow-up if the lead wants them addressed at
all. Gate reproduces the implementer's reported result exactly (150 passed
overall, 0 failed, including the 7 named `saveFlow` tests); `tsc` is clean;
`vite build` succeeds.

VERDICT: CLEAN
