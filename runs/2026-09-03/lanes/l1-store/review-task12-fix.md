# Review — Task 12 fix-up: `store/catalog.rs` (duration_ms, laps.track_id, created_at_ms)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch: `wave1-l1-store`. Commit under review: `6ad093f` (fix-up), parent `fa522c1`
(the original Task 12 commit). Diff: `git diff fa522c1..6ad093f` — one file,
`core/src/store/catalog.rs` (+393/-19), one commit, single-line message, no AI
attribution trailer.

## Test command and result

```
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::catalog
```
```
running 14 tests
test store::catalog::tests::open_catalog_creates_file_and_applies_pragmas ... ok
test store::catalog::tests::rebuild_catalog_on_an_empty_tree_produces_an_empty_report_not_an_error ... ok
test store::catalog::tests::rebuild_catalog_session_json_without_a_data_parquet_yet_is_not_indexed_or_reported ... ok
test store::catalog::tests::rebuild_catalog_session_with_laps_but_no_derived_dir_indexes_no_lap_summary ... ok
test store::catalog::tests::rebuild_catalog_lap_outside_every_track_visit_has_null_track_id ... ok
test store::catalog::tests::rebuild_catalog_lap_visit_references_a_track_id_not_in_tracks_dir ... ok
test store::catalog::tests::rebuild_catalog_indexes_lap_summary_min_max_mean_within_the_lap_window ... ok
test store::catalog::tests::rebuild_catalog_indexes_a_blob_and_a_session ... ok
test store::catalog::tests::rebuild_catalog_session_created_at_ms_is_session_json_mtime_not_zero ... ok
test store::catalog::tests::rebuild_catalog_session_referencing_a_missing_blob_is_skipped_scan_continues ... ok
test store::catalog::tests::rebuild_catalog_lap_track_id_from_a_containing_track_visit ... ok
test store::catalog::tests::rebuild_catalog_session_duration_ms_is_the_t_span_not_epoch_time ... ok
test store::catalog::tests::rebuild_catalog_tracks_row_carries_the_wire_created_and_updated_at_ms ... ok
test store::catalog::tests::rebuild_catalog_skips_a_malformed_session_json_without_aborting_the_scan ... ok

test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 628 filtered out; finished in 0.12s
```
Ran once, per instructions. 14/14 pass — 8 original + 6 new (duration_ms,
lap-covered, lap-outside-all-visits, lap-dangling-track_id, created_at_ms,
missing-blob). No other test command was run (no full suite, no tarpaulin,
no reruns).

## R14 item-by-item verification

1. **`sessions.duration_ms`** (`catalog.rs:479-509`, `read_data_parquet_duration_ms`):
   opens `data.parquet`, builds `ProjectionMask::columns(builder.parquet_schema(), ["t"])`
   — confirmed only the `t` column is materialized, no other column is touched.
   Streams batches, keeps the first batch's first value and the last batch's
   last value, counts total rows across all batches, returns `None` when
   `n_rows < 2`. Formula `((last - first) as f64 / 1000.0).round() as i64` is
   byte-for-byte identical to `Channel::duration_ms` at
   `core/src/session/mod.rs:327-334` (verified by reading both). Confirmed C1
   §4.1 (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md:453`)
   names the column `t` (`Int64`, "union time axis, µs since first sample...
   sorted ascending, unique") — matches the fix-up's correction note, and the
   implementer used the right name (not the ruling's own typo `t_us`). Test
   `rebuild_catalog_session_duration_ms_is_the_t_span_not_epoch_time` writes a
   single channel with `t_us: [0, 12_345_000]`; since `write_session_parquet`'s
   `t` column is "sorted, deduplicated union of every channel's `t_us`"
   (`store/parquet.rs:57`), the on-disk `t` column is exactly `[0, 12345000]`
   for this test — hand-verified `round(12_345_000/1000) = 12345`, matches the
   test's `assert_eq!(duration_ms, 12_345)` and its `< 1_000_000` epoch-scale
   guard. Divergence from `Channel::duration_ms` (which returns `0` for <2
   samples) to `NULL`/`None` here is deliberate and matches the ruling exactly;
   `sessions.duration_ms` in the DDL (C4 §5, `...idl1-c4-data-directory.md:334`)
   is `INTEGER` with no `NOT NULL`, so `NULL` is a legal value. Correct.
2. **`laps.track_id`** (`catalog.rs:324-355`, `lap_track_id` at `:552-561`):
   containment is exactly `V.start_timestamp_ms <= L.start_timestamp_ms &&
   L.end_timestamp_ms <= V.end_timestamp_ms`, first match in `visits` (file)
   order via `.find()`. Confirmed `TrackVisitJson`'s fields
   (`store/session_json.rs:195-207`) are `visit_id`/`track_id`/
   `start_timestamp_ms`/`end_timestamp_ms`/`laps` — the join uses the visit's
   own timestamps, not `visit.laps[*].lap_number`, matching the ruling's
   explicit "not by lap_number" instruction. Both boundary comparisons use
   `<=`, so a lap exactly equal to its visit's window matches (inclusive, as
   required) — verified by reading the comparison, not by a dedicated test
   (none was required; three tests were specified and three are present).
   Dangling `track_id` (matched visit's `track_id` absent from `tracks`) is
   handled with an explicit `SELECT 1 FROM tracks WHERE track_id = ?1` guard
   before insert, producing `report.skipped` message
   `"<session_id> lap <n>: track_id <id> not in tracks/"` — checked
   character-for-character against the code (`format!("{session_id} lap {}:
   track_id {tid} not in tracks/", lap.lap_number)`) and matches the ruling's
   exact wording. The lap row itself is still inserted with `NULL` (matches
   `laps.track_id TEXT REFERENCES tracks(track_id) ON DELETE SET NULL`,
   nullable in the DDL) and `report.laps_indexed` still increments — verified
   by the dangling test's assertions (`laps_indexed == 1`,
   `skipped.len() == 1`, `skipped[0].contains("t-missing")`,
   `track_id == None`). Exactly three tests present (covered / outside-all-
   visits / dangling), matching the ruling's count. Correct.
3. **`sessions.created_at_ms`** (`catalog.rs:284-290`): `session.json`'s
   filesystem mtime via a new shared `file_mtime_ms` helper (also used for
   `blobs.mtime_ms`, deduplicating what was previously inlined only there —
   a reasonable, unrequested-but-harmless refactor). The `// TODO(idl0):`
   comment cites `runs/2026-09-03/decisions.md R14 item 3` and states the
   `imported_at_ms`-gap reasoning verbatim from the ruling. Test asserts
   `created_at_ms > 0` and `>= stat_mtime_ms` (a value read via `std::fs::
   metadata` before `rebuild_catalog` runs, on the same unmodified file) —
   sound, non-flaky given the file isn't touched between the two reads.
   Correct.
4. **Missing-blob test** (`rebuild_catalog_session_referencing_a_missing_blob_is_skipped_scan_continues`):
   new helper `write_full_session_with_blob` takes an already-resolved
   `blob_sha256` and — read in full — only calls `write_session_json` and
   `write_session_parquet`, never `write_blob`. The test passes a fake
   64-`'f'` hash that is never written to `blobs/`, confirming the blob is
   genuinely absent (not quietly created by a helper). `write_full_session`
   (the original helper) is preserved as a thin wrapper that calls
   `write_blob` then delegates — existing tests using it are unaffected.
   Assertions match the FK-rejection mechanism already in the (unchanged)
   `Err(e) => report.skipped.push(...)` arm at `catalog.rs:360`: one good
   session indexed, one skipped entry containing `"s-missing"`, and the good
   session still present by direct count. Correct, and this exercises a path
   the original review found "verified sound but untested."
   `read_derived_channels`'s doc comment (`catalog.rs:560-568`) now states the
   whole-file `concat_batches` materialization as an accepted simplification
   — confirmed by diff that no code in that function changed, comment-only.
   Matches the ruling's "no restructure."

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/store/catalog.rs:479-484` | Doc comment for `read_data_parquet_duration_ms` says it reads "only its first/last value per row group... so those are each row group's min/max," but the code operates on reader *batches*, not row groups (`ParquetRecordBatchReaderBuilder::build()` batch boundaries need not equal row-group boundaries unless batch size happens to align). The final result is still correct regardless (global first-ever value and last-ever value, given `t` is sorted ascending, C1 §3.5), so this is a wording-only nit, not a logic bug. | Reword to "first/last value of each streamed batch" (or just "the first and last row it reads") instead of implying row-group-aligned statistics. |

No Critical or Important findings.

## Verdict rationale

All four R14 items are implemented as ruled, not approximated: `duration_ms`'s
formula and rounding match `Channel::duration_ms` exactly and only the `t`
column is read via `ProjectionMask`; `laps.track_id`'s join is containment by
visit timestamps (not `lap_number`), inclusive at the boundary, with the
dangling-track_id case correctly downgraded to a skip rather than aborting the
row or the scan; `created_at_ms` uses `session.json` mtime with the required
`// TODO(idl0):` citation; the missing-blob path now has a real test that
verifies the blob is genuinely never written. All 14 tests (8 original + 6
new) pass on a single run, the commit is single, unformatted-by-`cargo fmt`,
and carries no AI attribution trailer, and nothing outside `catalog.rs` was
touched. The one Minor finding is a doc-comment precision nit with no
behavioural consequence.

VERDICT: CLEAN
