# L2b Task 1 — implementer brief (`store::lap_index` pure core)

You build the pure half of lap indexing: load the track library, hash it,
compute visits and their laps, renumber session-wide. **No file writes in this
task** — `session.json` is Task 2. TDD, ONE commit, then report.

## GATE — verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "pub fn detect_visits" core/src/tracks/detect.rs
grep -c "pub fn renumber_session_laps" core/src/laps/renumber.rs
```
All three must succeed / return `>= 1`. If any fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l2b-laps`,
  branch `l2b-laps`. Do NOT push. Do NOT touch `docs/` except the SPEC
  section named under "Spec discipline".
- **Files:** new `core/src/store/lap_index.rs`; register it in
  `core/src/store/mod.rs`. Nothing else.

## Files to read first (do not restate them in your report)

`CLAUDE.md`; this lane's `PLAN.md` §2 (the pipeline and the four decisions);
`core/src/laps/{mod.rs,model.rs,detect.rs,renumber.rs}`;
`core/src/tracks/{mod.rs,detect.rs}`; `core/src/track_artifact/{mod.rs,read.rs,model.rs}`
(the `Track` domain type and `Track::track_ref`);
`core/src/store/session_json.rs` (`LapJson`, `SectorJson`, `NeutralZoneVisitJson`,
`TrackVisitJson` — you construct these, you do not change them);
`core/src/session/handle.rs` `from_session`/`epoch_ms_to_time_secs`;
IDL0_SPEC §17.3, §17.4, §17.5, §17.7; C1 §6's `laps[]`/`track_visits[]` block.
Reference semantics only (read-only, different repo):
`idl0-app/app/lib/providers/track_provider.dart`'s `trackLibraryHash` and
`idl0-app/app/lib/providers/runs_provider.dart`'s `_visitsWithLaps`.

## Interfaces

```rust
/// Opaque stamp over the track library; callers must not parse it.
pub fn track_library_hash(tracks: &[Track]) -> String;

/// Every `<data_root>/tracks/*.idl0t`, sorted by track id. A missing
/// `tracks/` directory is `Ok(vec![])`, not an error. An unreadable or
/// version-rejected artifact is skipped into `LapIndex::warnings`.
pub fn load_track_library(data_root: &Path) -> Result<(Vec<Track>, Vec<String>), LapIndexError>;

/// Deterministic visit identity (see PLAN Q4).
pub fn visit_id(track_id: &str, start_ms: i64, end_ms: i64) -> String;

pub struct LapIndex {
    pub track_visits: Vec<TrackVisitJson>,
    pub laps: Vec<LapJson>,
    pub track_library_hash: String,
    pub warnings: Vec<String>,
}

/// Pure over `handle` + `tracks`: no filesystem access, no clock, no RNG.
pub fn compute_lap_index(
    handle: &SessionHandle,
    tracks: &[Track],
    ignored_lap_numbers: &[u32],
) -> LapIndex;

pub struct LapIndexError { /* kind + message, CLAUDE.md §5 — never Err(String) */ }
pub enum LapIndexErrorKind { Io, Track }
```

## Key logic

- `track_library_hash` — port idl0's `trackLibraryHash` exactly: build
  `"<track_id>:<updated_at_ms>"` per track, **sort the strings**, join with
  `'|'`, `sha1`, prefix `"sha1:"`. Use the crate's existing hashing dependency;
  if only `sha2` is available, use `sha256` and prefix `"sha256:"` — say which
  in your report. An empty library hashes the empty string, not `""` special-cased.
- `visit_id` — lowercase hex of `sha1("<track_id>:<start_ms>:<end_ms>")`,
  truncated to 16 chars. Same digest family as `track_library_hash`.
- `compute_lap_index`:
  1. `detect_visits(handle, &refs, VisitParams::default())` — no overrides
     (IDL0_SPEC §17.3 says tuning lives once in the engine).
  2. Per window, resolve its `Track` by `track_id`. A window whose track is
     missing from `tracks`, or whose track has `timing: None`, yields a
     `TrackVisitJson` with `laps: []` and a warning — the visit is still
     recorded (IDL0_SPEC §17.4's "visits present, laps absent" state).
  3. Otherwise `detect_laps(handle, timing, &t.sector_gates, &t.neutral_zones,
     Some((window.start_ms, window.end_ms)))`, converting each
     `laps::model::Lap` into a `LapJson` (and `Sector`→`SectorJson`,
     `NeutralZoneVisit`→`NeutralZoneVisitJson`) field for field. `Lap::start_ms`
     is UTC ms and maps to `LapJson::start_timestamp_ms`.
  4. `renumber_session_laps(&track_visits, ignored_lap_numbers)` for the
     top-level `laps[]`. Take `RenumberedLap::lap` — the renumbered `LapJson`.
     **Per-visit `laps[]` keep their per-visit numbering** (`renumber`'s own doc
     comment is explicit that per-visit numbers are not the session-wide
     identity); only the top-level array is renumbered.
- Empty everything when `tracks` is empty or no window survives — `LapIndex`
  with empty vectors and the hash still set. Never an error.

## Tests (A/A/A, `thing — condition — result`)

Build handles with `SessionHandle::from_channels` carrying synthetic
`GPS_Latitude`/`GPS_Longitude`/`GPS_EpochMs` (copy the fixture idiom from
`core/src/laps/detect.rs`'s and `core/src/tracks/detect.rs`'s own test modules).

- `track_library_hash` is order-independent (two shuffled slices, same hash).
- `track_library_hash` changes when one track's `updated_at_ms` changes.
- `visit_id` is stable across calls and differs for different bounds.
- `load_track_library` on a root with no `tracks/` dir → `Ok((vec![], vec![]))`.
- `load_track_library` skips an unparseable `.idl0t` into warnings and still
  returns the readable ones.
- `compute_lap_index` — one circuit track the session laps three times →
  three `laps[]` entries, `lap_number` 1..3, one `track_visits` entry.
- `compute_lap_index` — a track with `timing: None` → visit recorded, `laps: []`,
  one warning.
- `compute_lap_index` — a window whose `track_id` is absent from `tracks` →
  visit recorded, `laps: []`, one warning.
- `compute_lap_index` — empty track library → all vectors empty, hash set.
- `compute_lap_index` — two visits to two tracks → top-level `laps[]` renumbered
  in start-time order across both, per-visit numbering restarts at 1.

## COMPUTE RULES

`cargo test -p idl-rs store::lap_index::`, foreground, non-zero `passed`.
`cargo check -p idl-rs-cli --tests` (this task adds `pub` items to `core`).
No `cargo fmt`, no `--workspace`, no bare `cargo test`. One cargo process.

## Steps

- [ ] 1. Confirm the gate; open the worktree.
- [ ] 2. Write the SPEC section (spec-first, see below).
- [ ] 3. Write failing tests.
- [ ] 4. Implement `lap_index.rs`; register in `store/mod.rs`.
- [ ] 5. `cargo test -p idl-rs store::lap_index::` — non-zero `passed`.
- [ ] 6. `cargo check -p idl-rs-cli --tests` clean.
- [ ] 7. CHANGELOG bullet. Commit:
      `core: store::lap_index — track library hash, visits, per-visit laps (pure)`.

## Do not

- Do not write any file from `compute_lap_index` — it takes a handle and a
  slice and returns a struct. Task 2 owns all I/O.
- Do not change `laps/`, `tracks/`, `track_artifact/` or `session_json.rs`.
  If one of them is genuinely wrong, STOP and report (CLAUDE.md §1).
- Do not invent `VisitParams` overrides.
- Do not renumber the per-visit `laps[]`.

## Spec discipline

**spec-first.** Before code, write the idl1 app-side lap section in
`docs/IDL0_SPEC.md` replacing §17.4's Dart-`Workspace` wording: detection runs
at import over the track library, results cache in `session.json`
(`track_visits[].laps` per visit, top-level `laps[]` renumbered session-wide),
the cache key is `track_visits_library_hash` plus `lap_detector_version`
(the latter lands in Task 2 — say so). Keep §17.3/§17.5/§17.7 as they are.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the `cargo test -p idl-rs store::lap_index::`
result line with its `passed` count; `cargo check -p idl-rs-cli --tests` result;
which digest you used and why; the SPEC section you wrote (path + heading);
anything ambiguous you resolved and how, or that needs a lead ruling.
