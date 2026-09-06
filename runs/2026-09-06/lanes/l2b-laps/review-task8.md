# Review — L2b Task 8 (`rescan_tracks`) + Task 6 fix (R85)

**Commits:**
- idl-rs (`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l2b-laps`, branch `l2b-laps`):
  `4ed184b` "tauri: fetch_fft's R76 guards run on the lap window's own t_us (R85)",
  `fad9605` "core: pub time_window_index_range; tauri fetch_fft reuses it (Task 6 fix)",
  `95e11d0` "tauri: rescan_tracks over reindex_laps (C3 3.2, SPEC 17.4)"
- idl1-app (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l2b-laps`, branch `l2b-laps`):
  `ccb00a2` "docs: fetch_fft's R76 guards run on the lap window (R85, C3 3.6)",
  `d6aa513` "docs: rescan_tracks (C3 3.2, SPEC 17.4); L2b lane wrap-up (TASKS/CHANGELOG)"

**Files touched:** `tauri/src/commands/rasters.rs`, `core/src/session/handle.rs`,
`tauri/src/commands/catalog.rs`, `tauri/src/error.rs`, `tauri/src/lib.rs`
(idl-rs); `CHANGELOG.md`, `TASKS.md`, `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
(idl1-app). No other files touched in any of the five commits; `Cargo.lock`
unchanged in all three idl-rs commits.

**Test command:** none run (Rust lane, read-only review per CLAUDE.md §8 —
never run cargo). Reported lane gate: `tauri 211, idl-rs 983, cli 53`, all
`passed`. Verified statically: `#[test]` count in `cli/src` = 53 (exact
match: 20+21+7+5). `#[test]` count in `core/src` = 984 vs reported 983 (off
by one — cosmetic discrepancy, not traceable to these three commits, which
only add 5 new core tests, all present and correctly formed). `#[test]` +
`#[tokio::test]` count in `tauri/src` = 201 (182+19) vs reported 211 — a
gap of 10 I cannot resolve by static grep alone (no `rstest`/`test_case`/
`proptest` macros present, no separate `tauri/tests/` directory). This is a
lane-wide total, not attributable to a specific line in the three commits
under review; flagged as a note, not a finding, since exact `passed` counts
cannot be reproduced without running cargo, which this review must not do.

## R85 fix (Task 6 review's Major finding)

`4ed184b` makes `fetch_fft_via` derive both R76 guards — the `"none"`-
averaging segment check and `effective_rate_hz_from_t_us` — from the lap
window's own `t_us`, not the whole channel's. This closes the review's Major
finding correctly and generally: `effective_rate_hz_from_t_us`'s `len() < 2`
guard now runs on the sliced window, so a 1-sample lap fails regardless of
averaging mode (not just `"none"`), and a 2-sample duplicate-timestamp
window produces a zero median gap → `rate_hz = inf` → rejected by the
`is_finite()` check, also regardless of averaging mode. Confirmed by reading
`core/src/fft.rs:192-210`. New tests
`fetch_fft_via_lap_window_single_sample_invalid_argument` and
`fetch_fft_via_lap_window_two_duplicate_timestamp_samples_invalid_argument`
exercise exactly these cases and assert `InvalidArgument`; a third test,
`fetch_fft_via_lap_window_healthy_multi_sample_output_unchanged_by_r85`,
independently rebuilds the expected `welch()` output from a manual slice +
manual rate rather than re-running through `fetch_fft_via`, so it would
catch a rate regression, not just a byte-identical no-op. All three are
Arrange/Act/Assert with correct names.

`fad9605` immediately refactors the fix's private `slice_t_us_by_time` into
core's `pub fn time_window_index_range`, shared by `slice_channel_by_time`
(the existing private slicer) and `fetch_fft_via`'s new t_us slice — exactly
the "one definition of the boundary math" the review's Task 6 report should
have asked for. Three new core tests
(`time_window_index_range_matches_slice_by_time_window`,
`_inverted_window_is_empty`, `_empty_t_us_is_empty`) cover the shared
function directly; `slice_channel_by_time`'s own behaviour is provably
unchanged (`(lo, hi) = time_window_index_range(...)` replaces its inlined
arithmetic verbatim, confirmed by diff). No DSP moved into core beyond index
arithmetic already `pub` via `Channel.t_us`; `core::session::handle` is
already a `pub mod`.

## `rescan_tracks` (Task 8)

`95e11d0` implements the command as specified in `brief-task8.md`:
`RescanReport` fields match byte-for-byte (`session_id, visits_indexed,
laps_indexed, flags_cleared, warnings, elapsed_ms`); `rescan_tracks_via`
checks the session directory before calling `reindex_laps` (matching
`get_session`/`list_laps`'s `not_found` convention, confirmed against
`get_session_via`); `reindex_laps` always forces recomputation (confirmed —
`reindex_laps` calls `index_laps(..., true)`); catalog re-indexing is
skipped (not an error) when `catalog.sqlite` is absent, and its failure
folds into `warnings` rather than failing the call, matching Task 4's
import-side rule; `elapsed_ms` is timed the same way `rebuild_catalog_via`
already does. `LapIndexError → IpcError` in `tauri/src/error.rs` maps `Io`
to `Io` and `Track` to `Internal`, with a doc comment citing the
`CatalogErrorKind::Sql`/R46 precedent — this directly answers the Task 6
review's Minor question about whether `Track` deserves its own kind; no new
`IpcErrorKind` was added (confirmed by reading the full `IpcErrorKind` enum).
Registered in `lib.rs`'s `handler()`.

Tests cover exactly the five brief-listed scenarios: track added after
import → laps appear (`visits_indexed: 1`, `laps_indexed: 3`, confirmed
against `list_laps_via`); twice is idempotent, no duplicate catalog rows
(re-run → same 3 laps via `list_laps_via`, not just the report's own
counts); unknown session id → `NotFound`; no `catalog.sqlite` → `Ok`, none
created; a now-invalid `main_lap_number` is cleared and named in
`flags_cleared`, verified via `get_session_via` after the call, not just the
report. All named `thing — condition — result` in inline comments, all
Arrange/Act/Assert with blank lines.

C3 §3.2 and §2's error-kind tables gain `rescan_tracks` correctly (`io` row
count bumped 7→8, `internal` row gains the `LapIndexErrorKind::Track` note);
§6's deferred-item note is updated to say the engine gap is closed and only
the track-write half remains deferred — accurate, matches the code.

## TASKS.md / CHANGELOG.md

The removed "no wave-1 import path indexes `laps`/`lap_summary`" and R73
"unreachable today" claims are genuinely false now (confirmed: `finish_import`
wiring landed in Task 3, `MathOverlay` list construction landed in Task 7).
The new L2b summary entry lists the same seven unblocked-UI items as
PLAN.md §4, plus the T5/T6/T8 exact TS declarations for the lead's shell
tasks, matching the brief's "report the TypeScript" requirement. Only the
four named files are touched.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | this review, test-count reconciliation | Tauri crate's `#[test]`+`#[tokio::test]` static count (201) does not match the reported lane-gate `passed` count (211); cause not identified by static grep (no parametrized-test macros found). | Not attributable to these three commits (they add well-formed, correctly counted tests); note for the lead in case it recurs on a future lane's gate report — worth a `cargo test -p idl-rs-tauri -- --list` sanity check next time someone holds the cargo lock, not a re-run to "fix" this review. |

**Verdict rationale:** Both the R85 Major finding and its follow-up
refactor are correct, general (not just the `"none"`-averaging special case
originally reported), well tested with tests that would catch a regression
rather than just re-asserting the fix's own arithmetic, and land the shared
boundary-math function the prior review implicitly asked for. `rescan_tracks`
matches its brief's interface, error mapping, and test list exactly, resolves
the open `LapIndexErrorKind::Track` mapping question with a documented,
precedented choice instead of inventing a new `IpcErrorKind`, and the C3/
TASKS/CHANGELOG paperwork accurately reflects what landed with no stale
claims left behind. The only open item is an unexplained ten-test gap in a
lane-wide gate total that isn't traceable to anything in this diff, which is
a note, not a code defect.

VERDICT: CLEAN
