# L8w Task 5 — implementer brief (Catalog writes: `save_session_metadata`, `delete_session`, C3 §3.2)

You are the implementer for L8w Task 5: the first two Catalog-group write
commands. `save_session_metadata` replaces `session.json`'s nine editable
fields with a read-hash-write, last-write-wins pattern (ruling R59 Q1(a));
`delete_session` removes a session's directory, its shared blob (when
unreferenced elsewhere), and its catalog rows. TDD, ONE commit, then
report.

## GATE — verify before opening the worktree

Same gate as Tasks 1–4:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`. Independent of Tasks 2–4's files; if
  their commits are already on the branch, build on top of them.
- Work ONLY there. Do NOT touch the shared checkout beyond reading files
  named below. Do NOT edit `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/catalog.rs`, `tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; the plan's Task 5 section
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`/`review-STANDING.md`; C3 §3.2's
  `save_session_metadata`/`delete_session` entries
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`) — quoted
  below; ruling R59 Q1 (`runs/2026-09-03/decisions.md`, "Q1 → (a)") — the
  read-hash-write concurrency check lives *inside* the command, no
  `conflict` kind, no signature change; the landed
  `idl_rs::store::session_json` module (`rust/core/src/store/session_json.rs`,
  on `main`) in full — `SessionJson` (all fields; you replace exactly nine:
  `rider, bike, bike_comment, venue_name, event_name, event_session,
  short_comment, long_comment, tag`, and leave `laps, track_visits,
  reference_lap_number, ignored_lap_numbers, main_lap_number,
  overlay_lap_key, starred_lap_number, lap_gates, sector_gates,
  bike_profile_snapshot, schema_version, session_id` untouched),
  `read_session_json`/`write_session_json` (the latter's `based_on_hash:
  Option<&str>` parameter is exactly R59 Q1(a)'s mechanism — you compute it
  yourself by hashing the bytes you just read, never taking it as a command
  argument); `idl_rs::store::atomic::sha256_hex`'s signature
  (`rust/core/src/store/atomic.rs`); the landed
  `idl_rs::store::catalog_read::get_session` (`rust/core/src/store/catalog_read.rs`)
  in full — its not-found check (`sessions/<id>/` must be a directory, else
  `CatalogErrorKind::NotFound`) is the exact check both this task's
  commands reuse, and its `SessionDetail.blob_sha256` is what
  `delete_session_via` reads before removing anything; the landed
  `idl_rs::store::catalog::{open_catalog, ...}` schema
  (`rust/core/src/store/catalog.rs`) — read the `CREATE TABLE` block for
  `sessions`/`laps`/`lap_summary`: `laps.session_id` is
  `REFERENCES sessions(session_id) ON DELETE CASCADE` and
  `lap_summary`'s foreign key onto `laps` is likewise `ON DELETE CASCADE`,
  so **one `DELETE FROM sessions WHERE session_id = ?1` removes all three
  tables' rows for this session** — you do not need three separate
  `DELETE` statements; `idl_rs::store::parquet::read_session_metadata`'s
  signature (`rust/core/src/store/parquet.rs`) — `SessionParquetMetadata
  { blob_sha256, .. }`, used to check every *other* session's blob before
  removing a shared blob; `tauri/src/commands/catalog.rs` in full — you are
  extending this file; its existing `SessionDetail`/`From<catalog_read::
  SessionDetail>` impl is `save_session_metadata`'s return type (reuse it,
  do not redefine); its test module's `temp_root()`/`write_full_session()`
  helpers (copy `write_full_session`'s shape for this task's own fixtures —
  it already writes a blob, `session.json`, and `data.parquet` for one
  session; you'll want a variant that also runs `core_rebuild_catalog` so
  the catalog rows this task deletes actually exist to delete);
  `app/src/routes/pages/Data/ipcStubs.ts`'s `saveSessionMetadata`/
  `deleteSession` stubs (read-only — the TS argument/return shapes; do not
  edit).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override with `-j`). While working: `cargo test -p idl-rs-tauri
commands::catalog::`, foreground, non-zero `passed` (this filter now covers
every existing `catalog.rs` test plus this task's new ones — expect a
larger combined count, that's correct). No `cargo fmt`, no `cargo
tarpaulin`, no `cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (two new commands
registered in `handler()`). No `core` `pub` signature changes in this task
(everything needed — `write_session_json`'s `based_on_hash`,
`read_session_metadata`, the catalog schema's cascades — is already
landed), so `cargo check -p idl-rs-cli --tests` is not required alone.

## C3 §3.2 (quoted — the two entries this task implements)

> **`save_session_metadata(session_id: string, metadata: SessionMetadataPatch)`**
> Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).
> Satisfies wave-2 need L7-1.
> ```ts
> interface SessionMetadataPatch {
>   rider: string; bike: string; bike_comment: string;
>   venue_name: string; event_name: string; event_session: string;
>   short_comment: string; long_comment: string; tag: string;
> }
> ```
> Return: `SessionDetail`.
> Reads `session.json`, replaces exactly those nine fields, leaves every
> other key (`laps`, `track_visits`, the lap-flag fields,
> `bike_profile_snapshot`, `schema_version`) untouched, writes through
> `store::session_json::write_session_json` (C4 §4 atomic write), then
> re-reads and returns `catalog_read::get_session`'s `SessionDetail` so the
> pane redraws from canonical truth rather than from what it hoped it
> wrote. Unknown keys in `metadata` are ignored, not rejected. The catalog
> row is **not** re-indexed by this command; `rebuild_catalog` reconciles
> it (C4 §5).
> The command computes the optimistic-concurrency check internally (read,
> hash, write) rather than taking a `based_on_hash` argument —
> last-write-wins inside the command, no `conflict` kind raised (ruling
> R59 Q1(a); revisit when L11 LAN sync makes concurrent edits real).
> Errors: `not_found` (unknown `session_id`), `invalid_argument` (a field
> that is not a string), `io`, `internal`.
>
> **`delete_session(session_id: string, delete_blob: boolean)`**
> Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).
> Satisfies wave-2 need L7-3.
> Return: `void`.
> Removes `<data>/sessions/<session_id>/` recursively and the catalog rows
> for that session. `delete_blob: true` additionally removes the blob at
> `blobs/sha256/<2>/<62>` named by the session's `blob_sha256`; `false`
> keeps it (idl0's "Forget session"). A blob still referenced by another
> session is never removed even when `delete_blob: true` — blobs are
> content-addressed and shared by construction (C4 §3).
> Errors: `not_found` (unknown `session_id`), `io`, `internal`.

**Note on `SessionMetadataPatch`'s "unknown keys ignored, not rejected" and
"`invalid_argument` (a field that is not a string)":** the Rust argument
type below is a typed struct (`String` fields, not a JSON bag), so an
unknown key or a non-string value for a known key is structurally
impossible to receive — Tauri's own argument deserialisation rejects it
before your command body ever runs. Document this in the struct's own doc
comment (as the plan's own text already anticipates) rather than writing a
test for "unknown keys ignored" that has nothing to exercise.

## Interfaces

```rust
/// C3 §3.2 `SessionMetadataPatch`. A typed struct, not a JSON bag — an
/// unknown key or a non-string value for a known key is a Tauri-level
/// argument-deserialisation rejection, never reaches this command's body.
/// C3's "unknown keys ignored" and "invalid_argument for a non-string
/// field" wording describes the JSON-bag case this typed argument makes
/// structurally moot.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SessionMetadataPatch {
    pub rider: String,
    pub bike: String,
    pub bike_comment: String,
    pub venue_name: String,
    pub event_name: String,
    pub event_session: String,
    pub short_comment: String,
    pub long_comment: String,
    pub tag: String,
}

#[tauri::command]
pub fn save_session_metadata(
    session_id: String,
    metadata: SessionMetadataPatch,
    data_dir: tauri::State<'_, DataDir>,
) -> Result<SessionDetail, IpcError>;

#[tauri::command]
pub fn delete_session(
    session_id: String,
    delete_blob: bool,
    data_dir: tauri::State<'_, DataDir>,
) -> Result<(), IpcError>;
```

`SessionDetail` above is this file's existing struct (from `get_session`) —
reuse it, do not redefine.

## Key logic — `save_session_metadata_via`

```rust
fn save_session_metadata_via(data_dir: &Path, session_id: &str, metadata: SessionMetadataPatch) -> Result<SessionDetail, IpcError> {
    let session_dir = data_dir.join("sessions").join(session_id);
    if !session_dir.is_dir() {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("session {session_id} not found")));
    }
    let sj_path = session_dir.join("session.json");
    let mut doc = idl_rs::store::session_json::read_session_json(&sj_path).map_err(map_session_json_error)?;
    let current_bytes = std::fs::read(&sj_path).map_err(|e| IpcError::new(IpcErrorKind::Io, e.to_string()))?;
    let current_hash = idl_rs::store::atomic::sha256_hex(&current_bytes);

    doc.rider = metadata.rider;
    doc.bike = metadata.bike;
    doc.bike_comment = metadata.bike_comment;
    doc.venue_name = metadata.venue_name;
    doc.event_name = metadata.event_name;
    doc.event_session = metadata.event_session;
    doc.short_comment = metadata.short_comment;
    doc.long_comment = metadata.long_comment;
    doc.tag = metadata.tag;

    idl_rs::store::session_json::write_session_json(data_dir, session_id, &doc, Some(&current_hash))
        .map_err(map_session_json_error)?;

    Ok(catalog_read::get_session(data_dir, session_id)?.into())
}
```

The not-found check (`session_dir.is_dir()`) matches
`catalog_read::get_session`'s own check exactly, by design (the plan
explicitly says so) — the two checks are duplicated here rather than
delegated because `read_session_json`/`write_session_json` need the
directory to exist before `get_session` is ever called, and calling
`get_session` first just to get its not-found check (then discarding the
result and re-reading `session.json` a second time) would be strictly more
I/O for no benefit. Note this duplication in your report if a reviewer
flags it as "reinventing an existing check" — it is a deliberate, matching
duplication, not a drift risk (both check the exact same condition:
`sessions/<id>/` is a directory).

The `based_on_hash: Some(&current_hash)` passed to `write_session_json`
means a genuinely concurrent external write in the gap between this
function's `read_session_json`/`std::fs::read` and its own
`write_session_json` call *would* surface as a `RenameConflict` — map that
case to `IpcErrorKind::Io` (not a new `conflict` kind — R59 Q1(a) is
explicit that this command never raises `conflict`; treat
`AtomicWriteError::RenameConflict` the same as any other write failure
here, folded to `io`). This is expected to be effectively unreachable at
wave-2 single-user scale, not a case worth a dedicated test — a doc comment
noting it is enough (do not fabricate a test that races two threads to hit
it; if you find an easy deterministic way to trigger it, a test is welcome
but not required).

Write `map_session_json_error` once, reused by both commands' functions:

```rust
fn map_session_json_error(e: idl_rs::store::session_json::SessionJsonError) -> IpcError {
    use idl_rs::store::session_json::SessionJsonErrorKind;
    match e.kind {
        SessionJsonErrorKind::Io => IpcError::new(IpcErrorKind::Io, e.message),
        SessionJsonErrorKind::Parse | SessionJsonErrorKind::UnsupportedVersion => {
            IpcError::new(IpcErrorKind::Internal, e.message)
        }
    }
}
```
`Parse`/`UnsupportedVersion` fold to `internal` here (not a new
`session_json_*` `IpcErrorKind` family) because C3's error list for both
commands names only `not_found`, `io`, `internal` — a malformed
`session.json` on an existing session directory is an unexpected
programmer/data-integrity condition at this command boundary, not a
caller argument problem, matching C3 §2's folding rule's spirit for a
condition with no dedicated row. Flag this mapping choice in your report
so the lead can confirm it rather than silently assuming it.

## Key logic — `delete_session_via`

The plan gives this command's shape as: check existence, read
`blob_sha256` before removing anything, remove the session directory, then
(if `delete_blob`) check every *other* session for the same
`blob_sha256` before removing the blob, then delete the catalog's rows for
this session directly.

```rust
fn delete_session_via(data_dir: &Path, session_id: &str, delete_blob: bool) -> Result<(), IpcError> {
    let session_dir = data_dir.join("sessions").join(session_id);
    if !session_dir.is_dir() {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("session {session_id} not found")));
    }
    let blob_sha256 = catalog_read::get_session(data_dir, session_id)?.blob_sha256;

    std::fs::remove_dir_all(&session_dir).map_err(|e| IpcError::new(IpcErrorKind::Io, e.to_string()))?;

    if delete_blob {
        let still_referenced = other_session_dirs(data_dir, session_id)
            .filter_map(|dir| idl_rs::store::parquet::read_session_metadata(&dir.join("data.parquet")).ok())
            .any(|m| m.blob_sha256 == blob_sha256);
        if !still_referenced {
            let blob_path = idl_rs::store::blob::blob_path(data_dir, &blob_sha256);
            if blob_path.is_file() {
                std::fs::remove_file(&blob_path).map_err(|e| IpcError::new(IpcErrorKind::Io, e.to_string()))?;
            }
        }
    }

    let conn = idl_rs::store::catalog::open_catalog(&data_dir.join("catalog.sqlite"))?;
    conn.execute("DELETE FROM sessions WHERE session_id = ?1", rusqlite::params![session_id])
        .map_err(|e| IpcError::new(IpcErrorKind::Internal, e.to_string()))?;

    Ok(())
}
```

`other_session_dirs` is a small private helper you write: lists
`data_dir.join("sessions")`'s entries, filters out `session_id` itself and
anything that isn't a directory. Reading `data.parquet` for every *other*
session to check its `blob_sha256` is the plan's own explicitly-chosen
approach ("cheap, no full parquet load" — `read_session_metadata` reads
only the parquet file's metadata, not its row data); do not open the
catalog's `sessions.blob_sha256` column instead unless you find
`read_session_metadata` doesn't do what its doc comment says — the plan
picked the metadata-read path deliberately, over a catalog query, because
the catalog's own row for this session is about to be deleted in the same
call and querying it mid-delete is an ordering hazard the file-based check
avoids entirely.

**Why `DELETE FROM sessions` alone, not `rebuild_catalog`:** the `laps`/
`lap_summary` foreign keys are `ON DELETE CASCADE` (verify this yourself in
the `CREATE TABLE` block before relying on it — if either constraint is
missing or not `CASCADE` in the version you find on `main`, stop and report
rather than assuming), so one `DELETE` removes all three tables' rows for
this session. This is deliberately not a full `rebuild_catalog` call
(needlessly expensive per delete) — the plan is explicit that this is an
accepted, bounded divergence risk (`rebuild_catalog` remains available to
reconcile it if this hand-rolled delete ever drifts from truth). `rusqlite`
is already a dependency of `idl-rs` core (used throughout `catalog.rs`) —
import it in `commands/catalog.rs` the same way, or call through a small
`core`-side helper if one already exists for a single-row delete (check
`catalog.rs` first; if nothing fits, the inline `conn.execute` above,
built the same way `rebuild_catalog`'s own `INSERT`s are built in that
file, is the correct scope for this task — do not add a new `pub fn` to
`core` for a single `DELETE` statement unless the existing file's
conventions clearly call for one).

`idl_rs::store::blob::blob_path(data_root, sha256_hex) -> PathBuf` is
already `pub` and already implements C4 §3's `blobs/sha256/<2>/<62>` split
(verified: `rust/core/src/store/blob.rs`, `blob_path`, with its own test
`blob_path_splits_digest_two_and_sixty_two`) — use it directly, do not
hand-build the split.

## Tests (`_via` functions, temp `<data>` root, real catalog rows)

Use a `write_full_session`-style helper (copy `commands/catalog.rs`'s
existing one) extended to also call `core_rebuild_catalog(&root)` so
`sessions`/`laps`/`lap_summary` rows actually exist for the delete tests to
remove.

- `save_session_metadata_via` — replaces exactly the nine fields (assert
  each one changed to the new value) and **preserves** `laps`,
  `track_visits`, `bike_profile_snapshot`, `reference_lap_number`, and
  `schema_version` byte-for-byte (seed a `session.json` with non-default
  values for at least `laps` and `bike_profile_snapshot` before calling,
  assert they're unchanged after).
- `save_session_metadata_via` — unknown `session_id` → `not_found`.
- `save_session_metadata_via` — the returned `SessionDetail` matches a
  fresh `catalog_read::get_session` call (proving the "re-read, canonical
  truth" behaviour, not an echo of the argument).
- `delete_session_via` — `delete_blob: false` removes the session directory
  and the catalog's `sessions`/`laps`/`lap_summary` rows for it, but the
  blob file under `blobs/sha256/` still exists afterward.
- `delete_session_via` — `delete_blob: true` with no other session
  referencing the same blob removes the blob file too.
- `delete_session_via` — `delete_blob: true` with a **second** session
  sharing the same `blob_sha256` (write two sessions via
  `write_blob`/`write_session_parquet` using the identical bytes so they
  hash to the same blob, matching how `write_full_session`'s test helper
  already constructs a blob) keeps the blob file after deleting the first
  session.
- `delete_session_via` — unknown `session_id` → `not_found`, and confirm no
  file or catalog row for *any* session was touched (nothing partially
  applied).

Match `commands/catalog.rs`'s test module conventions exactly (its
`temp_root()`/`write_full_session()` helpers, A/A/A with blank lines, names
`thing — condition — result`).

## The task, in order

- [ ] **Step 1: Confirm the gate** and open/reuse the worktree.
- [ ] **Step 2: Write the failing tests** for both `_via` functions,
      extending this file's test-fixture helpers as needed.
- [ ] **Step 3: Implement** `SessionMetadataPatch`,
      `save_session_metadata_via`/`save_session_metadata`,
      `delete_session_via`/`delete_session`, `map_session_json_error`,
      `other_session_dirs`, in `tauri/src/commands/catalog.rs`.
- [ ] **Step 4: Register** — `commands::catalog::save_session_metadata,
      commands::catalog::delete_session,` added to `lib.rs`'s `handler()`
      list.
- [ ] **Step 5: Test** — `cargo test -p idl-rs-tauri commands::catalog::`,
      confirm non-zero `passed`.
- [ ] **Step 6: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 7: Commit** — explicit paths (not `git add -A`):
      `git add tauri/src/commands/catalog.rs tauri/src/lib.rs`
      — message
      `tauri: save_session_metadata (read-hash-write, R59 Q1a) + delete_session (C3 3.2)`.
      Single line, no AI attribution trailer.

## Do not

- Do not add a `based_on_hash` argument to `save_session_metadata`'s public
  signature — the concurrency check is entirely internal (R59 Q1(a)).
- Do not raise `IpcErrorKind::Conflict` from either command — neither one
  ever does, per R59 Q1(a) and C3's own error lists.
- Do not call `rebuild_catalog`/`rebuild_catalog_report` from inside either
  command — `save_session_metadata` explicitly leaves the catalog row
  stale until the next rebuild (C3's own text); `delete_session` does a
  direct row delete, not a rebuild (see Key logic above).
- Do not remove a blob that any other session's `data.parquet` still names,
  even when `delete_blob: true`.
- Do not touch `rust/core/src` — everything this task needs
  (`write_session_json`'s `based_on_hash`, `read_session_metadata`, the
  catalog's cascading foreign keys) is already landed.
- Do not edit `app/src/routes/pages/Data/ipcStubs.ts`.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (none new
here beyond what `SessionDetail` already documents); typed errors only; no
`Err(String)`; A/A/A tests named `thing — condition — result`; match this
file's established `_via`-function idiom and existing test helpers exactly.
No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.2 already fixes both commands' shape; this
task implements them as specified, per ruling R59 Q1(a).

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::catalog::` result line with its `passed` count; `cargo check -p
idl-rs-tauri` result; confirmation the cascading foreign keys
(`laps`/`lap_summary` `ON DELETE CASCADE` from `sessions`) actually exist in
the schema you found on `main` (quote the exact `CREATE TABLE` lines you
verified against); confirmation `save_session_metadata_via` preserves every
untouched field byte-for-byte; confirmation the shared-blob test actually
keeps the blob when a second session references it; the
`SessionJsonErrorKind::{Parse,UnsupportedVersion} -> internal` mapping
choice, flagged for lead confirmation as noted above; confirmation
`Data/ipcStubs.ts` was not touched; anything else ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing
— CLAUDE.md §1).

## Lead ruling 2026-09-05

The `SessionJsonErrorKind::{Parse, UnsupportedVersion}` -> `internal` fold is confirmed for wave 2 (C3 lists only `not_found`/`io`/`internal` for these commands); the `IpcError.message` must carry the parse reason and the path so it is diagnosable, and the doc comment names the fold as deliberate. If a later lane needs the UI to distinguish a corrupt `session.json`, that is an additive kind through the lead, not this task.
