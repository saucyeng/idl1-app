# Review: S1 Task 3 — `load_window_context` + `main_lap_window` fix

**Commits:** `ad1ff8f` (parent `3f97312`), worktree `idl-rs-worktrees/s1-window`.
**Files touched:** `core/src/math/eval.rs`, `tauri/src/session_source.rs`.

**Test command (reported, not rerun — Rust lane, static verification only):**
`cargo test -p idl-rs main_lap` — reported 5 passed.
`cargo test -p idl-rs-tauri load_window_context` — reported 3 passed.

Verified statically by reading the tests:
- `main_lap` substring matches exactly 5 `#[test]` fns: `eval.rs:2354`
  (`variance_time_main_lap_number_other_than_one_over_single_entry_bounds_still_gates`,
  new), `tests_parity.rs:299` (`parity_variance_time_nan_outside_main_lap_window`,
  pre-existing), `variance.rs:488` (`variance_time_nan_outside_main_lap`,
  pre-existing), `host.rs:334` and `host.rs:388` (pre-existing). Count matches.
- `load_window_context` substring matches exactly 3 `#[test]` fns at
  `session_source.rs:926/950/968`, all new. Count matches.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/math/eval.rs:2403-2406` | The regression test's comment claims index 9 is excluded because "the finite-difference heading fallback points backward and fails the projector's own heading match regardless of gating." That's not what the code does: `variance_time`'s gate (`core/src/variance.rs:49-57`) checks `t < start \|\| t >= end` and `continue`s to push `NaN` *before* any position/heading computation runs. With the test's window `(0.0, 5.0)`, index 9 (`t=9s`) is forced to `NaN` by the gate alone, independent of any heading defect. The stated reason is inaccurate, though harmless — it doesn't hide a second live defect at index 9, since the gate already produces the correct expected value there. | Fix the comment to say index 9 is simply covered by the same window gate as index 6, or drop the heading-fallback claim; no code change needed. |

No Critical or Important findings.

## Verification detail

1. **Fix genuinely fixes the stated defect, and the regression test proves it for the right reason.** Confirmed. Pre-fix, `main_lap_window` did `bounds.get((n-1))` unconditionally; with `main_lap_number = Some(3)` and a one-entry `main_lap_bounds`, `get(2)` on a length-1 vec misses and falls back to the `(0.0, 0.0)` sentinel. `variance_time`'s gate is `start < end` (`core/src/variance.rs:49`), so `(0.0, 0.0)` sets `gate = false`, disabling gating entirely — matches the reported pre-fix failure ("expected t=6s outside 0..5s window to be NaN, got 0": ungated, the identical main/overlay channel produces ~0, not NaN). Post-fix, the `(Some(_), [only]) => *only` arm reads the single bound directly regardless of `n`, correctly gating index 6 to `NaN`. This is a real, independently-verifiable defect and the new test isolates it correctly.

   Importantly, this bug is **not confined to the new S1 code** — `load_window_context` always sets `main_lap_number = Some(1)`, which never triggers the old bug on its own. The bug is live today in the pre-existing `load_lap_context`'s `selection = Some(lc)` branch (`tauri/src/session_source.rs:341-343`), which already builds a one-entry `main_lap_bounds` with the *real* selected lap number whenever `lc.main_lap = Some(n)`. So this is a genuine, currently-shipping defect for any main-lap selection other than lap 1, exactly as the plan's §1.7 predicted and directed fixing. Good catch, correctly scoped.

2. **Multi-entry indexing path untouched and correct.** The only other caller of `main_lap_window` is via `MathLapContext.main_lap_bounds`/`main_lap_number`, and the one live multi-entry producer is `load_lap_context`'s `selection = None` / `lc.main_lap = None` branches (`session_source.rs:322-324, 343`), which fill `main_lap_bounds` with every lap in `session.json`'s order and keep the file's own `main_lap_number`. The new `(Some(n), bounds) if bounds.len() != 1 => bounds.get(n-1)...` arm is byte-identical to the old single-arm logic for that case. Confirmed correct and unchanged in behaviour.

3. **`main_lap_number = Some(1)` for every span kind — no downstream reads it as identity.** Traced every non-test read of `main_lap_number` in `core`: `main_lap_window` (index/marker, fixed), and two `.is_none()` presence checks gating `variance_time`/`variance_dist` (`eval.rs:1208, 1243`) — both only test "is a main lap designated," unaffected by the value being always 1. `current_lap()` (`eval.rs:1085`) reads `main_lap_bounds` directly via `current_lap_at`, never `main_lap_number`. `host_laps` (`host.rs:162-170`) also reads only `main_lap_bounds`, numbering laps 1..N from the vec itself, not from `main_lap_number`. No label, lookup, or lap-relative axis anywhere reads `main_lap_number` as a real lap identity. Forcing `Some(1)` is safe.

4. **Layer discipline.** The `core` edit is a genuine bug in `core`'s own logic (a number-vs-index type confusion internal to `main_lap_window`), not policy or physics pushed down from the IPC layer — the fix would be needed even for the pre-existing `load_lap_context` caller with no `tauri`-layer changes at all. The plan (`runs/2026-09-07/s1-selection-plan.md` §3 Task 3, §1.7) explicitly directs fixing this exact line in the same commit and explicitly waives the cross-lane concern ("note the core edit in the commit message"), which the commit message does ("core: fix main_lap_window's number-as-index bug..."). Sanctioned cross-lane edit, correctly attributed.

5. **No `pub` signature changed in `core`.** `main_lap_window` remains a private `fn` (no `pub`) at `eval.rs:675`. The plan's conditional `cargo check -p idl-rs-cli --tests` requirement (triggered only if the reviewer disagrees it's private-only) does not apply — confirmed private, no such check needed.

6. **CLAUDE.md orders.** `load_window_context` has a full doc comment stating its contract, error semantics, and the `main_lap_number = Some(1)` invariant. Errors are the existing typed `IpcError` from `resolve_window` — no `Err(String)`. No `unwrap()` in production code (all `unwrap()`s in the diff are in `#[cfg(test)]` fixtures). No bare `// TODO`. Tests use Arrange/Act/Assert with blank lines and are named descriptively (snake_case, consistent with the rest of this file's existing test-naming convention — no literal em-dash names exist anywhere in this Rust codebase, so this is not a deviation). Diff is additive/surgical; the removed lines are exactly the old `main_lap_window` body, no unrelated reformatting. Commit message is a single line, correctly split by crate ("tauri: ...; core: ..."), no AI attribution trailer.

## Verdict rationale

The commit does exactly what the plan's Task 3 specifies: it adds `load_window_context` per the C1 §6.x window model and fixes the exact pre-identified defect in `main_lap_window` (plan §1.7), with a regression test that fails for the claimed reason and passes after the fix. The fix is more broadly load-bearing than the S1 window feature alone — it corrects an already-shipping gating bug in `load_lap_context`'s existing selection path. The multi-entry path is untouched and correct, `main_lap_number = Some(1)` is safe because nothing downstream reads it as identity, and the cross-lane `core` edit is explicitly plan-sanctioned and correctly attributed in the commit message. The one Minor finding is a documentation/comment inaccuracy in a test's inline reasoning that doesn't weaken the test's actual coverage or hide a real defect.

VERDICT: CLEAN
