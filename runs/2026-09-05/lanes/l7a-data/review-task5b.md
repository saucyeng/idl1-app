# L7a Task 5 re-review — import driver fix (review-task5b)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`, commit under review `3a9e8448c4b24a13cf3d3cfb46829a34826adb20`
("app: Data tab fix import driver race (review-task5)"), a fix-up on top of
`review-task5.md`'s findings. In scope: the 7 files in that commit's diff
(`CHANGELOG.md`, `FilePicker.test.ts`, `ImportPanel.tsx`, `importDriver.ts`/
`.test.ts` (new), `importQueue.ts`/`.test.ts`). A Task 7 implementer may
commit on top of this in the worktree during review; not reviewed here (no
such commit was present at review time — `git log` showed this as `HEAD`).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Data
```

`tsc --noEmit` printed nothing (clean). Vitest:

```
 Test Files  12 passed (12)
      Tests  83 passed (83)
```

Reproduces the implementer's reported 83 passed exactly, non-zero count, gate met.

## Findings

No Critical or Important findings. Both prior findings from `review-task5.md`
are fixed correctly and completely:

- **Critical (self-cancelling effect):** fixed. `ImportPanel.tsx`'s driving
  effect (`ImportPanel.tsx:89-100`) now depends on `[state, onImported]` but
  installs no cleanup at all — `runImport` (`importDriver.ts:44-56`) is a
  fire-and-forget call with no `cancelled` flag, so a re-run of the effect
  (triggered by the very `START`/`PROGRESS`/`SUCCEEDED`/`FAILED` dispatches
  the in-flight call produces) can no longer tear down the promise chain
  that's still running. Re-entrancy is guarded correctly and cheaply instead:
  `nextItemToStart` (`importDriver.ts:20-23`) returns `null` whenever any item
  is already `"running"`, so every extra effect invocation while an import is
  in flight is a true no-op. Traced by hand: ENQUEUE → effect finds a queued
  item → `runImport` dispatches `START` → state changes → effect reruns →
  `nextItemToStart` now sees a running item → returns null → no second
  `runImport` call. Every `PROGRESS` dispatch during the run reruns the
  effect the same way and is like`wise` absorbed by the running-item check.
  On `SUCCEEDED`/`FAILED`, the item becomes terminal, the effect reruns,
  finds the next `"queued"` item (if any) and starts it, or (if none) checks
  `isDrained` and fires `onImported` exactly once via the
  `drainedAtLengthRef` length-change guard — unchanged, correct logic from
  the original implementation. `importDriver.test.ts`'s three
  `runImport`/`describe` blocks (`nextItemToStart`, `isDrained`, `runImport`)
  exercise this directly.
- **Important (stale index survives DISMISS):** fixed. Every `ImportItem` now
  carries a monotonic `id` (`ImportQueueState.nextId`, `importQueue.ts:49-55`)
  assigned once at `ENQUEUE` and never reused (no action decrements or reuses
  `nextId`; `DISMISS` only filters `items`, `importQueue.ts:123-132`). Every
  other action (`START`/`PROGRESS`/`SUCCEEDED`/`FAILED`) addresses its item by
  `id` through `mapById` (`importQueue.ts:140-142`), which is immune to array
  shrinkage. `runImport`'s closures (`importDriver.ts:44-56`) capture
  `item.id`, not an index, so a `DISMISS` of any other item mid-flight cannot
  misroute or drop the running item's updates.
  `importDriver.test.ts`'s "a DISMISS of a different, terminal item happens
  mid-flight" test and `importQueue.test.ts`'s "DISMISS an earlier item
  shrinks the array" test both exercise exactly this scenario and assert the
  surviving item's `id`, `phase`, and `done` land correctly.

Additional checks from this task's dispatch, all pass:

- **Dependency array vs. dispatches, retraced by hand** (see above) — no
  remaining self-cancellation or missed-restart path found.
- **Decision logic lives in a pure, unit-tested driver module** per the
  operating brief's new §4 rule: `nextItemToStart`/`isDrained`/`runImport`
  are pure functions in `importDriver.ts` taking an injected `ImportFileFn`;
  `ImportPanel.tsx`'s effect only calls them, matching the added standing
  rule exactly.
- **Unmount mid-import:** no `isMounted`/cancellation guard exists in
  `runImport`, so a component unmount while an item is `"running"` lets the
  promise chain's later `dispatch` calls fire into a reducer whose owning
  component has unmounted. This is not a live problem here: this project is
  on React 19 (`app/package.json`'s `"react": "^19.2.8"`), and React 18+
  removed the "Can't perform a React state update on an unmounted component"
  warning and made such a call a harmless no-op (React's fiber reconciler
  discards the update once the fiber is unmounted, no throw). No test covers
  this explicitly, but none is warranted — there is no defect to catch, and
  CLAUDE.md forbids rendering tests, which is what exercising an actual
  unmount would require.
- **DISMISS of a genuinely running item:** the reducer refuses removal for
  `"queued"`/`"running"` status (`importQueue.ts:123-132`), so an item can
  only ever be dismissed after it is already terminal — at which point
  `runImport`'s promise for that item has already settled and dispatched its
  terminal action; no further dispatch for that `id` can occur afterward.
  The "unknown id" branch of `mapById` (a no-op when `id` no longer names any
  item, `importQueue.ts:140-142`) is therefore defensive rather than a live
  path under the current wiring, and is documented as such
  (`importQueue.ts:136-139`'s doc comment: "e.g. a stale dispatch racing a
  dismiss"). Not a defect — a `DISMISS` on a running item is a no-op in the
  UI, verified by `importQueue.test.ts`'s "DISMISS a failed item — removed; a
  running item — refused" test (`importQueue.test.ts:115-132`).
- **Stale-response coverage:** `importQueue.test.ts`'s "PROGRESS for an item
  already done — ignored, no state change" test (`importQueue.test.ts:100-113`)
  covers a late/stale `PROGRESS` after the item already reached a terminal
  status, matching the reducer's own guard
  (`if (item.status !== "running") return item;`, `importQueue.ts:96`).
- **Ids are monotonic and never reused after dismiss:** `ENQUEUE` always uses
  `state.nextId` and increments it (`importQueue.ts:75-86`); no action ever
  decrements `nextId` or reassigns an existing item's `id`; `DISMISS` only
  removes from `items`, never touches `nextId`. Confirmed by reading every
  case arm in `importQueueReducer`.
- **`runImport` routes by id, proven by the dismiss-mid-flight test:**
  `importDriver.test.ts`'s "a DISMISS of a different, terminal item happens
  mid-flight" test (`importDriver.test.ts:142-173`) starts item B, dismisses
  terminal item A (shrinking the array to length 1), delivers a `PROGRESS`
  and then resolves B, and asserts the surviving item is B with the correct
  `done`/`status` — this is a real assertion on the property under test (it
  would fail under the pre-fix index-addressed scheme, since B's captured
  index `1` would become stale/out-of-range once A was removed).
- **Non-`IpcError` rejection still yields an honest FAILED text:** unchanged
  from the prior review — `describeIpcError`'s fallback path is untouched by
  this commit and was already verified in `review-task5.md`.
- **Test names and AAA:** all new/changed tests in `importDriver.test.ts` and
  `importQueue.test.ts` use the literal `thing — condition — result` em-dash
  form and separate Arrange/Act from Assert with a blank line. The prior
  Minor in `FilePicker.test.ts` (inlined asserts, no blank line) is fixed —
  the two `expect` calls are now preceded by a blank line after the Act
  step (`FilePicker.test.ts:10-16`).
- **The `never`-narrowing workaround in the tests:** no such workaround is
  present in this diff. `ImportQueueAction`'s cases are exhaustively handled
  by the switch in `importQueueReducer` (TypeScript's control-flow narrowing
  already makes every arm's `action.<field>` access type-safe without a
  `never` cast anywhere in `importQueue.ts` or `importDriver.ts`); `tsc
  --noEmit` ran clean, confirming no suppressions were needed. (If the
  dispatch's mention of a "`never`-narrowing workaround" refers to something
  in a different file not touched by this commit, it was not found here —
  flagging in case this points at something outside this diff's scope.)
- **CHANGELOG sentence accurate:** the new "Fixup (review-task5)" sentence
  appended to the existing Import bullet (`CHANGELOG.md:9`... this diff's
  changed line) accurately describes both the original bug (cleanup
  cancelling in-flight imports, stale index under `DISMISS`) and the fix
  (stable `id`, `importDriver.ts`'s pure functions, no cancellation flag) —
  matches the code exactly, no overclaiming.
- **Ownership boundary:** `git show --stat 3a9e844` — every path is under
  `app/src/routes/pages/Data/**` or `CHANGELOG.md`; no lead-owned file
  touched; no `app/src-tauri/`, `App.tsx`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts` change; no new
  npm dependency; no `cargo`/`npm run tauri` anywhere in the diff.
- **Repo hygiene:** commit message is a single line, no AI attribution
  trailer.

## Verdict rationale

Both findings from the original review are fixed at the root cause, not
patched around: the driving effect no longer ties "am I still babysitting
this import" to state it itself mutates, moving that decision into a pure,
independently-tested driver module exactly as the operating brief's new
IPC-effects rule demands, and every action now addresses its item by a
stable, monotonic id that survives array shrinkage from `DISMISS`. Hand
tracing the effect's re-entrancy through every dispatch type confirms no
second `runImport` call and no dropped/misrouted terminal update. Test
coverage for both the original bugs and the fix's own edge cases (stale
`PROGRESS`, dismiss-while-another-runs, dismiss-refused-while-running) is
present and each test asserts on the specific property that would fail if
the old bug reappeared. No new issues were introduced, and the gate
reproduces the implementer's reported count exactly.

VERDICT: CLEAN
