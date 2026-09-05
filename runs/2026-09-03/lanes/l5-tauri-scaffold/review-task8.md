# Review: L5 Task 8 — Catalog commands (C3 §3.2) + R46 follow-up

Commits reviewed:
- idl-rs worktree `wave1-l5-tauri`: `9b68c38` (task) and `830124c` (R46 fix), diffed against `0f79ee6`.
- idl1-app worktree `wave1-l5-tauri`: `71a608b`, diffed against `755cc58`.

Files touched (idl-rs, both commits combined):
`core/src/store/catalog.rs` (+10/-1, additive `NotFound` variant only),
`core/src/store/catalog_read.rs` (new, 794 lines),
`core/src/store/mod.rs` (+1, `pub mod catalog_read;`),
`tauri/src/commands/catalog.rs` (new, 590 lines),
`tauri/src/commands/mod.rs` (+1),
`tauri/src/error.rs` (+52, `From<CatalogError>` + tests).

Files touched (idl1-app): `CHANGELOG.md` (+1), `rust` submodule pointer bump. No source changes.

## Test commands run and results

- `cargo test -p idl-rs store::catalog_read` (rust worktree): **11 passed, 0 failed** (plus an unrelated pre-existing 0-test integration binary, `real_session_odr_validation`, 0 passed/0 failed).
- `cargo test -p idl-rs-tauri catalog` (rust worktree): **9 passed, 0 failed**.

Both non-zero `passed` counts; gate satisfied. `cargo check -p idl-rs-cli --tests` (required by CLAUDE.md §8 and the brief for a `pub`-API-in-core change) was **not** in my dispatched run list and was not run by me; I cannot independently confirm from the transcript whether the implementer ran it. Flagged, not blocking — see verdict note.

## (a) Seven commands vs C3 §3.2

Checked field-for-field, both directions (Rust struct <-> C3 TS interface <-> `catalog.ts`):

- `list_sessions` → `SessionSummary` (19 fields incl. `lap_count`/`duration_ms` as `Option`) — matches C3 exactly, including the `duration_s`→`duration_ms` rename and dropped `channel_count`. Errors `io`/`internal` — matches (no `not_found` path exists, correctly: an empty catalog is `Ok(vec![])`).
- `get_session` → `SessionDetail`, 24 fields plus nested `ChannelSummary`/`LapDetail`/`TrackVisitSummary`/`OverlayLapKey` — every field present, correctly sourced from `read_session_metadata` (4 fields) + `read_session_json` (18 fields) + `read_session_parquet`'s channels, exactly as C3 specifies ("does not extend SessionSummary", no `importer_version`/`engine_version`/etc.). `channel_kind` computed as `"event"` iff `nominal_rate_hz == 0.0` — matches C3's own rule verbatim. Errors `not_found`/`io`/`internal` — matches.
- `list_laps` → `LapSummary[]` with grouped `LapChannelStat[]`, `channel_id` ascending — matches C4 §5 tables and C3's field renames (`lap_number` 1-based i32, not `lap_index`). Not-found on unknown `session_id`, `Ok(vec![])` on a lapless session — verified by tests, both directions.
- `rebuild_catalog` → `RebuildReport` four fields only, timed at the command boundary via `Instant`; core's extra fields (`blobs_indexed`/`laps_indexed`/`lap_summary_indexed`/`skipped`) dropped with a doc comment and a correctly-formed `// TODO(idl0):` — matches brief and C3.
- `list_workbooks` → `WorkbookSummary` 5 fields — matches C4 §5 `workbooks` table and C3's renames (`file_name`, not `path`; `workbook_id`, not `id`).
- `list_tracks` → `TrackSummary` 5 fields, `full_json` correctly excluded — matches.
- `get_track` → `TrackDetail`, scalars from the parsed `Track` (confirmed `venue_name` on the wire ↔ `Track.venue` in Rust via `TrackDto`'s `#[serde(rename)]`-equivalent field, `core/src/track_artifact/model.rs:68,191`), four opaque fields lifted verbatim as `serde_json::Value` from the same bytes — matches C3's `unknown` typing and open question 10.

`app/src/ipc/catalog.ts` (app worktree) checked directly, not taken on the implementer's word: all ten interfaces and seven functions present, every field name and nullability matches the Rust `#[derive(Serialize)]` structs in `tauri/src/commands/catalog.rs` verbatim (snake_case both sides, no rename layer, per C3 §1). Argument passing (`{ sessionId }`, `{ trackId }`) is Tauri's standard camelCase-JS→snake_case-Rust convention, consistent with the existing `device.ts` precedent (`{ deviceId }`, `{ fileName }`). No mismatch found — Step 3's "no change expected" claim holds.

## (b) R46 error mapping

`CatalogErrorKind` gains `NotFound` (additive, `catalog.rs:29-42`); `CatalogError::from(rusqlite::Error)` is unchanged and still produces `Sql`. `catalog_read.rs`'s own `not_found()`/`io_like()` helpers are the only other error constructors, so `Sql` can now *only* originate from a genuine `rusqlite` failure — confirmed by reading every call site in `catalog_read.rs` (all six catalog-backed functions use `?` on `open_catalog`/`conn.prepare`/`query_map`, none construct `Sql` themselves).

`tauri/src/error.rs`'s `From<CatalogError>` maps `NotFound → NotFound`, `Sql → Internal`, `Io → Io`, exactly as R46 states, with no new `IpcErrorKind` variant.

Verified the "corrupt catalog" test actually discriminates, not just passes coincidentally: `store::catalog_read::tests::list_sessions_corrupt_catalog_file_is_a_sql_error_not_a_not_found_error` writes literal garbage bytes over `catalog.sqlite` (no valid file ever existed at that path) and asserts `err.kind == CatalogErrorKind::Sql`. Traced the failure path: `open_catalog`'s `Connection::open` succeeds lazily, but `conn.pragma_update(None, "journal_mode", "WAL")` forces a page-1 read on garbage bytes, which SQLite rejects — the resulting `rusqlite::Error` propagates through `?` and `CatalogError::from(rusqlite::Error)`, landing on `Sql`. This is not reachable by any of this module's `not_found()` call sites (those all check a directory/file/row first and return before ever calling `open_catalog`/preparing a statement in a way that would hit this branch for the *same* condition) — a regression that made not-found and corruption share a code path would flip this assertion. `tauri/src/error.rs`'s own unit test (`catalog_error_sql_kind_converts_to_internal_not_not_found`) independently exercises the enum-to-enum mapping directly with a hand-built `CatalogError{kind: Sql, ..}`, so the mapping itself is also pinned regardless of how `Sql` is produced. Both tests ran and passed in this session (see above). This is a real, regression-catching pair, not a tautology.

No not-found path returns `Sql`: read all three call sites of `not_found()` (`get_session`, `list_laps`, `get_track`) — each is a directory/row/file existence check performed *before* any SQL statement that could itself fail, so a not-found condition never touches the `Sql`-producing code path.

## (c) R40 compliance

`core/src/store/catalog.rs`'s diff is exactly the additive `NotFound` variant plus its doc comments (10 lines) — no other line in that file changed. `catalog_read.rs` is a new file. `store/mod.rs` gains one line, alphabetically placed (`atomic, blob, catalog, catalog_read, derived, …`). No `#[cfg(test)]` helper from `catalog.rs` was made public or imported; `catalog_read.rs`'s own `write_full_session` test helper is a fresh, local implementation, as the brief required. Matches R40 and the brief's "Do not" list exactly.

## (d) Query correctness / crash-on-bad-data

- `list_sessions`/`list_workbooks`/`list_tracks`: single `SELECT`, `query_map` + `.collect::<Result<Vec<_>,_>>()`, no partial-result truncation — a mid-scan row error surfaces as `Err`, not a silently short list.
- `list_laps`: two-stage query (all laps for the session, then per-lap `lap_summary` rows) — a lap with zero `lap_summary` rows correctly gets `channel_stats: vec![]`, not dropped from the result; a session with zero laps returns `Ok(vec![])` after the not-found existence check passes. No join drops a row a user would expect.
- `get_track`: missing file → `NotFound` before any parse is attempted; a malformed-but-present `.idl0t` is a typed `Io`-kind error via `read_track`/`serde_json::from_slice`, not a panic (checked: no `unwrap`/`expect`/indexing panic on any parsed value — `json.get("track")` and `.and_then(...).cloned().unwrap_or(default)` degrade gracefully to `Null`/`[]` rather than panicking if a sub-key is absent).
- No `unwrap()`/`expect()` outside `#[cfg(test)]` blocks in either new file (grepped both files; every hit is inside `mod tests`).
- `get_session`'s existence check is directory-only (`session_dir.is_dir()`); a directory present but missing `data.parquet`/`session.json` correctly falls through to `io_like` (typed `Io`), matching the brief's "no directory/row" scoping for the not-found rule rather than inventing a broader one.

## (e) R27 (decimal degrees)

No coordinate literal in any new fixture or struct in this diff (`catalog_read.rs`'s and `catalog.rs`'s test JSON use small integer/decimal values for `lat*_deg`/`lon*_deg`/`latitude_deg`/`longitude_deg`, e.g. `1`, `2`, `3`, `4` — plausible decimal degrees, not `deg_e7`-scale). No GPS/coordinate field is defined by this task's own new types (`SessionSummary`, `SessionDetail`, etc. carry no lat/lon fields) — R27 is not otherwise implicated by this diff.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `tauri/src/commands/catalog.rs:467-590` (test module) | The seven-command test suite has 7 tests for 7 commands, but one of them (`get_session_via_unknown_id_ipc_error_kind_is_not_found`) only exercises the error path — there is no happy-path test for `get_session_via` at the Tauri boundary, so `SessionDetail::from(catalog_read::SessionDetail)` (24 scalar/nested fields, the largest `From` impl in the file, including four nested-collection conversions) is never exercised through the command layer. It is only indirectly covered by the core-level `get_session` test, which never touches this `From` impl at all. A field transposition or dropped field in this specific conversion (e.g. swapping `venue_name`/`bike_comment`, or forgetting `.map()` over `track_visits`) would not be caught by either test suite as it stands. Manual review of the impl (`catalog.rs:191-221`) found it correct field-for-field, but the brief's own minimum ("one happy-path test per command") is not met for this command. | Add a `get_session_via` happy-path test seeding a session with laps/track_visits and asserting several of the 24 `SessionDetail` fields (at minimum one from each of the three source groups: parquet metadata, session.json metadata, laps/track_visits) round-trip through the `From` impl. |
| Minor | (process) | `cargo check -p idl-rs-cli --tests` — required by the brief and CLAUDE.md §8 ("a task that changes a `pub` signature in `core` adds..." — this task adds ten new `pub` types plus seven `pub fn`s to `core`) — was not part of my dispatched test-command list and I did not run it under the compute rules given to me. I cannot confirm from what I reviewed whether the implementer ran it as required. Not a code defect; a process gap worth the lead confirming was covered. | Confirm (from the implementer's report, not re-run by a reader) that this gate was executed and passed before treating Task 8 as fully gated. |

## Verified as correct (no finding)

- Contract surface: all seven commands' names, argument shapes, return shapes and error-kind sets match C3 §3.2 exactly, including every field rename the contract calls out (`duration_s`→`duration_ms`, `lap_index`→`lap_number`, `id`→`workbook_id`, `path`→`file_name`).
- `catalog.ts` genuinely matches field-for-field (independently re-read, not taken on report).
- R46's three-way error mapping is correct, minimal, and covered by regression-capable tests on both sides of the crate boundary.
- R40: only an additive enum variant touches `catalog.rs`; the read API lives entirely in the new file.
- No `unwrap()`/panic-on-bad-data path in production code; typed errors throughout (`CatalogError`/`IpcError`, never `Err(String)`).
- `// TODO(idl0):` used correctly for the dropped `skipped` field; CHANGELOG entry matches the brief's specified text verbatim; commits carry no AI attribution trailer; commit messages are single-line.
- No coordinate fields introduced by this task; no R27 exposure.

## Verdict rationale

The contract surface, the R46 fix, and the R40 file-boundary discipline are all correct and independently re-derived rather than taken on the implementer's word — this is solid, contract-accurate work with genuinely regression-capable tests for the one subtle ruling (R46) that mattered most. The one real gap is a missing happy-path test for the largest and most error-prone `From` conversion in the file (`get_session_via`/`SessionDetail`), which is a testing-completeness issue rather than a code defect (I read the conversion and it is correct). Given manual verification already confirms correctness and the gap is narrow and easy to close, this does not block merge but should be fixed before the lane's final gate closes out Task 8. The unexecuted `cargo check -p idl-rs-cli --tests` is a process note for the lead to confirm, not a review-blocking defect I can adjudicate from here.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\lanes\l5-tauri-scaffold\review-task8.md
COUNTS: critical=0 important=1 minor=1
