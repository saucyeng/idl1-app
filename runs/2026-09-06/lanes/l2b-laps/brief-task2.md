# L2b Task 2 — implementer brief (session.json merge, `index_laps` / `reindex_laps`)

You give Task 1's pure computation a home on disk: a detector version, a
non-clobbering merge into `session.json`, and the two entry points import and
rescan both call. TDD, ONE commit, then report.

**Depends on Task 1.** Build on its commit.

## GATE

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "pub fn compute_lap_index" core/src/store/lap_index.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Where

- Same worktree/branch as Task 1. Do NOT push.
- **Files:** `core/src/store/lap_index.rs`, `core/src/store/session_json.rs`
  (one additive field only), `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §2 ("Never clobber", "Honest empty") and
open questions Q2, Q3, Q5; Task 1's brief and its commit;
`core/src/store/session_json.rs` in full (`SessionJson`, `read_session_json`,
`write_session_json`, `empty_session_json`, the `VersionedConfig` impl);
`core/src/store/atomic.rs` (`write_atomic`); `core/src/store/parquet.rs`
`read_session_parquet`; `core/src/session/handle.rs` `from_session`;
C1 §6's field list and its "Units" paragraph;
`rust/tauri/src/session_source.rs`'s `load_lap_context` doc comment — it reads
`main_lap_number` verbatim without validating it, which is why Q3 matters.

## Lead rulings applied (do not re-litigate)

- **Q2:** `lap_detector_version` is a new optional `session.json` field.
- **Q3:** unresolvable lap flags are cleared on re-index, counts reported.
- **Q5:** a re-index runs when the stamp is absent or stale, not otherwise.

*(If the lead's adjudication of PLAN §6 changed any of these, that ruling wins
over this brief — check the ledger entry the dispatch names before writing.)*

## Interfaces

```rust
/// Bumped whenever a change to `laps`/`tracks` alters detector output.
/// Stamped into `session.json.lap_detector_version`.
pub const LAP_DETECTOR_VERSION: &str = "1";

pub struct LapIndexReport {
    pub session_id: String,
    pub visits_indexed: usize,
    pub laps_indexed: usize,
    /// True when the stamp was already current and nothing was recomputed.
    pub skipped_up_to_date: bool,
    /// Lap-flag fields cleared because their lap number no longer exists.
    pub flags_cleared: Vec<String>,
    pub warnings: Vec<String>,
}

/// Index laps for a session whose `SessionHandle` the caller already holds
/// (the import path). Reads and rewrites `session.json` in place.
pub fn index_laps(
    data_root: &Path,
    session_id: &str,
    handle: &SessionHandle,
    force: bool,
) -> Result<LapIndexReport, LapIndexError>;

/// IDL0_SPEC §17.4's "Rescan Tracks": rebuilds the handle from
/// `sessions/<id>/data.parquet`, then calls `index_laps` with `force = true`.
pub fn reindex_laps(data_root: &Path, session_id: &str) -> Result<LapIndexReport, LapIndexError>;
```

## Key logic

- **Additive C1 field.** Add to `SessionJson`:
  `#[serde(default, skip_serializing_if = "Option::is_none")] pub lap_detector_version: Option<String>`.
  Do not bump `SESSION_JSON_SCHEMA_VERSION` — the field is optional and older
  files parse unchanged (C1 §6's own additive rule). Say so in your report.
- **Staleness.** Recompute when `force`, or when `track_visits_library_hash` !=
  the freshly computed hash, or when `lap_detector_version` != `LAP_DETECTOR_VERSION`
  (including `None`). Otherwise return early with `skipped_up_to_date: true` and
  **write nothing**.
- **Missing `session.json`.** Start from `empty_session_json(session_id)` rather
  than erroring — import creates it and this may run before or after.
- **Merge.** Read the existing doc, overwrite only `track_visits`, `laps`,
  `track_visits_library_hash`, `lap_detector_version`, plus Q3's flag clearing.
  Every other field is carried through by value. Write via `write_session_json`.
- **Flag reconciliation (Q3).** After the new `laps[]` is built, let
  `valid = {lap_number}`. Set `main_lap_number` / `reference_lap_number` /
  `starred_lap_number` to `None` when `Some(n)` and `n ∉ valid`; retain only
  `ignored_lap_numbers` entries in `valid`. Push the cleared field's name onto
  `flags_cleared`. `overlay_lap_key` points at *another* session — leave it
  alone and say so in a doc comment.
- **`ignored_lap_numbers` feeds Task 1.** Pass the *pre-reconciliation* value
  into `compute_lap_index`, since `renumber_session_laps` takes it as input.
- **`reindex_laps`** maps a missing `data.parquet` to
  `LapIndexErrorKind::Io` with the path in the message — never a panic.

## Tests

Use `tempfile` roots the way `store::import`'s and `store::catalog`'s test
modules already do; write `.idl0t` fixtures with `track_artifact::write_track`.

- fresh session — no `session.json` — writes one with laps and both stamps.
- existing `session.json` with rider/bike/comments set — after indexing, every
  unrelated field is byte-identical and laps are populated.
- second call with an unchanged library — `skipped_up_to_date: true`, file
  mtime/content unchanged.
- second call after a track's `updated_at_ms` bumps — recomputes.
- second call with a stale `lap_detector_version` — recomputes.
- `force: true` with a current stamp — recomputes anyway.
- `main_lap_number: Some(9)` and only 3 laps detected — cleared to `None`,
  `flags_cleared` names it; `ignored_lap_numbers: [1, 9]` filtered to `[1]`.
- `overlay_lap_key` survives a re-index untouched.
- empty track library — writes `laps: []`, `track_visits: []`, stamps set.
- `reindex_laps` on a session with `data.parquet` reproduces `index_laps`'s
  result; on a session without one → `LapIndexErrorKind::Io`.

## COMPUTE RULES

`cargo test -p idl-rs store::lap_index::`, foreground, non-zero `passed`.
`cargo check -p idl-rs-cli --tests` (new `pub` items in `core`).
No `cargo fmt`, no `--workspace`. One cargo process.

## Steps

- [ ] 1. Gate. 2. C1 §6 amendment text. 3. Failing tests. 4. Implement.
- [ ] 5. `cargo test -p idl-rs store::lap_index::` non-zero `passed`.
- [ ] 6. `cargo check -p idl-rs-cli --tests` clean.
- [ ] 7. CHANGELOG bullet; commit
      `core: index_laps/reindex_laps write session.json laps + detector stamp (C1 6)`.

## Do not

- Do not touch `laps`, `tracks`, `track_artifact`, `catalog`, or `import`.
- Do not bump `SESSION_JSON_SCHEMA_VERSION`.
- Do not clear `overlay_lap_key`.
- Do not write `session.json` on the up-to-date path.

## Spec discipline

**spec-during.** Amend C1 §6 in this commit: the `lap_detector_version` field
with its comment, and a sentence under the `laps[]` block stating that the
importer writes it, the two stamps are the cache key, and a mismatch triggers a
re-index. Extend Task 1's IDL0_SPEC section with the rescan entry point.

## Report back (≤15 lines)

Commit hash + `git show --stat`; test result line with `passed` count;
`cargo check -p idl-rs-cli --tests` result; confirmation that
`SESSION_JSON_SCHEMA_VERSION` is unchanged and why that is safe; the Q3 flag
policy as implemented; C1 §6 amendment location; anything needing a ruling.
