# L8x Task 3 — core: track validation + `delete_track`

The pure half of the track write path: what makes a `Track` saveable, and
removing one from the library. No clock, no UUID, no Tauri. TDD, ONE commit.

**Depends on Task 2.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "pub lap_timing: Option" core/src/store/catalog_read.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §3, §4, Q6; `core/src/track_artifact/
write.rs` in full (`write_track`, `TrackWriteError`, the `based_on` hash
argument to `write_atomic_with_retry`); `core/src/track_artifact/model.rs`'s
`Track`; `core/src/laps/model.rs`'s `Gate`; `core/src/store/atomic.rs`'s
error type; any landed `*ErrorKind` enum in core as a style reference for
the new one (`ImportErrorKind` in `store/import.rs` is closest).

## Where

- **Files:** `core/src/track_artifact/validate.rs` (new),
  `core/src/track_artifact/mod.rs`, `core/src/track_artifact/write.rs`,
  `CHANGELOG.md`.

## Interfaces

```rust
/// Why a `Track` cannot be saved (C3 §3.2 `save_track` ⇒ `invalid_argument`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackValidationErrorKind {
    /// `name` is empty after trimming.
    EmptyName,
    /// A sector gate or neutral zone has an empty name after trimming.
    EmptyChildName,
    /// A coordinate is non-finite, or outside ±90 (lat) / ±180 (lon) degrees.
    CoordinateOutOfRange,
    /// A gate's two endpoints are identical — it can never be crossed.
    DegenerateGate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackValidationError {
    pub kind: TrackValidationErrorKind,
    /// Which part of the track failed, e.g. `"sector_gates[1].gate"` —
    /// the UI puts the message beside the right field.
    pub field: String,
    pub message: String,
}

/// Validates a draft track before [`write_track`]. Decimal degrees
/// throughout (R27) — this runs on the domain type, never the wire DTOs.
pub fn validate_track(track: &Track) -> Result<(), TrackValidationError>;

/// Removes `<data_root>/tracks/<track_id>.idl0t`. `Ok(false)` when the file
/// was already absent — not an error; the caller decides whether that is
/// `not_found`. Touches no catalog and no `session.json`.
pub fn delete_track(data_root: &Path, track_id: &str) -> Result<bool, TrackWriteError>;
```

## Key logic

- Validation walks: `name`; `lap_timing`'s one or two gates; every
  `sector_gates[i].name` + `.gate`; every `neutral_zones[i].name` + `.enter`
  + `.exit`. `reference_polyline` fixes are **also** range-checked (a bad
  fix would corrupt visit detection), but an **empty** polyline is legal —
  SPEC §16.6's `.gpx` import path and §16.2.a's "no lap timing" both allow
  a track with almost nothing in it.
- First failure wins; the error names the field path. Do not collect.
- **Duplicate sector or neutral-zone names are allowed** (PLAN Q6): the name
  is a display label, not a key. Do not add a uniqueness rule.
- `delete_track` must reject a `track_id` containing a path separator or
  `..` before joining — return `TrackWriteErrorKind::Io` with a message
  naming the id. The same guard belongs nowhere else; `write_track` gets it
  too, in this task, since it joins the same way.
- No `std::time`, no `uuid`, no randomness in this file. The command layer
  mints those (PLAN §3).

## Tests

- `validate_track — empty and whitespace-only name — EmptyName`.
- `validate_track — a sector gate named "" — EmptyChildName naming the index`.
- `validate_track — latitude 91 / longitude -181 / NaN — CoordinateOutOfRange`
  (one case each; assert the `field` string).
- `validate_track — a circuit gate whose endpoints are equal — DegenerateGate`.
- `validate_track — a track with no timing and an empty polyline — Ok`.
- `validate_track — two sectors sharing a name — Ok` (locks PLAN Q6 in).
- `delete_track — an existing artifact — Ok(true) and the file is gone`.
- `delete_track — an absent id — Ok(false) and nothing else is removed`.
- `delete_track — an id containing a path separator — Io, nothing removed`
  (seed a decoy file outside `tracks/` and assert it survives).
- `write_track — an id containing ".." — Io, nothing written`.

## COMPUTE RULES

While working: `cargo test -p idl-rs track_artifact`, foreground, non-zero
`passed`. New `pub` symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `validate.rs` + `mod.rs` export.
      4. `delete_track` + the shared id guard in `write.rs`. 5. Filter green.
      6. `cargo check -p idl-rs-cli --tests` clean. 7. NUL check.
      8. `CHANGELOG.md` bullet. 9. Commit
      `core: track validation and delete_track (L8x)`.

## Do not

- Do not touch the catalog, `session.json`, or `tmp/quarantine/`.
- Do not enforce name uniqueness.
- Do not add a `Clock` trait or take a `now_ms` argument — this file has no
  concept of time.

## Spec discipline

**No spec change needed** — Task 1 wrote `save_track`'s `invalid_argument`
row. If a validation rule you find necessary is not implied by C3 §3.2 or
SPEC §16.2, STOP and ask rather than inventing it.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the test result line with its `passed`
count; the `cargo check -p idl-rs-cli --tests` result; the exact
`TrackValidationErrorKind` variants shipped; whether `write_track` needed
the id guard added or already had one; anything needing a ruling.
