# Review — Task 12: `store/catalog.rs` — SQLite catalog and rebuild (C4 §5)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch: `wave1-l1-store`, commit under review: `fa522c1` (on top of `dae798d`).
Scope: `git show fa522c1 --stat` — `core/src/store/catalog.rs` (new, 749 lines),
`core/src/store/mod.rs` (+1: `pub mod catalog;`), `core/src/track_artifact/model.rs` (+12),
`core/src/track_artifact/read.rs` (+15). This task deviated substantially from the plan's
literal Step 2 draft; review focuses on verifying those deviations, not just re-confirming tests.

## Test commands and results

```
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::catalog
```
```
running 8 tests
test store::catalog::tests::rebuild_catalog_on_an_empty_tree_produces_an_empty_report_not_an_error ... ok
test store::catalog::tests::open_catalog_creates_file_and_applies_pragmas ... ok
test store::catalog::tests::rebuild_catalog_session_json_without_a_data_parquet_yet_is_not_indexed_or_reported ... ok
test store::catalog::tests::rebuild_catalog_tracks_row_carries_the_wire_created_and_updated_at_ms ... ok
test store::catalog::tests::rebuild_catalog_session_with_laps_but_no_derived_dir_indexes_no_lap_summary ... ok
test store::catalog::tests::rebuild_catalog_skips_a_malformed_session_json_without_aborting_the_scan ... ok
test store::catalog::tests::rebuild_catalog_indexes_a_blob_and_a_session ... ok
test store::catalog::tests::rebuild_catalog_indexes_lap_summary_min_max_mean_within_the_lap_window ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 628 filtered out; finished in 15.94s
```
Reproduced: 8/8 pass.

```
cargo test -p idl-rs
```
```
test result: FAILED. 634 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 280.89s
failures:
    store::atomic::tests::write_atomic_exhausts_rename_retries_and_surfaces_io_error_when_the_sharing_violation_outlasts_the_retry_window
```
Reproduced exactly: 634/1. Commit `fa522c1`'s diff touches only `catalog.rs`, `store/mod.rs`,
`track_artifact/model.rs`, `track_artifact/read.rs` — `store/atomic.rs` is untouched by this
task, so the flake is structurally guaranteed pre-existing and unrelated (a Windows
sharing-violation timing test); confirmed, not re-litigated further.

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: clean, on `main`.
Commit message: single line, no AI attribution trailer. No `cargo fmt` churn observed (DDL/style
matches hand-formatted repo convention).

## Priority 1 — plan's literal draft would break (verified true)

Confirmed independently, two ways:

1. **Direct SQLite semantics check** (Python `sqlite3`, `PRAGMA foreign_keys=ON`, `INSERT OR
   IGNORE` against a table with `blob_sha256 TEXT NOT NULL REFERENCES blobs(sha256)` and no
   matching row) raises `IntegrityError: FOREIGN KEY constraint failed`. This confirms **`INSERT
   OR IGNORE` does not suppress a foreign-key violation** — SQLite always applies ABORT semantics
   to FK constraints regardless of the statement's own conflict-resolution clause. The plan's
   literal Step 2 draft (`VALUES (?1,'','idl0',NULL,NULL,'','','',0,0,...)`, hardcoding
   `blob_sha256=''`) would therefore fail every single session insert under the DDL's own
   `REFERENCES blobs(sha256)` constraint, since `open_catalog` turns `foreign_keys` on for every
   connection including the plan's own draft. `source_format='idl0'` and the other empty-string
   literals do *not* independently violate the `CHECK`/`NOT NULL` constraints (empty string
   satisfies `NOT NULL`, and `'idl0'` is in the `CHECK` set) — the FK on `blob_sha256` is the one
   fatal literal.
2. The fix — reading `blob_sha256`/`source_format`/`importer_version`/`seam_correction_version`/
   `engine_version`/`timestamp_utc_ms`/`device_id`/`config_checksum` from `data.parquet`'s
   file-level key-value metadata (`read_data_parquet_session_fields`) — reads exactly the 8 keys
   C1 §4.3 defines, with exactly matching required/optional-ness (`device_id`/`config_checksum`
   optional, everything else required). Cross-checked key-for-key against
   `store::parquet::file_metadata` (the writer, `core/src/store/parquet.rs:209-225`): every key
   name matches verbatim. This is exactly the mechanism C4 §5 step 3 itself describes ("the
   `REFERENCES` constraint would reject it anyway under `PRAGMA foreign_keys = ON`") — a session
   whose blob truly is missing still gets rejected by the same FK constraint and lands in
   `report.skipped`, not silently indexed. Verified this path is *logically* sound (SQLite FK
   check above), but **no test in this task exercises it** (see Minor finding below) — every test
   session's blob is written via the new `write_full_session` helper before rebuild.

Priority 1 claim: **confirmed true and the fix is correct.**

## Priority 2 — DDL, PRAGMAs, scan order, transient/missing-blob handling

- **DDL**: diffed byte-for-byte (SQL comments stripped) against C4 §5's DDL block — identical,
  all 6 tables, all indexes, all constraints (`CHECK`, `REFERENCES ... ON DELETE
  RESTRICT/CASCADE/SET NULL`, composite `PRIMARY KEY`s).
- **PRAGMAs**: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`
  applied on every `open_catalog` call, per-connection as required (SQLite does not persist
  `foreign_keys`). Matches C4 §5 exactly.
- **`user_version`**: set to `CATALOG_SCHEMA_VERSION=1` in `create_schema`, tested. Note: this
  task implements only the two primitives (`open_catalog`, `rebuild_catalog`) the plan's own
  Interfaces section names; the caller-side "on open, if `user_version` mismatches, delete and
  rebuild" *orchestration* is not implemented here. This is consistent with the plan's own scope
  (Task 12 "Produces" lists exactly these two functions, "Consumed by Task 15's CLI"), not a gap
  introduced by this task — flagging only so it isn't mistaken for done.
- **Scan order**: blobs → tracks → sessions(+laps+lap_summary inline) → workbooks(no-op) →
  schema-version(already set) — matches C4 §5's 1–7 list and its FK dependency order exactly.
- **Transient sessions** (`session.json` present, no `data.parquet` yet): skipped, not reported —
  confirmed by test `rebuild_catalog_session_json_without_a_data_parquet_yet_is_not_indexed_or_reported`
  (`sessions_indexed=0`, `skipped` empty). Matches C4 §2's "valid transient state... does not
  treat this as corruption."
- **Missing-blob session**: mechanism verified sound (Priority 1, above) but **not exercised by
  any test** in this task (Minor finding below).

## Priority 3 — the two scope extensions

- **`lap_summary`**: `index_lap_summary` computes `(min,max,mean)` per `(lap, channel)` over each
  `derived/<hash>.parquet`, converting `session.json`'s epoch-ms lap boundaries to the derived
  file's session-relative-µs axis via the session's own `timestamp_utc_ms` (from `data.parquet`'s
  file metadata) — verified against `t_us / 1e6 = *_time_secs` convention (C1 §6). Test
  `rebuild_catalog_indexes_lap_summary_min_max_mean_within_the_lap_window` hand-verifies min/max/
  mean over a 2-of-3-sample window with an inclusive boundary at the lap end — correct per the
  worked arithmetic. `rebuild_catalog_session_with_laps_but_no_derived_dir_indexes_no_lap_summary`
  confirms the no-`derived/`-yet case is silent, not reported, matching C4 §5.
  One caveat on "streaming reduce": `read_derived_channels` calls
  `reader.collect::<Result<Vec<_>,_>>()` then `arrow::compute::concat_batches`, materializing the
  **entire** derived file's `t`/channel columns into memory before folding, rather than folding
  row-group-by-row-group the way `channel_min_max` (`session/handle.rs:619`) folds over a raw
  column without building an intermediate f64 vector. For a single per-session derived file this
  is not a practical problem, but it is not literally "the same class of operation... no full
  materialization" C4 §5 step 5 and C1's cross-reference describe — see Minor finding below.
- **`Track.created_at_ms`/`updated_at_ms`**: additive fields on the public `Track` struct
  (`model.rs:27-32`), sourced from new `#[serde(default)]` fields on the private `TrackDto`
  (defaults to `0` for old-shape JSON missing the keys — verified: `missing_lap_timing_is_none`
  and other pre-existing `read.rs` tests use JSON without these keys and still pass unchanged).
  New round-trip test `parse_track_wire_created_and_updated_at_ms_are_carried_into_domain_track`
  uses distinct values (1000/2000) to catch a field swap. Clean, backward-compatible, correctly
  closes open question 10.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/store/catalog.rs:279` | `sessions.duration_ms` is computed as `doc.laps.iter().map(\|l\| l.end_timestamp_ms).max()` — an **absolute Unix-epoch millisecond value** (e.g. ~1.76e12), not a duration. C3's `SessionSummary.duration_ms` doc comment (`idl1-c3-ipc-surface.md:224`) states this field was "RENAMED from `duration_s`" (session length in seconds) — i.e. it must be a small elapsed-time value. This bug is inherited verbatim from the plan's own Step 2 draft (same formula, line 4049) and was not caught or flagged by this task despite fixing two sibling placeholder gaps (tracks timestamps, lap_summary) in the same commit. No test asserts `duration_ms`'s value. | Compute duration relative to session start, e.g. `max(end_timestamp_ms) - fields.timestamp_utc_ms` (or from `data.parquet`'s actual sample span), and add a test asserting a small, correct value. |
| Important | `core/src/store/catalog.rs:314` | `laps.track_id` is unconditionally inserted as `NULL` (`"...VALUES (?1,?2,?3,NULL)"`), ignoring `doc.track_visits` (`SessionJson::track_visits: Vec<TrackVisitJson>`, which carries its own `track_id`/`start_timestamp_ms`/`end_timestamp_ms`/`laps`). C4 §5 step 4 explicitly states laps are inserted with "`track_id` from the session's track visits, C1" — this join is never performed. `idx_laps_track` (the DDL's own index) is consequently dead: every catalog rebuild leaves every lap's `track_id` `NULL`, silently. Also inherited unchanged from the plan's literal draft; not listed among this task's flagged open questions (unlike the two Priority-3 items, which were). | Derive each lap's `track_id` by matching its timestamp range against `doc.track_visits[*]` (`start_timestamp_ms`/`end_timestamp_ms`) — or, if no visit covers a lap, leave `NULL` deliberately (and say so in a comment) rather than never attempting the join at all. Add a test with a `track_visits` entry covering a lap, asserting a non-`NULL` `laps.track_id`. |
| Minor | `core/src/store/catalog.rs:281-283` | `sessions.created_at_ms` is hardcoded to the literal `0` in the `VALUES` clause (never a real "catalog row insert time," per both the DDL's inline comment in C4 §5 and C3's `SessionSummary.created_at_ms` doc, `"i64, catalog row insert time (import time)"`). Inherited from the plan's draft, but — unlike the two sibling `0`-placeholder gaps this task explicitly closed (tracks' timestamps, open question 10; lap_summary, open question 11) — this one has no comment, no `// TODO(idl0):`, and no open-question entry anywhere in the plan, so it reads as fixed when it isn't. | Either flag it explicitly (a `// TODO(idl0):`-style comment plus a new open-question entry, since no existing file under `<data>` currently carries an "imported at" timestamp to source this from), or source it from directory `mtime` as an interim value. |
| Minor | `core/src/store/catalog.rs` (tests, none present) | No test exercises the "session references a blob missing from `blobs/`" path — the exact mechanism Priority 1 and the code's own comment (`catalog.rs:304-308`) describe (FK rejection → `report.skipped`, scan continues). Verified sound by direct SQLite-semantics check (see Priority 1) and code reading, but not by this task's own test suite. | Add a test: write `session.json` + `data.parquet` referencing a `blob_sha256` that was never written via `write_blob`, assert the session lands in `report.skipped` and `sessions_indexed` does not increment for it, and that the scan still completes (other sessions still indexed). |
| Minor | `core/src/store/catalog.rs:470-499` | `read_derived_channels` materializes the whole derived file (`collect()` + `concat_batches`) rather than folding row-group-by-row-group; drifts from C4 §5 step 5 / C1 §5's "same class of operation as `channel_min_max`... no full materialization" framing, though harmless at current per-session file sizes. | Note as an accepted simplification in a doc comment, or fold over `builder.build()`'s row-group iterator directly without `concat_batches` if this ever needs to scale. |

## Verdict

NEEDS-REWORK — Priority 1's central claim (plan's literal draft is broken under
`PRAGMA foreign_keys=ON`) is verified true, and the fix (reading `data.parquet` file metadata) is
verified correct and spec-exact; the DDL, PRAGMAs, scan order, and the two Priority-3 scope
extensions (`lap_summary`, `Track` timestamps) are all correct, tested, and non-breaking. But two
Important, spec-explicit correctness bugs slipped through unflagged and untested:
`sessions.duration_ms` stores an absolute epoch timestamp instead of a duration, and
`laps.track_id` is never populated from `session.json`'s `track_visits` despite C4 §5 step 4
explicitly requiring it (making the DDL's own `idx_laps_track` permanently dead). Both are
silent — no comment, no open-question entry, no test — which is exactly what this review was
asked to catch on a task this deviation-heavy.
