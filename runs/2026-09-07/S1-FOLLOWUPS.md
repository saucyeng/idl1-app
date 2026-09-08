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
