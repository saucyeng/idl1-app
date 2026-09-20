# Brief: IMU time follow-ups to PR #1: resample(), raw recorded stamps, no shared tail pad (R240-R243)

Lean owner (Opus), Rust core + cli, spec-first for the contract text. Worktrees: Rust
`idl-rs-worktrees/imu-time`, app `../idl1-app-worktrees/imu-time` (spec text, generated docs,
CHANGELOG only; junction `app/node_modules`). The only Rust lane running (R235). Read CLAUDE.md
(section 8: >= 3 GB commit free before any cargo command, R245; gate on cargo's exit code; run
cargo in the FOREGROUND with a long timeout, never as a background task you then wait on: two
lanes stalled that way today), digest entries R240-R243 and the PR #1 entries,
`runs/2026-09-20/REVIEW-pr1.md` findings 1, 2, 3, 4, 5, the gaps draft spec
`docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md`, C1 sections 3.2, 3.3,
3.5, then `core/src/parse/records.rs` (`ImuGridPlan`, `slot_times_from_corrected`,
`rebuild_i64_grid_or_real`), `core/src/parse/v3.rs` (seam correction feeding the plan),
`core/src/math/eval.rs` (`combine_t_us`, `require_same_shape`, the `resample` NotImplemented
arm), `core/src/session/seam_correction.rs` + `tauri/src/commands/seams.rs` (read only).

## Do (commit after every task; task 1 first because the product's core expression is broken without it)
1. **`resample(x, onto)` (R242).** Linear interpolation of channel `x` onto channel `onto`'s
   per-sample time axis; output carries `onto`'s axis and rate; samples of `onto` that fall
   outside `x`'s span or inside one of `x`'s gaps are NaN/gap, never extrapolated or bridged;
   shape-polymorphic like its neighbours if `[lap]` shapes apply (say what you decided and why).
   Typed errors, no panics on empty or single-sample input. Builtin catalog entry with units
   and doc text; `docs/reference-src` prose restored to a working idiom (finding 3); the
   `where()`/elemwise rate error now names `resample()` as available. Tests include
   `[IMU1_AccelZ] - resample([IMU2_AccelZ], [IMU1_AccelZ])` on the synthetic 3-IMU fixture.
2. **Raw recorded stamps (R240).** `.idl0` IMU `t_recorded_us` holds the raw pre-correction
   device stamp (carry it through `v3.rs` into the plan beside `corrected_us`); gap slots keep
   today's fill rule. C1 section 3.2 text amended; `Channel` doc updated. Check what
   `fetch_seams_via` now receives on a real import shape and add a core test that feeds
   `seam_spans` an import-shaped channel (finding 2's collateral note). No tauri change unless
   that test proves one is needed: then escalate.
3. **No shared tail pad (R241).** Each IMU's grid ends at its own last real sample; drop the
   session-wide `target_len` tail (leading alignment: keep or drop by what C1 section 3.3 needs,
   and say which). `duration_ms` and the union axis must not exceed the last real stamp of any
   source: test on a fixture where one IMU stops early. C1 section 3.3 amended.
4. `IDL0_IMPORTER_VERSION` -> `0.3.0`. Regenerate `docs workbook`, `docs cli`, `docs wire`
   outputs in the same commits that change their sources (CLAUDE.md section 6).
5. **Measure before the library rebuild (R243).** Do NOT rebuild the library and do not write
   to `C:\Users\isaac\Documents\idl1-library`. Copy one large session's blob (pick the largest
   `.idl0`-sourced session; read-only access to the library) to a temp data dir, import it with
   the release-less debug CLI, and report: data.parquet size before/after (old size from the
   library), union-axis row count, import wall time, peak commit drop during import.
6. CHANGELOG `[docs]`; gaps draft spec statuses updated for what this lane implemented.

## Gates
Targeted filters per task; at merge: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`cargo check -p idl-rs-cli --tests`, `cargo test -p idl-rs-tauri --lib -- --test-threads=4`,
`cargo check -p app` from the app worktree's `app/src-tauri`; app tsc + vitest if any mirror or
generated JSON changed. One reviewer (sonnet), maths checked against the spec text. Do NOT
merge: stop with both branches committed and report (the lead merges). Never push. Lanes never
create branches or edit files in the main checkout (it holds another session's uncommitted
spec edit). Escalate with "ESCALATION:" + a proposal and do not proceed past it on that point.
Report 12 lines or fewer, including the task-5 measurements.
