# Review — `imu-time` lane (R240–R243, R246)

Read-only review, 2026-09-20. Nothing built, run via cargo, checked out, reverted or pushed.

**Commits reviewed:**
- idl-rs (`idl-rs-worktrees/imu-time`, branch `imu-time`), `git diff f03baf2..HEAD`:
  `518f871` resample(x, onto); `a15a91c` raw t_recorded_us (R240); `6402230` no shared
  tail pad (R241); `735e7fd` importer 0.3.0. Files: `core/src/math/catalog.rs`,
  `core/src/math/eval.rs`, `core/src/math/units.rs`, `core/src/parse/mod.rs`,
  `core/src/parse/records.rs`, `core/src/parse/v3.rs`, `core/src/session/mod.rs`,
  `core/src/synth/tests.rs`.
- app/docs (`idl1-app-worktrees/imu-time`, branch `imu-time`), `git diff 0949fc7..HEAD`,
  5 commits (`c1cdf50`, `c1fbed0`, `79e193b`, `7aba329`, `b23f436`). Files: `CHANGELOG.md`,
  `docs/WORKBOOK-REFERENCE.md`, `docs/reference-src/20-windows-and-laps.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
  `docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md`,
  `app/src/routes/pages/Notebook/model/functionCatalog.ts` (+ its test),
  `app/src/routes/pages/Notebook/model/mathMode.test.ts`.

**Test command (TypeScript lane portion — `functionCatalog.ts`/`mathMode.test.ts` changed):**
`npx tsc --noEmit` (app worktree) → clean, no output.
`npx vitest run src/routes/pages/Notebook/model/functionCatalog.test.ts src/routes/pages/Notebook/model/mathMode.test.ts`
→ **Test Files 2 passed (2), Tests 17 passed (17)**.
Rust: no cargo run (per rules); test logic verified by reading, not execution.

## Verified correct (no finding)

- `resample_onto` (`core/src/math/eval.rs`): the cursor/bracket walk is sound. Binary-search
  fallback (`partition_point`) only fires when the cursor has moved past `tt`, is a valid
  partition since `t_us` is strictly increasing (C1 §3.5 invariant 1), and cannot underflow
  since `tt >= first` is already guaranteed by the earlier bounds check. Exact-match targets
  resolve to `src_v[i]` exactly once (traced both the "cursor arrives exactly at k" and
  "binary search lands exactly at k" paths — no double interpolation, no off-by-one). The
  `i + 1 >= src_t.len()` branch correctly covers both the single-sample-`x` case and
  `tt == last`. Out-of-range targets are `NaN` without consuming a cursor step. NaN
  propagation is implicit (ordinary float arithmetic) and correct. Output axis/rate/length are
  copied verbatim from `onto` (`Arc::clone`, `onto.sample_rate_hz`, `onto.t_us.clone()`) — C2
  §3.6.2 rule 4 satisfied. `resample(ch, num)` (scalar 2nd arg) is a named `NotImplemented`,
  not a generic type error. `[lap]` operands are a typed `Type` error via the `axis` check
  before any array indexing. Catalog counts (69/6 → 70/5, `math_builtin_catalog_len_is_75`)
  and the app mirror's counts (66/6 → 67/5, total still 72) agree with each other and with
  the code.
- `core/src/parse/records.rs`: `raw`/`corrected` stay index-aligned end to end — `v3.rs`
  builds `corrected[i]` either as `imu_recorded_ts[i].clone()` (unreconciled, <2 samples) or
  as `correct_burst_seams(&imu_recorded_ts[i], ...).corrected_us` (same length as input), and
  both are fed into `ImuGridPlan::build_from_corrected` together. `rebuild_i64_grid_or_real`
  now takes `raw` in the `stamps` parameter while `gaps_received` still indexes the
  **received**-sample space of that same array — correct, since `raw` and `corrected` share
  that index space by construction. Leading pad, interior fill and (dead, but still exercised
  by the unit test `plan_gives_each_imu_its_own_length...`) tail-pad paths all place
  `slot_t_us[i]` as the placeholder correctly (traced the final backfill loop at line 816).
  `grid_len: [usize; 3]` replaces the single `target_len: usize` throughout `reconcile`,
  `build_spans`, `rebuild_i16` and `rebuild_i64_grid_or_real` call sites — no remaining call
  site still passes a session-wide max. Grepped `target_len`/`grid_len` across `core/src`:
  the only session-wide usage left is inside `rebuild_i16`/`build_spans`/
  `rebuild_i64_grid_or_real`'s own parameter (a `target_len` local, correctly fed per-IMU now).
- Consumers: `rust/tauri/src/commands/seams.rs` was not touched (per brief, correctly — no
  behavioural break was found that would require it) and its own new core-side coverage
  (`seam_spans_over_an_import_shaped_channel_finds_the_seams_the_correction_flattened`) now
  exercises the real import shape (raw `t_recorded_us` + corrected `t_us`), closing PR#1
  review finding 2's collateral gap, and shows the pre-R240 shape (`corrected` fed as both
  args) would have produced 15 spurious seams instead of 3 — a real regression test.
  `core/src/store/parquet.rs`'s round-trip null-collapse (`t_recorded_us != t_us` check) is
  generic over content and needs no change for R240's semantic shift. `duration_ms` (a max
  over channels of that channel's own `t_us` span) needed no change either; R241's fix lives
  entirely in `records.rs`, and the new `v3.rs` test
  (`an_imu_that_stops_early_does_not_stretch_the_session_past_its_last_real_stamp`) asserts
  the union axis and `duration_ms` directly.
- `t_recorded_us`'s new test (`v3.rs`) was honestly amended: it now checks the *exact* raw
  values (`raw_stamps.iter().map(|t| t - t0_us)`) against `t_recorded`, and asserts
  `assert_ne!(*t_recorded, ch.t_us)` — a real behavioural check, not the pre-existing
  "advances at the same spacing" tautology that would have passed either way.
- Doc/spec text (C1 §3.2, §3.3; C2 `resample` row, §3.6.2 rule 4, §3.8; CHANGELOG;
  `WORKBOOK-REFERENCE.md`; `reference-src/20-windows-and-laps.md`; the gaps DRAFT spec)
  matches the code's actual behaviour, including the R246 gap-limitation carve-out stated in
  the same places the ruling names (catalog entry, `resample_onto`'s doc comment, C2 row,
  gaps DRAFT P1-1, CHANGELOG).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `idl-rs` `core/src/synth/tests.rs`, `one_imu_minus_another_without_a_resample_is_a_typed_error_on_the_fixture` | The test's only assertion is inside `if let Err(e) = result { assert!(...) }` with no `else` branch. If the expression evaluated `Ok` on this run (e.g. the two IMUs happened to land on identical axes), the test would pass without ever exercising its named claim. CLAUDE.md §4 wants a test to assert what it claims; a name saying "is a typed error" should call `.unwrap_err()`, not tolerate silent success. | `let e = evaluate(...).unwrap_err(); assert!(e.message.contains("resample(x, onto)"));` — the companion test in the same commit already proves the two IMUs' axes differ on this fixture, so the error path is guaranteed to fire. |

No Critical or Important findings.

## R241 leading-pad reasoning (challenged as instructed, not the decision)

The doc's stated reason for keeping the leading pad — "bounded by the spread of the IMUs'
start instants (one FIFO drain, milliseconds)" — holds up: `leading[i]` is computed from
`t0` (earliest corrected first-sample across reconciled IMUs) minus `corrected[i][0]`,
divided by that IMU's own period, so its magnitude is mechanically bounded by how far apart
the IMUs' first bursts arrived, not by anything session-length-scale. Agreed.

## Pre-existing negative `t_us` minimum (~-1,280 µs on real data)

**Agree this is pre-existing**, not introduced by this lane. Cause, read from the code: the
session-wide origin `t0_us = origin.min_us` (`core/src/parse/v3.rs:196`) is the minimum of
the **raw** wire timestamps (`origin.observe(ts_us)` is called on the raw `ts_us` at
`v3.rs:405`, before burst correction). But `ImuGridPlan`'s per-IMU grid anchors each leading
pad at `t0` = the earliest **corrected** first-sample across the reconciled IMUs
(`build_from_corrected`'s own doc, unchanged in substance by this lane). `correct_burst_seams`
re-spaces burst 0 backward from its own last raw sample using `effective_period_us` — the
*measured* inter-burst period, not the nominal one — so if the true ODR period is longer than
nominal, burst 0's corrected first sample can land **earlier** than its own raw first sample,
and thus earlier than `origin.min_us` (which only ever saw raw values). Subtracting the raw
`t0_us` from that corrected time then yields a small negative `t`. This mechanism was
introduced by the `0.2.0` (P0-1) corrected-stamp change, not by this lane's `0.3.0` follow-up,
and the diff here does not touch `TimeOrigin`, `origin.observe`, or the corrected/raw split at
burst 0. Out of this lane's scope, confirmed.

## Verdict rationale

The maths (`resample_onto`), the raw/corrected index alignment and per-IMU grid length
(`records.rs`, `v3.rs`), the consumers checked, and the doc/spec/CHANGELOG text all hold up
under a line-by-line read against C1 §3.2/§3.3, C2 §3.6.2 rule 4, and rulings R240/R241/
R242/R243/R246. The catalog and mirror counts are internally consistent and match. The single
finding is a Minor test-quality nit (a conditional assertion that can't fail even though the
adjacent evidence makes the condition it depends on always true in practice) — it does not
indicate a wrong result, only a slightly weaker-than-claimed regression guard. TypeScript gate
(tsc + the two changed vitest files) ran clean with a non-zero passed count.

VERDICT: CLEAN
