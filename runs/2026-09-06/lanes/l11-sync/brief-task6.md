# L11 Task 6 — core: verified install of received bytes

The receiving half: bytes arrive, and this module decides where they land,
whether they are trustworthy, and what the merged result is. Still no
network. TDD, ONE commit.

**Depends on Task 5.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub fn merge" core/src/workbook/merge/mod.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §2/§5; this lane's `PLAN.md` §1 (verification, `session.json`
policy) and Task 1's landed C4 §6/§8 text; C4 §4 (atomic writes) and §7
(retention/repair); C1 §6 — which `session.json` fields are user-owned and
which are the L2b lap cache; `core/src/store/atomic.rs`,
`core/src/store/blob.rs`, `core/src/store/session_json.rs`,
`core/src/store/lap_index.rs` (the two staleness stamps),
`core/src/store/profile.rs`, `core/src/track_artifact/write.rs`; Task 5's
`merge` and `base_cache`.

## Where

- **Files:** `core/src/store/sync/apply.rs` (new),
  `core/src/store/sync/session_merge.rs` (new),
  `core/src/store/sync/mod.rs`, `CHANGELOG.md`.

## Interfaces

```rust
/// What installing one received file did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstallOutcome {
    /// Written (or already byte-identical — the write was skipped).
    Installed,
    /// Ignored: the local copy wins under this class's rule.
    KeptLocal,
    /// Workbook only: merged, with this many conflict cells created.
    Merged { conflicts: u32 },
}

/// Installs one received file. `bytes` are exactly what the wire delivered;
/// nothing is trusted until this function verifies it.
pub fn install(data_root: &Path, item: &SyncItem, bytes: &[u8], peer_name: &str,
               now_ms: i64) -> Result<InstallOutcome, SyncError>;

/// Per-field `session.json` merge (C4 §6 as amended by Task 1). Pure.
pub fn merge_session_json(local: &SessionJson, peer: &SessionJson) -> SessionJson;
```

## Key logic

- **Content-addressed classes (blob, derived).** Hash the received bytes and
  write to the path derived from *that* hash. A mismatch against the
  requested hash is `SyncError` and nothing is written — it cannot corrupt an
  existing entry, because the wrong hash is a different path.
- **`data.parquet`.** Re-read the received file's version metadata from the
  bytes; if it does not match what the manifest claimed, refuse. Otherwise
  write through the atomic primitive.
- **`session.json`.** Parse both sides, call `merge_session_json`, write the
  result. User-owned fields (`rider`, `bike`, `bike_comment`, `venue_name`,
  `event_name`, `event_session`, `short_comment`, `long_comment`, `tag`,
  `lap_gates`, `sector_gates`, `bike_profile_snapshot`, and the lap flags
  `reference_lap_number`/`ignored_lap_numbers`/`main_lap_number`/
  `overlay_lap_key`/`starred_lap_number`) merge **per field**: a field equal
  to neither side's default takes the side whose file is newer by
  `updated_at_ms` only when both changed; a field changed on one side only
  takes that side. The L2b cache — `laps`, `track_visits`,
  `track_visits_library_hash`, `lap_detector_version` — is **never merged**:
  the receiver keeps its own values verbatim, and staleness is re-detected
  locally by the existing stamp rule (R83). If the field-level "changed"
  test needs a base and C1 gives none, use "differs from the receiver's
  current value" and say so in the report.
- **Workbook.** Read local, parse peer's bytes, read the base cache, call
  `merge`, write the merged document to `workbooks/<file_name>.idl1wb`, then
  overwrite the base cache with the **merged** bytes. A `file_name` mismatch
  for a known `workbook_id` renames the local file — id wins (C4 §6).
- **Track, profile.** LWW by `updated_at_ms`; a strictly older peer copy is
  `KeptLocal`.
- Every write goes through `write_atomic`/`write_atomic_with_retry` —
  `tmp/<uuid>` → fsync → rename. Never a direct `std::fs::write` into `<data>`.
- Nothing here touches the catalog. Re-indexing is the command layer's job.

## Tests

- `install — a blob whose bytes hash to the requested hash — Installed and
   readable via read_blob`.
- `install — a blob whose bytes do not match — SyncError and no file written`.
- `install — a derived parquet — lands under the session's derived/ by hash`.
- `install — data.parquet whose embedded versions contradict the manifest —
   refused`.
- `merge_session_json — the peer set rider, local set venue — both survive`.
- `merge_session_json — both set rider, peer newer — the peer's rider`.
- `merge_session_json — the peer carries different laps and stamps — the
   receiver's laps and both stamps are untouched`.
- `merge_session_json — the peer's ignored_lap_numbers only — adopted`.
- `install — a workbook edited on both sides in different cells — Merged with
   zero conflicts and the base cache updated to the merged bytes`.
- `install — a workbook whose file_name differs — the local file is renamed`.
- `install — a track older than local — KeptLocal, the file unchanged`.
- `install — every class — nothing is left behind in tmp/`.

## COMPUTE RULES

While working: `cargo test -p idl-rs store::sync::apply` and
`cargo test -p idl-rs store::sync::session_merge`, foreground, non-zero
`passed` each. New `pub` symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `merge_session_json`. 4. `install` per
      class. 5. Filters green. 6. `cargo check -p idl-rs-cli --tests`.
      7. NUL check. 8. `CHANGELOG.md`. 9. Commit
      `core: verified sync install and session.json field merge (L11)`.

## Do not

- Do not write into `<data>` except through the atomic primitive.
- Do not touch `catalog.sqlite` or call `index_session`.
- Do not merge the L2b lap cache. Do not recompute laps here.
- Do not trust the manifest over the bytes — the bytes decide.

## Spec discipline

**No spec change needed** if Task 1's C4 amendment closed §8 item 3. If the
landed text still leaves `session.json` open, STOP and report rather than
choosing a policy.

## Report back (≤15 lines)

Commit hash + `git show --stat`; each filter's `passed` count; the
`cargo check` result; the exact per-field rule used for `session.json` and
whether it needed the no-base fallback; anything left ambiguous by C1 §6.
