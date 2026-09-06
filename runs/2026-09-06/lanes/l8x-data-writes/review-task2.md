# L8x Task 2 review — typed `TrackDetail`

Commit reviewed: `0e8cbb2` "core+tauri: type TrackDetail's gate fields (C3 6 item 10)"
on branch `l8x-data-writes`, worktree `idl-rs-worktrees/l8x-data-writes`
(entry gate `git merge-base --is-ancestor 81a7db3 HEAD` passes).
Files touched: `core/src/store/catalog_read.rs`, `tauri/src/commands/catalog.rs`.
No other files (CHANGELOG bullet correctly deferred to Task 8 per PLAN §6).
`Cargo.lock` unchanged; working tree otherwise clean.

Test command (not run — Rust lane, static verification only per standing
orders): implementer reports `cargo test -p idl-rs store::catalog_read` → 16
passed; `cargo test -p idl-rs-tauri commands::catalog::` → 23 passed.
Verified by counting `#[test]` occurrences: `catalog_read.rs` had 12 before
the commit (`git show 81a7db3:...`), 16 after (4 new tests, matches diff);
`commands/catalog.rs` had 22 before, 23 after (1 new test). Counts are
consistent with the reported non-zero `passed` totals.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings | — |

## Verification detail

- **C3 field-for-field match.** Compared the amended C3 §3.2 block (commit
  `5744445`, `idl1-app-worktrees/l8x-data-writes`) against the new wire types
  in `tauri/src/commands/catalog.rs`: `GateWire{lat1,lon1,lat2,lon2}`,
  `SectorGateWire{name,gate}`, `NeutralZoneWire{name,enter,exit}`,
  `GpsFixWire{timestamp_ms,lat,lon}`, `LapTimingWire` tagged
  `#[serde(tag="kind", rename_all="snake_case")]` with `Circuit{start_finish}`
  / `PointToPoint{start,finish}` → `"circuit"`/`"point_to_point"`. All names
  and shapes match C3 byte-for-byte; `TrackDetail`'s four fields are
  `Option<LapTimingWire>`, `Vec<NeutralZoneWire>`, `Vec<SectorGateWire>`,
  `Vec<GpsFixWire>` as specified.
- **x1e7 → decimal-degrees conversion.** The scaling is not new code in this
  commit — it lives in already-landed `track_artifact::read`'s
  `LapGateDto::into_gate`/`GpsFixDto::into_fix` (`core/src/track_artifact/model.rs:143-181`),
  which divides by `1e7` (not `* 1e-7`, documented bit-exactness reason).
  `get_track` now takes every field from the one parsed `Track`, so gates,
  sectors, neutral zones and the polyline all go through that same path —
  none left as raw integers. Hand-checked the diff's literal test values:
  `501163000/1e7 = 50.1163`, `-1229574000/1e7 = -122.9574`,
  `10/1e7 = 0.000001`, `1/1e7 = 0.0000001`, `5/1e7 = 0.0000005` — every
  assertion in the five new/rewritten core tests and the one new tauri test
  matches exactly.
- **`get_track_via_serialised_track_detail_field_names_match_c3` independent
  of the encoder.** It asserts against literal string keys (`"lap_timing"`,
  `"kind"`, `"start_finish"`, `"lat1"`, etc.) taken from C3, not against a
  second Rust-constructed value built through the same `From` impls — a
  regression in field naming inside the `From<&Gate> for GateWire` etc. would
  be caught.
- **No panic on malformed artifact.** The old `std::fs::read` +
  `serde_json::from_slice` re-lift is deleted; `get_track` now reads once via
  `read_track`, which returns `Result<Track, ConfigError>` (already-landed,
  typed), mapped through `io_like` into `CatalogError::Io`. No new unwrap/panic
  path.
- **`PartialEq` drop is required, not gratuitous.** `core::laps::model::LapTiming`,
  `SectorGate`, `NeutralZone` derive only `Debug, Clone` (not `PartialEq`) —
  confirmed by reading `laps/model.rs:18-38` — so `TrackDetail` could not keep
  `#[derive(PartialEq)]` once these became its field types. Grepped
  `core/src tauri/src cli/src` for `TrackDetail` and for
  `lap_timing|reference_polyline|neutral_zones|sector_gates` outside the two
  touched files and `track_artifact`/`laps::model`: no other caller compares
  a `TrackDetail` for equality, and no other reader touches these four fields
  on the untyped path (matches the brief's own required grep). Adding
  `PartialEq` to `LapTiming`/`SectorGate`/`NeutralZone` is correctly not done
  — nothing needs it.
- **No wire derives leaked into core.** `core::laps::model` and `core::gps`
  types stay free of `serde` derives; the mirror `*Wire` structs live in
  `tauri/src/commands/catalog.rs` per the established `TrackSummary`/`TrackDetail`
  pattern.
- **Tests are Arrange/Act/Assert** with blank lines between sections, named
  `thing — condition — result` in the file's existing snake_case convention
  (e.g. `get_track_point_to_point_timing_both_gates_decode`,
  `get_track_no_lap_timing_is_none`), consistent with sibling tests in the
  same files.
- **Hand style / no reformatting.** Diff touches only the lines needed for
  the retyping; no rustfmt-style churn to surrounding code.
- **`Cargo.lock`, CHANGELOG.md**: untouched, as expected (Task 8 sweep).
- **Commit**: single commit, message `core+tauri: type TrackDetail's gate
  fields (C3 6 item 10)`, no AI attribution trailer.

## Verdict rationale

The implementation matches C3 §3.2 exactly, reuses the already-landed x1e7
conversion rather than re-deriving it, drops `PartialEq` for a structurally
necessary reason with no caller impact, introduces no panic paths, and the
new tests are well-formed and arithmetically verified to be correct against
the wire scaling. No deviations from the brief or the plan's Q3 ruling.

VERDICT: CLEAN
