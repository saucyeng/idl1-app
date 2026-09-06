# L2b Task 4 — implementer brief (incremental catalog insert) — **FOUR-TASK GATE**

`rebuild_catalog` already indexes laps correctly from `session.json`; it just
costs a full tree walk. You extract its per-session body into a reusable
`index_session` and call it after import, so one import updates one session's
catalog rows. TDD, ONE commit, then the gate, then report.

**Depends on Task 3.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave3-l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "lap_index" src/store/import.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `core/src/store/catalog.rs`, `core/src/store/import.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §2 (last paragraph) and §5's C4 bullet;
`core/src/store/catalog.rs` in full — the schema block, `rebuild_catalog`'s
step 3/4/5 body, `lap_track_id`, `index_lap_summary`, `RebuildReport`,
`delete_session`; C4 §5's numbered steps 3–5 and its "the catalog is an index —
deletable, rebuildable, never synced" framing; ruling R14 item 2 (lap→track
join by timestamp containment); `core/src/laps/renumber.rs`'s doc comment,
which explains why that join is by containment and not by lap number.

## Interfaces

```rust
/// Index (or re-index) exactly one session into an open catalog: the
/// `sessions` row and its `laps` / `lap_summary` rows, per C4 §5 steps 3–5.
/// Idempotent — existing rows for `session_id` are removed first, so calling
/// it twice leaves the same state. `tracks` rows are NOT touched (step 2 is
/// the library's own concern and `laps.track_id` is `ON DELETE SET NULL`).
pub fn index_session(
    conn: &Connection,
    data_root: &Path,
    session_id: &str,
) -> Result<SessionIndexReport, CatalogError>;

pub struct SessionIndexReport {
    pub laps_indexed: usize,
    pub lap_summary_indexed: usize,
    pub skipped: Vec<String>,
}
```

## Key logic

- **Extract, do not rewrite.** Lift `rebuild_catalog`'s per-session body
  verbatim into `index_session` and have `rebuild_catalog`'s loop call it,
  accumulating into `RebuildReport`. The rebuild's own observable behaviour and
  its report counters must not change — the existing `catalog` tests are the
  proof, and they must pass untouched. If a counter cannot be preserved
  exactly, STOP and report rather than editing an existing test.
- **Idempotence.** `index_session` deletes this session's `laps` and
  `lap_summary` rows and replaces its `sessions` row before inserting.
  `rebuild_catalog` drops and recreates the whole database, so it is unaffected;
  the incremental path needs the delete. Note that `lap_summary` has
  `ON DELETE CASCADE` from `laps`, so deleting laps is sufficient for it —
  confirm against the landed schema rather than assuming.
- **Transaction.** Wrap the delete+insert in one transaction so a failure
  mid-session cannot leave half a session indexed.
- **Import call site.** In `store::import::finish_import`, after the lap-index
  step, open `<data_root>/catalog.sqlite` **only if it already exists** and call
  `index_session`. A missing catalog is not an error — the catalog is
  rebuildable by definition (CLAUDE.md §3) and a first import into a bare root
  should not create one as a side effect. Failure is non-fatal, exactly like the
  lap-index step: record it on a new `ImportReport::catalog_index_warning` and
  still return `Ok`. Update `import.rs`'s module doc comment, which currently
  says the import "Does **not** touch the catalog" and "incremental catalog
  indexing does not exist yet" — both sentences become false in this commit.

## Tests

- `index_session` on a session with three laps → three `laps` rows,
  `sessions.lap_count == 3`.
- `index_session` called twice → still three rows (idempotent), no primary-key
  error.
- `index_session` after `session.json`'s laps change from 3 to 2 → two rows, the
  stale third gone, and its `lap_summary` rows gone with it.
- `index_session` on an id with no session directory → `not_found`-kind error.
- `rebuild_catalog` after the refactor produces the same `RebuildReport`
  counters as before on the existing fixture (an existing test already covers
  this — it must pass unmodified).
- `import_file` into a root with an existing catalog → `list_laps` returns the
  laps immediately, with no `rebuild_catalog` call.
- `import_file` into a root with **no** `catalog.sqlite` → succeeds, no catalog
  created, no warning.

## COMPUTE RULES

While working: `cargo test -p idl-rs store::catalog::` then
`cargo test -p idl-rs store::import::` — foreground, non-zero `passed` each.
`cargo check -p idl-rs-cli --tests`.

**FOUR-TASK GATE, after the commit** (covers Tasks 1–4), foreground, once, tee'd:
```
cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
cargo test -p idl-rs-tauri
```
Report both result lines verbatim. A failure here is STOP-and-report, not a fix
attempt, unless the failure is plainly caused by this commit.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Extract `index_session`. 4. Import call site
      + module doc correction. 5. Targeted filters green. 6. `cargo check -p
      idl-rs-cli --tests`. 7. C4 §5 note. 8. CHANGELOG bullet; commit
      `core: incremental catalog index_session; import updates the catalog (C4 5)`.
- [ ] 9. Run the four-task gate and report its two lines.

## Do not

- Do not change the SQL schema, any index, or any C4 §5 step's semantics.
- Do not edit an existing catalog test to make the refactor pass.
- Do not create `catalog.sqlite` from the import path.
- Do not make a catalog failure fail the import.

## Spec discipline

**spec-during.** Add a note to C4 §5 that steps 3–5 are also reachable
per-session via `index_session`, that the import path calls it when a catalog
exists, and that `rebuild_catalog` remains the authority and the recovery path.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the two targeted test result lines with
`passed` counts; `cargo check -p idl-rs-cli --tests` result; the two gate
result lines verbatim; confirmation that no existing catalog test was edited;
how `lap_summary` cleanup is achieved (cascade or explicit); anything needing
a ruling.
