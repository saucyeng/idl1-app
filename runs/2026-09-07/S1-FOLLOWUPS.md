# S1 lane — queued minors (fold into the next Rust dispatch)

- **From review-s1-task3 (Minor, `core/src/math/eval.rs:2403-2406`).** The
  regression test's comment claims index 9 is excluded because "the
  finite-difference heading fallback points backward and fails the
  projector's own heading match regardless of gating". That is not what the
  code does: `variance_time`'s gate (`core/src/variance.rs:49-57`) checks
  `t < start || t >= end` and `continue`s to push `NaN` *before* any
  position or heading computation runs, so index 9 (`t=9s`) is `NaN` from
  the window gate alone. No code change; correct the comment to say index 9
  is covered by the same gate as index 6, or drop the heading claim. A wrong
  explanation in a test misleads the next reader more than no explanation.

- **Per-session evaluation cache (R125).** Not in S1. Key on
  `(session_id, definition, workbook revision)`, no window in the key.
  Trigger: the lap-time table / per-lap columns.

- **Replace the `(0.0, 0.0)` gating-off sentinel with an `Option` (R128.3).**
  "No window selected" and "a window from 0.0 to 0.0" are currently the same
  value; that conflation produced the R128 defect and will produce another.

- **FFT cell-shape check uses the primary window only (R132).** A channel
  present only in a non-primary window's session is missed. Needs two
  windows over different sessions with different channel sets; lap-to-lap
  within one session is unaffected.

## MUST FIX BEFORE THE S1 MERGE

- **Non-primary windows can permanently miss their data** (review of Task
  11a/11b, Important). Both IPC-driving effects in `Notebook/index.tsx` read
  the whole `sessionDetailsByWindow` map, but their dependency arrays carry
  only `sessionDetail` (the **primary** window's entry) and
  `windowsKeyValue`. `sessionSpanDriver` resolves each window's
  `SessionDetail` independently and asynchronously with no ordering
  guarantee, so when a non-primary window's detail arrives *after* the
  primary's, neither dep has changed and neither effect re-runs. A later
  unrelated re-run does not help: `bindingIdentity`/`perWindowIdentity` for
  the primary window is unchanged, so the identity check short-circuits
  before that window's data is read. Net effect: on an ordinary two-lap
  selection, a window can silently never get its channel data or spectrum,
  with no error and no recovery short of reselecting — defeating exactly
  the feature Tasks 11a/11b exist to deliver.
  **Fix:** add a stable dependency that changes whenever *any* selected
  window's `SessionDetail` resolves — a derived readiness string over
  `windows.map(w => sessionDetailsByWindow.has(windowKey(w)))`, or a
  monotonic sequence bumped with the map — and include it in both effects'
  dependency arrays. Operating brief §4: deps are stable *strings*, never
  object identity; the primary window's identity is not a proxy for the
  selection's readiness.
  Not catchable by the current gate — `channelBindDriver.test.ts` and
  `fftDriver.test.ts` are pure-driver tests, not effect tests.

- **Minor, `NotebookSession.ts:52`:** the doc comment says the channel-bind
  effects gate on `windows.length <= 1` per R131. Task 11b removed that
  gate; what actually stays single-window is `BoundChannel`'s own
  rebuild-replay registration. Substance correct, stated reason stale.
