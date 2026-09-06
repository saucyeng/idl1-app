# L8x Task 4 — `save_track` command — **FULL-SUITE CHECKPOINT**

The create-and-edit command over the landed `write_track`. Thin: mint ids and
timestamps, validate, write, upsert one catalog row, report staleness.
TDD, ONE commit, then the four-task full suite.

**Depends on Task 3.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "pub fn validate_track" core/src/track_artifact/validate.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §3, §4, §7, Q4, Q5; C3 §3.2's
`save_track` entry as Task 1 wrote it; `tauri/src/commands/catalog.rs` in
full — the `*_via` seam, how `DataDir` state is taken, how `IpcError::from`
maps core errors, and how `rescan_tracks_via` decides "catalog exists ⇒
index, failure ⇒ warning"; `tauri/src/error.rs` (**you should need no new
`IpcErrorKind`** — confirm and say so); `tauri/src/lib.rs`'s `handler()`;
`core/src/store/lap_index.rs`'s `track_library_hash` and `load_track_library`;
`core/src/store/session_json.rs`'s `track_visits_library_hash` field;
`core/src/store/catalog.rs`'s `tracks` INSERT in `rebuild_catalog`.

## Where

- **Files:** `tauri/src/commands/catalog.rs`, `tauri/src/lib.rs`,
  `CHANGELOG.md`.

## Interfaces

```rust
/// C3 §3.2 `TrackDraft` — `save_track`'s argument. `track_id: None` creates.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct TrackDraft { /* the C3 fields, using the Task 2 wire mirrors */ }

/// C3 §3.2 `SaveTrackResult`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SaveTrackResult {
    pub track: TrackDetail,
    /// Sessions whose `track_visits_library_hash` no longer matches the
    /// library after this write. The UI offers `rescan_tracks` per id.
    pub stale_session_ids: Vec<String>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn save_track(track: TrackDraft, data_dir: tauri::State<'_, DataDir>)
    -> Result<SaveTrackResult, IpcError>;
```

Add a `save_track_via(data_dir: &Path, draft: TrackDraft, now_ms: i64,
new_id: &str) -> Result<SaveTrackResult, IpcError>` seam so the tests are
deterministic; the `#[tauri::command]` wrapper supplies
`SystemTime::now()` and `Uuid::new_v4()` and stays trivially thin.

## Key logic

1. Convert `TrackDraft`'s wire mirrors into the core domain `Track`
   (decimal degrees — Task 2's `From` impls, inverted).
2. **Create** (`track_id: None`): id = the supplied UUID v4 in canonical
   36-char lowercase-with-dashes form (C4 §2), `created_at_ms =
   updated_at_ms = now_ms`.
   **Edit** (`Some(id)`): the artifact must already exist — absent ⇒
   `not_found`. Read it, keep its `created_at_ms` verbatim, set
   `updated_at_ms = now_ms`. Never let the caller set either timestamp.
3. `validate_track` ⇒ `invalid_argument` carrying the error's `field` in
   `detail`. Validate **before** any filesystem write.
4. `write_track` (C4 §4 atomic, last-write-wins — **no `conflict` kind**,
   consistent with R59 Q1(a); say so in a comment).
5. Catalog: **only when `catalog.sqlite` is a file**, upsert the one
   `tracks` row (`INSERT ... ON CONFLICT(track_id) DO UPDATE`, or delete +
   insert inside one transaction if that matches the landed style — SQL
   stays in `core::store::catalog`, R68: add the helper there if none fits,
   and say in the report that you did). A catalog failure goes into
   `warnings`, never fails the call.
6. `stale_session_ids`: recompute `track_library_hash` over the library
   after the write, then list every `sessions/<id>/session.json` whose
   `track_visits_library_hash` differs. An unreadable `session.json` is a
   warning, not a failure. Do **not** call `reindex_laps` (PLAN §4).
7. Register in `handler()`.

## Tests

- `save_track_via — no track_id — mints the id, both timestamps, writes the
  artifact, returns it`.
- `save_track_via — an existing id — preserves created_at_ms and bumps
  updated_at_ms`.
- `save_track_via — an unknown id — not_found and nothing is written`.
- `save_track_via — an empty name — invalid_argument and nothing is written`.
- `save_track_via — no catalog.sqlite — Ok and no catalog is created`.
- `save_track_via — with a catalog — the tracks row matches, and a second
  save updates that row rather than duplicating it`.
- `save_track_via — a session stamped with the old library hash — its id is
  in stale_session_ids`; and a session stamped with the *post-write* hash is
  not.
- `save_track_via — a caller-supplied created_at_ms — ignored`.

## COMPUTE RULES

While working: `cargo test -p idl-rs-tauri commands::catalog::`, foreground,
non-zero `passed`. `cargo check -p idl-rs-tauri`. If you add a `pub` fn to
`core::store::catalog`, also `cargo check -p idl-rs-cli --tests`.

**FULL SUITE after the commit** (four tasks, CLAUDE.md §8), foreground,
once, tee'd:
```
cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
```
Report every result line verbatim. A failure is STOP-and-report.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `TrackDraft` → domain conversion.
      4. `save_track_via` + `save_track`. 5. `handler()` registration.
      6. Filter green. 7. `cargo check -p idl-rs-tauri` clean. 8. NUL check.
      9. `CHANGELOG.md` bullet. 10. Commit `tauri: save_track (C3 3.2)`.
- [ ] 11. Full suite; report every line.

## Do not

- Do not add an `IpcErrorKind`, and do not raise `conflict`.
- Do not call `reindex_laps` or `rescan_tracks` from this command.
- Do not put SQL in `idl-rs-tauri` (R68).
- Do not edit `app/src/` — report the TypeScript the lead must add instead.

## Spec discipline

**No spec change needed** — Task 1 wrote the entry. Report any place the
landed behaviour differs from what Task 1 committed; the lead amends.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the targeted test result line with its
`passed` count; `cargo check` results; every full-suite line verbatim;
confirmation no `IpcErrorKind` was added; whether you added a catalog helper
in core and its signature; the exact `app/src/ipc/catalog.ts` declarations
the lead must add; anything needing a ruling.
