# Task 9 review — `store/parquet.rs` (`data.parquet` read/write, C1 §4/§7)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch `wave1-l1-store`, commit `bc72b3e909a4c5ea1aa57d70b4dd8d62bf755f11`, on top of `153eeab`.

## Test commands and results (reproduced)

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo build -p idl-rs                     -> builds, 1 warning (deprecated set_max_row_group_size, see finding)
cargo test -p idl-rs store::parquet       -> 8 passed; 0 failed; 0 ignored
cargo test -p idl-rs                      -> 614 passed; 0 failed; 1 ignored (up from 593, consistent with earlier tasks in this session)
```

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: clean, on `main`, unaffected.
No AI attribution trailer on the commit (verified `git show --format=fuller -s`).
No `cargo fmt` reformatting — line width/formatting matches hand-formatted repo style (e.g. `store/atomic.rs`).
Tests use a synthetic in-memory fixture (`sample_session()`), no real `.idl0` file read — matches the plan's own split ("Task 9 (synthetic, all seven C1 §7 items) + Task 16 (the one real file)"), confirmed at plan line 5985.

## Verified independently (not just taking the diff's word for it)

- **`set_key_value_metadata` accumulate-vs-replace (plan's Open Question 15).** Checked the pinned
  `parquet-59.3.0` source directly (`~/.cargo/registry/.../parquet-59.3.0/src/file/properties.rs:812-815`):
  `pub fn set_key_value_metadata(mut self, value: Option<Vec<KeyValue>>) -> Self { self.key_value_metadata = value; self }`
  — confirmed **replaces**, does not accumulate. The implementer's fix (one `Vec<KeyValue>` built up
  front, one `.set_key_value_metadata(Some(all_kv))` call, `parquet.rs:299-313`) is correct and the
  claim in the commit's inline comment is accurate.
- **`set_max_row_group_size` deprecation.** Confirmed in the same pinned source
  (`properties.rs:741-746`): `#[deprecated(since = "58.0.0", note = "Use set_max_row_group_row_count instead")]`,
  and the deprecated method's body is exactly `self.max_row_group_row_count = Some(value); self` —
  i.e. it is a pure forwarding shim with **no functional difference** from the non-deprecated call.
  `cargo build -p idl-rs` reproduces exactly one warning, at `parquet.rs:309`, nothing else. This is
  genuinely just a deprecation warning, not a functional problem.
  **Recommendation: swap it now.** The spec text (C1 §4.4) literally quotes `set_max_row_group_size`,
  but that's illustrative API-shape text, not a pinned literal — the task's own opening note says "fix
  the call, not the schema/semantics" when the exact API has moved, and `since = "58.0.0"` means this
  already moved before 59.3.0 was pinned. Task 10 (`derived.rs`) is documented to reuse "`store/parquet`'s
  plumbing pattern" verbatim, so leaving the deprecated name in place now means it propagates into a
  second file before anyone circles back. One-line, zero-risk change:
  `.set_max_row_group_row_count(Some(ROW_GROUP_SIZE))`.
- **F64 -0.0/NaN and scale/offset bit-pattern tests.** Confirmed the tests do the right thing, not a
  naive `==`: `round_trip_f64_negative_zero_and_nan_preserved_bit_exact` uses
  `data[0].is_sign_negative() && data[0] == 0.0` (correctly distinguishes `-0.0` from `0.0`, which a
  bare `==` cannot) and `data[1].is_nan()`; `round_trip_scale_offset_metadata_bit_exact` uses
  `.to_bits()` comparison, not string/`==` comparison. Both are correct methodology.
- **`t_recorded_us` None-vs-Some round-trip — built a standalone verification crate** (outside the
  reviewed repo, in scratch space, depending on `idl-rs` core via `path =`) calling the public
  `write_session_parquet`/`read_session_parquet` directly on a GPS-only session whose `Channel.t_recorded_us`
  is `None` in memory (the documented common case — no burst correction ever applies to GPS, C1 §3.3).
  Output:
  ```
  original t_recorded_us: None
  round-tripped t_recorded_us: Some([0, 2500])
  ```
  This confirms finding #1 below empirically, not just by code reading.

## Findings

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/store/parquet.rs:449-509` (`read_column`) | `read_session_parquet` never collapses a reconstructed `t_recorded_us` back to `None` when it is element-wise identical to `t_us`, silently violating C1 §2's signed field contract for `Channel.t_recorded_us`: *"`None` when `t_recorded_us` would be identical to `t_us` (every non-burst source, §3.3 — no correction ever applies), so the common case costs nothing; `Some` only for a burst source whose correction actually diverged the two."* Because §4.1 mandates the `<source>_t_recorded_us` column exist for *every* enabled source regardless of correction, and `read_column` treats "column present and fully valid at this channel's rows" as sufficient to produce `Some(..)`, **every** channel from **every** non-IMU source (`gps`, `wheel_front/rear`, `pressure_front/rear`, `hr_bpm`, `hr_rr`) — plus any IMU channel from a session with no burst correction — comes back `Some(<duplicate of t_us>)` after a round trip, never `None`. Verified empirically (see above): a `Channel` written with `t_recorded_us: None` reads back `Some([0, 2500])`. This doubles that channel's timing-array memory versus the documented "costs nothing" design, and feeds directly into `SessionHandle::resident_bytes()` (`session/handle.rs:539`, design §15.3's byte-budgeted residency policy) — a real, described mechanism, not just a docs mismatch. None of the 8 tests catch this: `round_trip_recorded_stamps_bit_exact` only checks the GPS channel's *values* via `t_recorded_us_or_t_us()`, which is identical whether the field is `None` or `Some(identical values)`, and no test asserts `.is_none()`/`.is_some()` on any channel's `t_recorded_us` after a round trip. | In `read_column`, after building `t_recorded_us`, compare it to `t_us`; if equal element-for-element, return `None` instead of `Some(t_recorded_us)`. Add a test asserting the GPS (or any non-IMU) channel's `t_recorded_us` is `None` after round-trip, matching the pre-write value. |
| Minor | `core/src/store/parquet.rs:559-573` (`round_trip_recorded_stamps_bit_exact`) | The only test for C1 §7 guarantee #1 uses a fixture where the IMU channel's `t_recorded_us` is set identical to `t_us` (`sample_session()`, both `vec![0, 1250, 2500, 5000]`). Because the assertion goes through `t_recorded_us_or_t_us()` (which falls back to `t_us` whenever `t_recorded_us` is `None`), this test cannot distinguish "correctly read the dedicated `imu0_t_recorded_us` column" from "silently fell back to `t`" — a bug that swapped `t_col`/`recorded_col` in `read_column`'s `gather!` macro, or dropped the recorded-column lookup entirely, would not be caught. | Give the IMU fixture recorded stamps that diverge from `t_us` (e.g. simulate the burst-seam-corrected case where `t_us` has been shifted but `t_recorded_us` keeps the pre-correction values), and assert the read-back `t_recorded_us` (not just the accessor) equals the original divergent values. |
| Minor | `core/src/store/parquet.rs:308-313`, `:2661` (write) | `write_session_parquet` always calls `write_atomic(.., None)`, which (per `write_atomic`'s "`None` counts as differs from anything" semantics, confirmed in `store/atomic.rs:97-114`) hard-fails with `RenameConflict` if `data.parquet` already exists at the target path — i.e. this function cannot be called twice for the same session without the caller deleting the file first. This is the same pattern used at every other store-write call site in this plan (blob store, catalog, track, profile/settings all pass `None`), so it isn't unique to Task 9 and is not a regression introduced here, but no test in this file exercises C1 §4.3's stated "regeneration rule" (delete-and-rewrite on `importer_version`/`seam_correction_version` mismatch), so the delete-before-rewrite contract is untested at this layer. | No action required in Task 9 itself; flag for whichever task (12 catalog scan / 16 real-session validation) implements the regeneration rule, to confirm it deletes the old `data.parquet` before calling `write_session_parquet` again. |

## Spec-compliance checklist (C1 §4, column by column)

- §4.1 columns: `t` `Int64` non-nullable, sorted/unique via `BTreeSet` union — correct. `<source>_t_recorded_us` present only for real (non-synthesized) sources, nullable `Int64` — correct. Channel columns typed per `RawColumn` variant (`I16`→`Int16`, `I32`→`Int32`, `F32`→`Float32`, `F64`→`Float64`) — correct, matches §4.1's table exactly for every listed channel family. `Ramp`/`Interp` (`Time`/`Distance`) correctly excluded by `source_kind == "synthesized"`, not by `RawColumn` variant (the post-Task-4 fix, corroborated in `runs/2026-09-03/decisions.md:429-445`) — correct, with a defensive `Err` (not `unreachable!()`) if a synthesized-looking column ever has a non-`"synthesized"` `source_kind`, consistent with the file's existing internal-bug-as-typed-error convention (`row_indices_for`).
- §4.2 column metadata: `scale`/`offset` only on `I16`/`I32`/`F32` — correct. `nominal_rate_hz`/`unit`/`source_kind`/`channel_kind` always present — correct. `gaps` only when non-empty — correct. `<source>_t_recorded_us` columns carry only `source_kind` as their sole metadata key — correct, matches §4.2's table note.
- §4.3 file metadata: all seven always-present keys correct (`session_id`, `timestamp_utc_ms`, `blob_sha256`, `source_format` via `SourceFormat::as_str()` matching the exact `idl0`/`fit`/`gpx`/`csv` tokens, `importer_version`, `engine_version` via `crate::VERSION`, `seam_correction_version` via `SEAM_CORRECTION_VERSION = "v1"`); `device_id`/`config_checksum` correctly omitted (not empty-string) via `if let Some(..)`.
- §4.4 row groups: `set_max_row_group_size(1_000_000)` used verbatim per spec text (deprecated but functionally identical — see finding above); `t` encoded `DELTA_BINARY_PACKED`; `EnabledStatistics::Chunk` set on `t`. All correct; "every other column should also carry statistics" is explicitly "recommended, not required" by §4.4, and is not done here — acceptable.
- §4.5 nulls: standard Arrow/Parquet nullable encoding (no manual work needed); read rule (filter non-null, take `t` at those rows, compact `RawColumn`) implemented correctly in `read_column`, confirmed by the passing union-axis test.
- C1 §7's seven round-trip guarantees: all seven have a dedicated test, all pass, and the bit-pattern-sensitive ones (`scale`/`offset`, `nominal_rate_hz`, `-0.0`/`NaN`) use correct bit-level comparisons rather than naive `==`/string equality — verified above. Guarantee #1's test has a coverage gap (see Minor finding) despite passing.

## Verdict

**NEEDS-REWORK** — one Important, silently-shipped violation of C1 §2's signed `t_recorded_us`
contract (empirically confirmed: a `None`-valued field round-trips to `Some`), undetected by any of
the 8 passing tests; everything else in this task (schema, column/file metadata, row groups, the
`set_key_value_metadata` accumulation fix, and six of the seven C1 §7 bit-exactness guarantees) is
correct and independently verified against the pinned `parquet-59.3.0` source.
