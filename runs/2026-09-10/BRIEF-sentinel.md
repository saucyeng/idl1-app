# Brief: replace the (0.0, 0.0) "no window" sentinel with an Option (R128 follow-up)

Rust only, idl-rs submodule. Worktree `idl-rs-worktrees/sentinel` (branch `sentinel`).
Rulings R126, R128, R130 in the superproject's `runs/2026-09-03/decisions.md`.

## Facts
`core/src/math/eval.rs`: `main_lap_window(&MathLapContext) -> (f64, f64)` returns the
exact pair `(0.0, 0.0)` to mean "no window selected, gate off"; `window_index_range`
(~line 751) special-cases that pair to yield the whole channel, and every other
`start >= end` yields the empty range (R128). R130 added validation so a corrupted lap
`(0.0, 0.0)` can no longer reach here, but the type still lets it. Callers of
`MathLapContext` live in `core/src/math/{eval,resolve,catalog,mod}.rs`,
`core/src/table/eval.rs`, `cli/src/main.rs`, and the tests in `tests_ahrs.rs`/`tests_parity.rs`.

## Do (rulings)
1. `main_lap_window` returns `Option<(f64, f64)>`: `None` = no window selected (gate off),
   `Some((s, e))` = a resolved window, which may be empty (`s >= e`). No sentinel value
   survives anywhere: grep for `(0.0, 0.0)` and `== 0.0 && ` in the maths path and remove
   each special case.
2. `window_index_range` takes the `Option` (or the context, your call) and keeps its exact
   R128 semantics: `None` -> `(0, len)`; `Some` with `s >= e` -> `(0, 0)`; otherwise the
   clamped range. Existing tests keep passing unchanged in meaning; rename the sentinel
   test to say `None`.
3. If any `pub` signature in `core` changes (it will), run `cargo check -p idl-rs-cli --tests`
   (CLAUDE.md §8) and fix `cli/src/main.rs` and the table evaluator.
4. Doc comments updated: the R128 comment block becomes a description of the `Option`.
5. Do NOT change any numeric result: this is a type change. Parity tests are the proof.

## Gate
`cargo test -p idl-rs math` (non-zero passed), `cargo check -p idl-rs-cli --tests`, then
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` and `cargo test -p idl-rs-tauri -- --test-threads=4`
green in one run each. No `--workspace`, no `-j`, no `cargo fmt`. Style matched by hand.
Merge `--no-ff` into the submodule's main from the main checkout, bump the submodule pointer
in the superproject with a plain commit, retire the worktree, delete the branch. No push.
No CHANGELOG in the submodule; one line in the superproject's CHANGELOG.md.
