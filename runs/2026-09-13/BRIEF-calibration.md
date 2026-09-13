# Brief: rigid-body calibration, core maths validated on the synthetic body (M6.3, R192)

Lean owner, Rust core + cli, spec-first: lift `docs/superpowers/specs/2026-09-10-idl1-rigid-body-
calibration-DRAFT.md` (all seven of its recommendations adopted by R192) into a non-draft spec as
the first commit, amended only where the code proves it wrong. Worktrees: Rust `idl-rs-worktrees/
calibration`, app `../idl1-app-worktrees/calibration` (spec text + `ipc` mirror only if a command
lands). Read CLAUDE.md (§8; R235 only Rust lane; memory gates 4 GB core/cli, 6 GB tauri/app),
rulings R190, R192, R233; the draft; the existing `core/src/calibration.rs` (gravity-only, keep or
absorb); the synthetic generator (`core/src/synth/*`, C1 §9, the truth file's extrinsics);
`nalgebra` usage in core; C1 profiles/setup sheet fields; the CLI table (R230; `calibrate` needs a
ruling: **granted**, under the `session` noun: `session calibrate <file> [--truth <json>]`).

## Do (commit after every task)
1. **Model + solver in core** (`core/src/calibration/rigid.rs`): two bodies joined by a
   one-DoF steering hinge; per-sensor rotation, lever arm, gyro bias, accel bias; Wahba/Kabsch
   initialisation from gyro streams, then Levenberg-Marquardt in nalgebra over the residuals the
   draft §1 defines; hinge axis from the bar-turn segment; excitation gate (§3) with the typed
   "motion not rich enough" outcome; rest-only as the degenerate case (§4). No new crate.
2. **Validation against the synthetic body**: generate sessions with `session synth` covering
   the draft §5 protocol (figure-8, roll, pitch, yaw, bar turn; noise and biases on), run the
   solver, compare to `truth.json`; acceptance thresholds from the draft §5 (degrees, mm) and
   their justification; tests that fail if the solver regresses past them. If the generator
   lacks a motion the protocol needs (bar-turn hinge motion, suspension topped out), add it to
   the generator (`--protocol calibration`) rather than weakening the test.
3. **Output record** (draft §6): the `calibration.*` reserved namespace values with units and
   `authored` vs `measured` flags, written as a JSON record the setup sheet can hold (C1 amend
   for the record shape; no UI here).
4. **CLI** `session calibrate <file> [--truth <json>] --json` printing the record, residuals,
   excitation diagnostics and, with `--truth`, the error against ground truth; C6 row; regenerate
   `docs cli` outputs.
5. Spec file renamed without `-DRAFT`, C6/C1 text, CHANGELOG `[docs]`.

## Gates
Targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `cargo check
-p idl-rs-cli --tests`; app tsc/vitest only if a mirror changed. One reviewer (sonnet), with the
maths checked against the spec's equations. Merge both repos (main into branch first, --no-ff),
submodule bump, retire in the R171 order with the tightened check. Contract text in the app
worktree. Lanes never create branches or edit files in the main checkout. Never push. Report
12 lines or fewer, including the achieved accuracy numbers.
