# L8x Task 5 — `delete_track` command

Removes one track from the library and its catalog row. Deliberately does
**not** rewrite any `session.json`. TDD, ONE commit.

**Depends on Task 4.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "pub fn save_track" tauri/src/commands/catalog.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §4, Q5; C3 §3.2's `delete_track` entry as
Task 1 wrote it; `tauri/src/commands/catalog.rs`'s `delete_session_via`
(the closest precedent — file removal plus catalog rows, `not_found` first,
touch nothing on failure) and your own Task 4 `save_track_via` (reuse its
`stale_session_ids` helper — extract it if it is still inline);
`core/src/track_artifact/write.rs`'s `delete_track` from Task 3;
`core/src/store/catalog.rs`'s `laps.track_id ... ON DELETE SET NULL` and
its `delete_session` as the deletion-helper style reference.

## Where

- **Files:** `tauri/src/commands/catalog.rs`, `tauri/src/lib.rs`,
  `core/src/store/catalog.rs` (only if a `delete_track` row helper is
  needed — SQL stays in core, R68), `CHANGELOG.md`.

## Interfaces

```rust
/// C3 §3.2 `DeleteTrackReport`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeleteTrackReport {
    pub track_id: String,
    /// Sessions whose `track_visits_library_hash` no longer matches the
    /// library after the delete — their cached visits may name this track.
    /// The UI offers `rescan_tracks` per id; nothing is rewritten here.
    pub stale_session_ids: Vec<String>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn delete_track(track_id: String, data_dir: tauri::State<'_, DataDir>)
    -> Result<DeleteTrackReport, IpcError>;
```
Same `*_via` seam as Task 4.

## Key logic

- An absent `tracks/<id>.idl0t` ⇒ `not_found`, checked **first**, before any
  catalog work — matching `delete_session_via`.
- Core's `delete_track` removes the artifact. Then, **only when
  `catalog.sqlite` is a file**, delete the `tracks` row. `laps.track_id` is
  already `ON DELETE SET NULL`, so lap rows survive unattributed: assert
  that in a test rather than deleting laps yourself.
- `stale_session_ids` is computed the same way as Task 4's, over the library
  as it stands *after* the delete.
- `session.json` is **not** rewritten. Say why in the doc comment: idl0 left
  stale `TrackVisit` references too (`track_provider.dart`'s `deleteTrack`
  note, SPEC §12.3), the hierarchy view skips visits whose `track_id` no
  longer resolves, and Rescan tracks is the user-driven repair. Rewriting
  every session inside a delete is unbounded work behind one button.
- A catalog failure goes into `warnings`, never fails the call.
- Register in `handler()`.

## Tests

- `delete_track_via — an existing track — the artifact is gone and Ok`.
- `delete_track_via — an unknown id — not_found and nothing is removed`.
- `delete_track_via — with a catalog — the tracks row is gone and a lap row
  that referenced it survives with a NULL track_id`.
- `delete_track_via — no catalog.sqlite — Ok and no catalog is created`.
- `delete_track_via — a session whose stamp names the deleted library — its
  id is in stale_session_ids and its session.json is byte-identical
  afterwards` (the "we rewrite nothing" guarantee, asserted, not assumed).
- `delete_track_via — an id containing a path separator — not_found or io,
  and a decoy file outside tracks/ survives`.

## COMPUTE RULES

While working: `cargo test -p idl-rs-tauri commands::catalog::`, foreground,
non-zero `passed`. `cargo check -p idl-rs-tauri`; plus
`cargo check -p idl-rs-cli --tests` if you added a `pub` fn to core.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `delete_track_via` + `delete_track`.
      4. Catalog row helper in core if needed. 5. `handler()` registration.
      6. Filter green. 7. `cargo check` clean. 8. NUL check.
      9. `CHANGELOG.md` bullet. 10. Commit `tauri: delete_track (C3 3.2)`.

## Do not

- Do not rewrite `session.json`, and do not call `reindex_laps`.
- Do not delete `laps` rows by hand — the FK rule owns that.
- Do not add an `IpcErrorKind`.
- Do not edit `app/src/`.

## Spec discipline

**No spec change needed.** If the `ON DELETE SET NULL` behaviour differs
from what you expect at runtime, STOP and report — a difference there is a
C4 §5 correction, not something to code around.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the test result line with its `passed`
count; `cargo check` results; confirmation that the surviving lap row's
`track_id` really was NULL (quote the assertion); confirmation that
`session.json` was byte-identical; the `app/src/ipc/catalog.ts` declaration
the lead must add; anything needing a ruling.
