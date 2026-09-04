# Review — Task 4: parser retains raw per-record timestamps; `t_us`/`t_recorded_us`/`source_kind`; ripple-fix the crate to compile

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Commit reviewed: `48c978a` ("store: parser retains raw per-record timestamps; t_us/t_recorded_us/source_kind wired end to end (IMU time still nominal-grid pending Task 6)")
Parent: `7b5da22` (Task 3, "store: Session/Channel mandatory-time model (C1 §2)" — reviewed clean).
Files touched (all `core/src/`): `export/csv.rs`, `export/fit/mod.rs`, `export/json.rs`, `export/mod.rs`,
`gps.rs`, `laps/detect.rs`, `math/resolve.rs`, `parse/records.rs`, `parse/v3.rs`, `scatter.rs`,
`session/handle.rs`, `session/synthesis.rs`, `table/eval.rs`, `tracks/detect.rs`, `variance.rs`,
`workbook/apply.rs` — matches `git show --stat 48c978a` exactly.

## Test commands run

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo build -p idl-rs 2>&1 | tail -30        → Finished `dev` profile [unoptimized + debuginfo], 0 errors
cargo test -p idl-rs 2>&1 | tail -60         → test result: ok. 581 passed; 0 failed; 1 ignored
```
The 1 ignored test is `clip_reconstruct::harness_tests::declip_tune_report` (pre-existing, unrelated
to this task — a dev tuning loop gated behind `IDL0_DECLIP_EVENTS`, `#[ignore]`d by design, not
introduced or touched by this commit).

Repo hygiene checks:
- `git log -1 --format=%B 48c978a` — no AI attribution trailer.
- `cargo fmt -p idl-rs -- --check` still reports diffs throughout the touched files at lines
  *other* than the ones this commit changed (e.g. `gps.rs:20/35/80/87`, `scatter.rs:105/185/221/366`,
  `variance.rs:130…620`) — confirms the crate remains un-rustfmt'd overall and this diff did not
  reformat anything; style was matched by hand, consistent with CLAUDE.md §7.
- `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` — `git status` clean, on `main`, untouched.

## Key claims verified

1. **`t_recorded_us` is `None` everywhere in this task's output.** Confirmed in every `Channel`
   literal built by this commit (`parse/v3.rs:198-199`, `session/handle.rs` `from_channels`,
   `session/synthesis.rs` Time/Distance pushes). Matches C1 §2's field doc ("`None` when
   `t_recorded_us` would be identical to `t_us`... every non-burst source") for GPS/generic
   sources, and is explicitly, correctly flagged as an interim placeholder for IMU sources pending
   Task 6 (comment at `parse/v3.rs:176-177`, matching the plan's own Step 2 text verbatim).

2. **IMU vs. GPS/generic `t_us` split.** IMU channels get the documented temporary grid-slot
   formula (`parse/v3.rs:173-182`, `(local_t0 - t0_us) + slot*period_us`), clearly commented as a
   Task-4 interim measure superseded by Task 6. GPS gets real per-fix `t_us` from `gps_ts` (raw
   `device_ts_us`, one push per fix). Generic `CHANNEL_SAMPLE` channels get real `t_us` from
   `channel_ts_us` (now pushed unconditionally, not just for event-driven channels). This correctly
   matches C1 §3.3 ("burst-seam correction applies only to burst-drained fixed-rate sources").

3. **`Time`/`Distance` synthesis now builds real `t_us`/`RawColumn::F64`.** `synthesis.rs` tracks
   the winning channel's index and clones its real `t_us` into `Time` (`t_us[i]/1e6` values,
   `RawColumn::F64`, not `Ramp`), and `Distance` shares `Time`'s `t_us` while keeping
   `RawColumn::Interp` structurally unchanged. This is a genuine, well-reasoned, documented
   departure required by C1 §3.5 invariant 4 (forbids deriving samples from `i/rate` once `t_us`
   isn't perfectly uniform) — see Finding 2 below for a real downstream consequence of this choice
   that is **not** flagged anywhere in this diff.

4. **Four pre-existing tests' expected values changed — verified by hand, not by trusting the
   diff's own comments:**
   - `event_channel_duration_spans_its_own_first_to_last_sample` (was
     `event_channel_duration_reflects_last_timestamp`), 1300→800 ms. `duration_ms()`
     (`session/mod.rs`, Task 3, already reviewed clean) is `(t_us.last() - t_us.first())/1000`.
     Fixture: IMU record at `1_000_000` (session-wide origin, since `origin.observe` fires on
     every record type), HR_RR records at `1_500_000/2_000_000/2_300_000` → `t_us =
     [500_000, 1_000_000, 1_300_000]`. `(1_300_000-500_000)/1000 = 800`. Matches.
   - `from_channels_runs_synthesis_and_reports_metadata`, 2000→1900 ms. `X` is 10 Hz × 20 samples;
     `input_channel`'s synthetic `t_us[i] = round(i·1e6/10)` → last sample at `t_us[19] =
     1_900_000` µs (not `20/10·1000=2000`, the old off-by-one "as if a 21st sample existed"
     formula). `1_900_000/1000 = 1900`. Matches.
   - `resident_bytes_counts_columns_times_and_math_store`, 200→240 bytes. Old formula only counted
     `sample_times_secs` bytes when `Some` (math entries had `None`): `E`=10×8+10×8=160,
     `M`=5×8+0=40 → 200. New formula counts `t_us` (+`t_recorded_us`, here always `None`→0) for
     *every* channel, including math entries (`Channel::from_f64` now always builds a synthetic
     `t_us`): `E`=10×8+10×8=160, `M`=5×8+5×8=80 → 240. Matches.
   - (Not separately called out in the task brief but same file/claim class, checked anyway)
     `resident_bytes_counts_t_us_alongside_every_column` (was
     `resident_bytes_lazy_columns_count_base_storage_only`), 64→256 bytes: `X`=8×8+8×8=128,
     synthesized `Time` (same length, now `F64`+`t_us` instead of zero-cost `Ramp`)=8×8+8×8=128 →
     256. Matches.
   - `gps_channel_values_clamps_to_nearest_past_channel_span` (was
     `gps_channel_values_nan_past_channel_span`): `nearest_by_rate`/`nearest_by_times` collapsing
     into one `nearest_by_t_us` (Step 4 of the plan, verbatim) changes fixed-rate out-of-range
     behaviour from `NaN` to clamp-to-nearest — an intentional, plan-directed unification (the
     plan explicitly says the new function should "mirror `nearest_by_times`'s existing
     partition-point logic exactly"), not a hidden regression.

   All four/five numeric changes are genuine, correct consequences of Task 3's already-reviewed
   struct/`duration_ms` redefinition and this task's own explicitly plan-directed function
   collapsing — none look like the expected value was quietly patched to hide a bug.

5. **`SessionHandle::from_bytes` computes a real SHA-256.** `session/handle.rs:206-214` uses
   `sha2::{Digest, Sha256}`, `hasher.update(bytes)`, `hasher.finalize()`, rendered via the
   pre-existing `to_hex` helper (`parse/records.rs:201`, a real byte→lowercase-hex renderer, not a
   placeholder). Not a stub. However, **no test exercises this path** — see Finding 3.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `core/src/parse/records.rs:279-323` (`parse_gps_record`) | `gps_ts.push(device_ts_us)` (line 287) runs *before* the seven fallible field reads (`latitude`…`satellites`, lines 294-300), while the corresponding `out.push(...)` calls for the 8 `GPS_*` channels only run after all seven succeed (lines 302-316). Contrast with `parse_channel`'s `channel_ts_us` push (`v3.rs:492-496`), which correctly runs *after* the fallible value read succeeds. On a `.idl0` buffer truncated mid-GPS-record (a real, already-supported recovery path — `parse_v3`'s own doc: "optional truncation warning, the buffer ended mid-record"), this leaves `gps_ts` with one more entry than every `GPS_*` column actually received, so `v3.rs:184`'s `t_us` build (`gps_ts.iter().map(|&ts| ts - t0_us).collect()`) produces `t_us.len() == column.len() + 1` for every GPS channel — a direct violation of C1 §2's mandatory invariant `t_us.len() == column.len()`. Does not panic today (`slice_channel_by_time`'s `materialize_range` clamps), but is a real, reachable, silent invariant break with no test coverage either way. | Move `gps_ts.push(device_ts_us)` down to just before/alongside the `out.push(...)` block (i.e., after all seven fallible reads succeed), mirroring `parse_channel`'s ordering. Add a truncated-mid-GPS-record test asserting every `GPS_*` channel's `t_us.len() == column.len()`. |
| Important | `core/src/session/synthesis.rs:23-45` (Time synthesis) vs. the (unexecuted) Task 9 plan draft, plan lines ~2424-2425/2595-2596/2612 | Task 4 correctly changes `Time`'s in-memory `RawColumn` from `Ramp` to `F64` (required by C1 §3.5 invariant 4, once `t_us` isn't perfectly uniform) — this part is right and well-documented. But the *already-drafted* Task 9 parquet writer in this same plan file excludes synthesized channels from `data.parquet` by matching `RawColumn::Ramp \| RawColumn::Interp`. After this change, `Time` is `RawColumn::F64`, so that filter will **silently stop excluding `Time`**, and Task 9 as currently drafted would write a `"Time"` column into `data.parquet`, directly violating C1 §4.1 ("`Time` and `Distance`... are **not** columns here — regenerated on read"). Nothing in this diff (no comment, no `// TODO(idl0):`, no note to the lead) flags this forward-compatibility break for whoever executes Task 9. `source_kind: "synthesized"` (set correctly on both `Time` and `Distance` by this same commit) is a trivial, already-available alternative filter key. | Add a comment in `synthesis.rs` (or better, update the Task 9 section of the plan document) directing Task 9's writer to exclude channels by `c.source_kind == "synthesized"` (or `channel_id`), not by `RawColumn` variant. |
| Minor | `core/src/session/handle.rs:202-214` (`SessionHandle::from_bytes`) | The new `blob_sha256 = sha256(bytes)` computation (a core C1 §2/§4.3 deliverable of this task) has no test anywhere in the diff or pre-existing suite. The only test touching `from_path` (`from_path_missing_file_is_io_error`) errors out before the hashing code ever runs. | Add a test constructing a small known `.idl0` buffer, calling `from_bytes`, and asserting `session.metadata()`/internal `session.blob_sha256` (may need a `#[cfg(test)]` accessor) equals a reference SHA-256 hex digest of that exact buffer, or at minimum is 64 lowercase hex chars and non-empty. |

No Critical findings.

## Verdict rationale

Task 4 is a faithful, line-for-line implementation of its own plan's Step 1–6 code blocks — every
mechanical rename (`sample_rate_hz`→`nominal_rate_hz`, `sample_times_secs`→`t_us`,
`device_id`/`config_checksum`→`Option`) and every non-mechanical piece (the IMU-interim/GPS-real
`t_us` split, `Time`/`Distance`'s real-`t_us` rewrite, `nearest_by_t_us`'s unification, the
`blob_sha256` wiring) traces directly back to explicit plan text, and the build/test commands
reproduce exactly as claimed (0 errors, 581/0/1). The four-plus numeric test-value changes were
independently re-derived by hand and are all genuine, correct consequences of Task 3's struct
redefinition and this task's own plan-directed logic — none hide a regression. The two Important
findings are both real, but neither blocks Task 4's own stated scope (parser/model wiring without
burst correction) or breaks anything currently exercised by the test suite: the GPS-truncation
length-mismatch needs a specific truncation boundary to trigger and doesn't panic today, and the
`Ramp`→`F64` filter break only matters once Task 9 is actually written. Both should be fixed before
Task 9 lands (the second one, especially, before Task 9 is even started, since it's a one-line plan
correction). Nothing here blocks Task 5/6 from proceeding.
