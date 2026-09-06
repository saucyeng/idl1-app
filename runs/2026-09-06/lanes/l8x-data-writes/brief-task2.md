# L8x Task 2 — typed `TrackDetail` (closes C3 §6 open question 10)

`get_track` currently lifts four fields out of the raw `.idl0t` bytes as
`serde_json::Value`, so the UI receives degrees × 1e7 under wire field names.
Replace them with the pinned decimal-degree types. TDD, ONE commit.

**Depends on Task 1** (the shapes are in C3 §3.2 after it).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "interface TrackDraft" docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §3, §7, Q3; C3 §3.2's revised
`TrackDetail` block as Task 1 wrote it; `core/src/track_artifact/model.rs`
in full — especially why the wire DTOs divide by `1e7` rather than
multiplying by `1e-7`, and that `Track`/`Gate`/`GpsFix` are already decimal
degrees (R27); `core/src/laps/model.rs`'s `Gate`, `LapTiming`, `SectorGate`,
`NeutralZone`; `core/src/store/catalog_read.rs`'s `TrackDetail` and
`get_track`; `tauri/src/commands/catalog.rs`'s `TrackDetail` +
`From<catalog_read::TrackDetail>` + `get_track_via`.

## Where

- **Files:** `core/src/store/catalog_read.rs`,
  `tauri/src/commands/catalog.rs`, `CHANGELOG.md`.

## Interfaces

```rust
// core/src/store/catalog_read.rs — TrackDetail's four opaque fields become
// the domain types, taken from the parsed `Track`, not re-lifted from JSON.
pub struct TrackDetail {
    pub track_id: String,
    pub name: String,
    pub venue_name: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub lap_timing: Option<crate::laps::model::LapTiming>,
    pub neutral_zones: Vec<crate::laps::model::NeutralZone>,
    pub sector_gates: Vec<crate::laps::model::SectorGate>,
    pub reference_polyline: Vec<crate::gps::GpsFix>,
}
```

`get_track` then reads once (`read_track`) and moves the parsed `Track`'s
fields across. Delete the second `std::fs::read` + `serde_json::from_slice`
and both `opt_or_*` closures — they exist only to lift the untyped fields.

## Key logic

- **Serde shapes live in `idl-rs-tauri`, not core.** Core's `laps::model`
  types stay free of wire derives. `tauri/src/commands/catalog.rs` gains
  mirror `#[derive(serde::Serialize)]` structs `GateWire`, `SectorGateWire`,
  `NeutralZoneWire`, `GpsFixWire` and a `LapTimingWire` enum tagged
  `#[serde(tag = "kind", rename_all = "snake_case")]`, each with a
  `From<&core type>`. This is the pattern `TrackSummary`/`TrackDetail`
  already use. Field names are exactly C3's: `lat1`/`lon1`/`lat2`/`lon2`,
  `timestamp_ms`/`lat`/`lon`, `circuit`/`point_to_point`.
- `LapTiming::Circuit` has no `name` in the engine (`model.rs` drops the
  wire gate name on read). C3's shape has none either. Do not invent one.
- Nothing else in the workspace reads these four fields — confirm with
  `grep -rn "lap_timing\|reference_polyline" core/src tauri/src cli/src`
  and say so in the report.

## Tests

- `get_track — a seeded .idl0t with circuit timing — lap_timing is Circuit
  with decimal-degree endpoints` (the wire holds `x1e7`; assert the decoded
  value, e.g. `501163000.0` on the wire ⇒ `50.1163`).
- `get_track — point-to-point timing — both gates decode`.
- `get_track — a track with no lap_timing — lap_timing is None`.
- `get_track — sector gates and neutral zones — names and gates survive`.
- `get_track — reference polyline — timestamp_ms, lat, lon decode`.
- In `commands/catalog.rs`: `get_track_via — serialised TrackDetail — field
  names match C3` (assert on `serde_json::to_value` keys, including the
  `"kind": "circuit"` tag).

## COMPUTE RULES

While working: `cargo test -p idl-rs store::catalog_read`, foreground,
non-zero `passed`; then `cargo test -p idl-rs-tauri commands::catalog::`.
`TrackDetail` is a `pub` struct in core, so also run
`cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Core `TrackDetail` retyped, `get_track`
      simplified to one read. 4. Tauri wire mirrors + `From` impls.
      5. Both filters green. 6. Both `cargo check`s clean. 7. NUL check.
      8. `CHANGELOG.md` bullet. 9. Commit
      `core+tauri: type TrackDetail's gate fields (C3 6 item 10)`.

## Do not

- Do not derive serde on any `core::laps::model` or `core::gps` type.
- Do not keep the raw-JSON lift "for compatibility" — one shape, not two.
- Do not touch `app/src/`; the TS types are a lead shell task (PLAN §8).

## Spec discipline

**No spec change needed** — Task 1 already wrote the shape. If the landed
types cannot express what Task 1 wrote, STOP and report; do not amend C3
yourself.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with `passed`
counts; both `cargo check` results; the grep proving nothing else read the
untyped fields; the serialised JSON of one `TrackDetail` (compact) so the
lead can check it against C3; anything needing a ruling.
