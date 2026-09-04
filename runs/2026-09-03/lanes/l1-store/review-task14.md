# Review: L1 R16 catalog-swap fix-up (`8842199`) + Task 14 (`8d6cb00`)

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`, branch `wave1-l1-store`, HEAD `8d6cb00`.

## Test command and result (run once, as instructed)

```
cd core
cargo test -p idl-rs -- store::catalog store::verify track_artifact::write laps::gate_synthesis laps::renumber laps::distance session::filename
```

**Result:** `test result: ok. 46 passed; 0 failed; 0 ignored; 0 measured; 636 filtered out` — matches the implementers' reported 27 + 19 = 46. No reruns.

---

## Section 1 — `8842199`: R16 catalog-swap fix-up + Task 13 Minors

**Parent:** `a91bf59`. **Files touched:** `core/src/store/catalog.rs` (+63/−6), `core/src/store/verify.rs` (+86/−0), `core/src/track_artifact/write.rs` (+31/−0). All under `core/`.

### Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None. | — |

### Verification detail

1. **Catalog swap (R16).** `rebuild_catalog` (`catalog.rs:397-402`) now computes `based_on = std::fs::read(&final_path).ok().map(sha256_hex)` and calls `write_atomic_with_retry(data_root, &final_path, &bytes, based_on.as_deref(), |_current| bytes.clone())` — exactly R16's ruling (superseding overwrite, not a merge). Stale `catalog.sqlite-wal`/`-shm` are removed only after the swap succeeds (`let _ = std::fs::remove_file(...)` lines immediately following), with a comment correctly framed as "prudence, not a contract line." The doc comment above `rebuild_catalog` states the no-live-connection precondition. The new test `rebuild_catalog_twice_on_the_same_root_overwrites_the_previous_catalog` calls `temp_root()` once and reuses the same `root` for both `rebuild_catalog(&root)` calls (confirmed by reading the test and `temp_root`/`write_full_session` helpers directly) — this genuinely exercises the second-rebuild-over-an-existing-catalog path, not two fresh roots. It asserts every `RebuildReport` count matches between the two calls and that `PRAGMA user_version` still reads `CATALOG_SCHEMA_VERSION` afterward.
2. **`PathBuf` import move.** `use std::path::{Path, PathBuf}` at the top became `use std::path::Path`, with `use std::path::PathBuf;` added inside `#[cfg(test)] mod tests`. Grepped the whole file: the only two occurrences of `PathBuf` are both inside `mod tests` (the `use` and `temp_root() -> PathBuf`). Confirmed genuinely unused outside tests; the move is correct and removes the pre-existing unused-import warning the Task 13 review had noted as out-of-scope.
3. **Task 13 Minor — `PointToPoint` round-trip.** `write_then_read_round_trips_point_to_point_timing` constructs a `Track` with `LapTiming::PointToPoint { start, finish }`, writes and reads it back, and asserts both `start` and `finish` `Gate`s round-trip via a match on both sides (not just a partial field check) — closes the gap the Task 13 review flagged.
4. **Task 13 Minor — verify checks #2/#5/#8 coverage.** All three new tests build from real writers then corrupt in place, matching the shape of the existing `verify_detects_a_corrupted_blob`:
   - `verify_detects_a_malformed_session_json_as_an_error` (#2) hand-writes `session.json` as `b"not json"` (necessarily — a real writer can't produce malformed JSON), with no `data.parquet` present so #3/#4 don't also fire; asserts exactly one `Error` finding at the `session.json` path.
   - `verify_detects_a_derived_file_whose_content_does_not_match_its_filename_hash` (#5) calls the real `write_derived_parquet`, then overwrites the resulting file's bytes in place (filename/claimed-hash unchanged); asserts exactly one `Error` finding.
   - `verify_detects_a_track_file_whose_filename_does_not_match_its_track_id` (#8) calls the real `write_track` for `track_id = "t-1"`, then renames the resulting `.idl0t` to `t-2.idl0t`; asserts exactly one `Error` finding.

   Each asserts `findings.len() == 1` and `severity == Error`, so none of them accidentally double-count with an unrelated check. Correctly written and correctly shaped.
5. **Task 13 Minor — #1/#10 overlap doc comment.** Added directly above `verify()`, stating the double-reporting behaviour (a malformed blob filename can trip both #1 and #10) is intentional, not deduplicated — matches what the Task 13 review asked for.
6. **Hygiene.** No reformatting of untouched lines (diff is entirely new lines plus the one import-line edit and one call-site edit). Doc comments present and updated on `rebuild_catalog`. No `unwrap()`/`expect()`/panicking indexing outside `#[cfg(test)]`. Typed error (`CatalogError`) preserved through the `write_atomic_with_retry` call. Single-line commit message, no AI attribution trailer. Nothing under `docs/` touched.
7. **Anything unruled.** Nothing found beyond what R16 and the Task 13 review's three Minors asked for.

---

## Section 2 — `8d6cb00`: Task 14 (gate synthesis, lap renumbering, lap-distance normalisation, session filenames)

**Parent:** `8842199`. **Files touched (all additive, no deletions):** `core/src/laps/distance.rs` (+360, new), `core/src/laps/gate_synthesis.rs` (+236, new), `core/src/laps/renumber.rs` (+135, new), `core/src/session/filename.rs` (+68, new), `core/src/laps/mod.rs` (+9), `core/src/session/mod.rs` (+1), `core/src/track_artifact/model.rs` (+5, doc-only). All under `core/`.

### Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None. | — |

### Verification detail

1. **`laps/gate_synthesis.rs` (R17 items 1/2/4).** Diffed line-by-line against `gate_geometry.dart`: `perpendicular_gate`'s `M_PER_DEG_UNITS = 111_320.0 / 1e7`, `lon_scale`, `dx_m`/`dy_m`, degenerate-length branch, perpendicular unit vector, half-width offsets — every line matches the Dart's `_perpendicularGate` (`gate_geometry.dart:113-159`) with only syntax translated. `/ 1e7` happens exactly once, in `to_lap_gate_json`, at the `LapGateJson` boundary. The module doc states the × 1e7 / decimal-degrees convention is "settled, ruling R8" — not "pending Isaac's confirmation" as the plan's own draft text said (correctly updated, since R8 postdates the plan draft). `snap_to_nearest_fix`'s parameters are `lat_e7: f64, lon_e7: f64` (not `_deg`), matching R17 item 4.
2. **`laps/distance.rs` (R17 item 1, the crux).** `M_PER_UNIT = 111_320.0 / 1e7` (`distance.rs:22`); `mean_lat_rad = (mean_lat_e7 / 1e7) * π/180` (`:126`); every Δlat multiplies by `M_PER_UNIT`, every Δlon multiplies by `lon_scale` (itself `M_PER_UNIT * cos(mean_lat_rad)`) throughout the projection, tangent-agreement, and cumulative-arc blocks. Diffed against `lap_distance_accumulator.dart:57-215` line-by-line: projection loop, residual, tangent agreement, cumulative arc, anchor list construction (start/gate-crossings/confidence-qualifying samples/finish), and the arc-fraction redistribution loop are a structurally verbatim port — same order of operations, same variable roles, only the `/1e7` correction and Rust syntax differ. The doc comment cites `lap_distance_accumulator.dart:79-80, 88-89` and explains the idl0 bug being fixed, matching R17's mandate that this port is corrected, not bug-faithful.

   `compute` returns `Result<Self, LapDistanceError>`; `LengthMismatch` (`speed_kmh.len() != n`) and `IndexOutOfBounds` (any `GateCrossing.sample_index >= n`) are both checked and returned before the `n == 0 || polyline.len() < 2` early-return — matches R17 item 3's ordering requirement exactly.

   **Verified the metres-test arithmetic independently.** `projected_residual_reflects_real_metres_not_e7_scaled_metres`: polyline fixes run `lat = 500_000_000 + i*1_000` for `i` in `0..=10`, `lon = 100_000_000` constant. Mean lat = `500_000_000 + 5*1_000 = 500_005_000` (≈ 50.0005°N, i.e. ≈50°N as expected). `lon_scale = M_PER_UNIT * cos(50.0005° in rad) ≈ 0.011132 * 0.642788 ≈ 0.0071564` m/unit. `delta_lon_e7 = 3.0 / lon_scale ≈ 419.25` units, matching the task's own expected value and the test's own sanity assertion (`|delta_lon_e7 - 419.0| < 5.0`). Because the polyline is due-north (constant longitude), the closest-point projection's `dx_lon` term is 0 on the matching segment, so the residual reduces to exactly `delta_lon_e7 * lon_scale ≈ 3.0` m — the test's `assert!((acc.residual[0] - 3.0).abs() < 0.1)` is correctly tight. Reasoned (not run) that Dart-faithful math — feeding raw ×1e7 latitude into `cos()` without `/1e7` and multiplying deltas by the bare `111_320` constant instead of `111_320/1e7` — would produce `ex ≈ delta_lon_e7 * 111_320 ≈ 4.66×10⁷` m, off by ~1e7×, nowhere near passing a ±0.1 m assertion; the test genuinely discriminates the two implementations. **Anchor test:** `on_line_fast_sample_is_an_anchor_whose_distance_matches_its_arc_length` expects `5.0 * 1_000.0 * M_PER_UNIT ≈ 55.66` m for 5 steps of 1,000 e7-units of latitude, i.e. `1_000 * M_PER_UNIT ≈ 11.132` m/step — matches the reviewer brief's expected value exactly, and the assertion's `M_PER_UNIT` constant is the same one `compute` uses (imported via `use super::*`), so this isn't independently-drifting arithmetic.
3. **`laps/renumber.rs`.** Diffed against `cached_session_laps.dart:20-61`: collects `(track_id, lap)` across every visit's laps, sorts by `start_timestamp_ms` (Rust's `sort_by_key` is documented stable, matching Dart's stable `List.sort`), assigns 1-based `lap_number = i + 1`, and computes `is_ignored` against the *renumbered* number — matches the Dart exactly, including the module doc's explicit cross-reference to R14 item 2's timestamp-containment join ruling. Two added tests: `no_visits_renumbers_to_an_empty_list` (empty input → empty output, trivial but correct) and `equal_start_timestamps_keep_their_original_visit_order` (two laps sharing a timestamp from different visits; asserts the tie resolves by original visit-then-lap collection order, correctly relying on `sort_by_key`'s stability and documented as such in the test's own comment). Both are proper Arrange/Act/Assert. `RenumberedLap.track_id: Option<String>` is unconditionally `Some(track_id)` here — noted per the dispatch brief, not treated as a finding, since the lead has already ruled it becomes a plain `String` in the next task's Step 0.
4. **`session/filename.rs`.** `format_session_file_base` matches `formatSessionFileBase` field-for-field (zero-padded `YYYY-MM-DD_HH-MM-SS`, no colons). `unique_file_base` matches `uniqueFileBase`'s `<base>`, `<base>-2`, `<base>-3`, … probing loop exactly. `session_file_base` (the `DateTime`-dependent function requiring local-time conversion) is deliberately not ported — the module doc explains why (no date/time crate in this workspace) and the plan/lead have already agreed to this scope cut.
5. **`track_artifact/model.rs` doc-only change.** Diff is exactly two added comment blocks on `LapGateDto`'s and `GpsFixDto`'s `_deg` fields, stating they carry × 1e7 values despite the name (SPEC §16.3, unchanged from idl0) — no code changed, confirmed by the diff itself (`+5/-0`, all comment lines).
6. **Hygiene.** All five non-model files are new; `mod.rs` edits are pure addition (new `pub mod`/`pub use` lines); `model.rs`'s five added lines are comments only — no reformatting of untouched lines anywhere in the commit. Doc comments present on every new public symbol, with units stated (metres, km/h, × 1e7, ms) — e.g. `distance.rs`'s `GateCrossing::known_distance` ("in metres along `polyline`"), `compute`'s param doc ("`speed_kmh` is km/h... metres along `polyline`"). Typed errors throughout (`GateSynthesisError`/`GateSynthesisErrorKind`, `LapDistanceError`/`LapDistanceErrorKind`), no `Err(String)`. Grepped all four new files for `unwrap()`/`expect()`/`panic!` outside `#[cfg(test)]`: the only hit is `distance.rs:135`'s `polyline_cum.last().unwrap()`, which is safe by construction — it executes only after the preceding `if n == 0 || polyline.len() < 2 { return ... }` guard, so `polyline` (and therefore `polyline_cum`, same length) is guaranteed non-empty at that point; this is not a panic reachable from caller input, consistent with the doc comment's "never panics on caller input" claim. All new tests follow Arrange/Act/Assert with blank-line separation and descriptive snake_case names matching the repo's existing `thing_condition_result`-style convention (already accepted as satisfying CLAUDE.md §4 in the Task 13 review). Single-line commit message, no AI attribution trailer. Nothing under `docs/` touched.
7. **Anything unruled.** `laps/mod.rs` additionally re-exports `endpoint_gates_default` (not named in the plan's "Produces" line, which lists only `endpoint_gates`, `perpendicular_gate_at`, `snap_to_nearest_fix`) — this is a pre-existing helper already written into the plan's own Step 1 code block, just not mentioned in the Interfaces summary line; exporting it is consistent with the pattern of exporting every public symbol in a wired-in module and not a scope expansion. No other undeclared deviations found.

---

## Overall verdict rationale

The R16 fix-up implements the ruling exactly: `write_atomic_with_retry` with a read-current-hash `based_on`, a superseding `rederive`, post-swap sidecar cleanup gated on success, and a precondition doc comment — verified by a test that genuinely exercises a second rebuild against an already-populated root, not two independent fresh roots. All three Task 13 Minors are closed with tests built from real writers and corrupted in place, each asserting a single finding at the expected severity and path. Task 14 gets the crux exactly right: `distance.rs`'s unit correction is verified line-by-line against the Dart original and independently re-derived by hand (both the ~419-unit offset and the ~3 m residual, and the ~55.66 m anchor arc length), the error-check ordering matches R17 item 3, and `gate_synthesis.rs`/`renumber.rs`/`filename.rs` are faithful, correctly-scoped ports with their unit conventions stated as settled rather than pending. Hygiene is clean across both commits: purely additive diffs, doc comments with units on every new public symbol, typed errors, no caller-reachable panics, A/A/A tests, single-line commit messages with no AI trailers, and no cross-lane or `docs/` touches. Both commits pass the required test filter in one run (46/46).

VERDICT: CLEAN
