# L11 Task 2 — core: the sync manifest and the walk that builds it

The typed manifest of C4 §6 and a pure `std::fs` walk of `<data>` that fills
it. No network, no async. TDD, ONE commit.

**Depends on Task 1** (cite its commit hash in the entry gate).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
```
If it fails, merge `main` first; if it still fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§4/§5; this lane's `PLAN.md` §1 and §3; C4 §6 in full (the
manifest JSON and the entry table) and §2 (layout); C1 §4.3 (`data.parquet`'s
file key-value metadata — where `importer_version` and
`seam_correction_version` come from) and §6; `core/src/store/blob.rs`,
`core/src/store/atomic.rs` (`sha256_hex`), `core/src/store/verify.rs` (its
existing walk of `<data>` — reuse the traversal shape, do not duplicate it
carelessly), `core/src/store/profile.rs`, `core/src/store/session_json.rs`.

## Where

- **Files:** `core/src/store/sync/mod.rs` (new),
  `core/src/store/sync/manifest.rs` (new), `core/src/store/mod.rs`,
  `CHANGELOG.md`.

## Interfaces

```rust
/// One syncable file class's entry in the manifest (C4 §6).
pub struct BlobEntry     { pub sha256: String, pub size_bytes: u64 }
pub struct DerivedEntry  { pub sha256: String, pub size_bytes: u64 }
pub struct DataParquetEntry {
    pub sha256: String, pub size_bytes: u64,
    pub importer_version: String, pub seam_correction_version: String,
    /// Informational provenance only — never part of the conflict key (C4 §6).
    pub engine_version: String,
}
pub struct SessionJsonEntry { pub sha256: String, pub size_bytes: u64, pub updated_at_ms: i64 }
pub struct SessionEntry {
    pub session_id: String,
    pub data_parquet: Option<DataParquetEntry>,
    pub derived: Vec<DerivedEntry>,
    pub session_json: Option<SessionJsonEntry>,
}
pub struct WorkbookEntry { pub workbook_id: String, pub file_name: String,
                           pub sha256: String, pub size_bytes: u64, pub updated_at_ms: i64 }
pub struct TrackEntry    { pub track_id: String, pub sha256: String,
                           pub size_bytes: u64, pub updated_at_ms: i64 }
pub struct ProfileEntry  { pub profile_id: String, pub sha256: String,
                           pub size_bytes: u64, pub updated_at_ms: i64 }

pub struct Manifest {
    pub schema_version: u32,          // 1
    pub generated_at_ms: i64,
    pub blobs: Vec<BlobEntry>,
    pub sessions: Vec<SessionEntry>,
    pub workbooks: Vec<WorkbookEntry>,
    pub tracks: Vec<TrackEntry>,
    pub profiles: Vec<ProfileEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncErrorKind { Io, Malformed }

/// Walks `<data>` and builds the manifest. `now_ms` is injected — this
/// module has no clock (the command layer mints it).
pub fn build_manifest(data_root: &Path, now_ms: i64) -> Result<Manifest, SyncError>;
```

All types `serde::Serialize + Deserialize` with C4 §6's exact JSON field
names, since this struct *is* the wire body.

## Key logic

- Excluded from the walk, unconditionally: `catalog.sqlite` and its `-wal`/
  `-shm` sidecars, `tmp/` (including `tmp/quarantine/`), and
  `workbooks/.sync-base/`. A dotfile or dot-directory under `workbooks/` is
  skipped entirely, not just that one name.
- `data.parquet`'s `importer_version`/`seam_correction_version`/
  `engine_version` are read from the file's Parquet key-value metadata
  (C1 §4.3), never guessed. A file missing them is a `Malformed` finding on
  that session only — the rest of the manifest still builds.
- `workbook_id` comes from the front matter (C2), **not** the file name; a
  workbook whose front matter will not parse is skipped and named in the
  error path, never silently dropped.
- Entries are sorted by their identity key so two runs over the same tree
  produce byte-identical JSON. Determinism is a test.
- Sizes and hashes come from the bytes on disk. Reuse `atomic::sha256_hex`.
- A malformed *individual* file never aborts the whole walk.

## Tests

- `build_manifest — an empty data root — every class empty, schema_version 1`.
- `build_manifest — one blob, one session with data.parquet and session.json —
   entries carry the right hashes and sizes`.
- `build_manifest — catalog.sqlite, its -wal/-shm and tmp/ present — none appear`.
- `build_manifest — workbooks/.sync-base/<id>.idl1wb present — not in workbooks`.
- `build_manifest — a workbook whose file_name differs from its workbook_id —
   the entry keys on workbook_id`.
- `build_manifest — data.parquet without importer metadata — the session is
   reported malformed and the other session still appears`.
- `build_manifest — run twice over one tree — identical serialised JSON`.
- `Manifest — round-trips through serde_json with C4 §6's field names`.

## COMPUTE RULES

While working: `cargo test -p idl-rs store::sync::manifest`, foreground,
non-zero `passed`. New `pub` symbols in core ⇒
`cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Types + serde names. 4. `build_manifest`.
      5. Filter green. 6. `cargo check -p idl-rs-cli --tests`. 7. NUL check.
      8. `CHANGELOG.md`. 9. Commit `core: sync manifest and data-dir walk (L11)`.

## Do not

- Do not add a network, async or HTTP dependency to `idl-rs`. Ever.
- Do not call `SystemTime::now()` — `now_ms` is injected.
- Do not touch the catalog, and do not read `settings.json`.

## Spec discipline

**No spec change needed** — Task 1 wrote C4 §6's amended manifest. If a field
you need is not in it, STOP and ask.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the test line with its `passed` count; the
`cargo check` result; where `importer_version` was actually read from; any
C4 §6 field whose type the contract left ambiguous.
