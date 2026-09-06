# L2b Task 3 — implementer brief (wire lap indexing into the import pipeline + CLI `rescan`)

You make laps happen automatically. `store::import::finish_import` gains the
lap-index step; the CLI gains a `rescan` subcommand over `reindex_laps`.
TDD, ONE commit, then report.

**Depends on Tasks 1 and 2.**

## GATE

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "pub fn index_laps" core/core/src/store/lap_index.rs
grep -c "pub fn reindex_laps" core/core/src/store/lap_index.rs
```
All must succeed / return `>= 1`. If any fails, STOP and report.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `core/core/src/store/import.rs`, `cli/src/main.rs`, `docs/IDL0_SPEC.md`.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §2 (flow, honest empty, non-fatal) and Q5;
Tasks 1 and 2 briefs and commits; `core/core/src/store/import.rs` in full —
especially `finish_import`, `ImportPlan`, `ImportReport`, and the module doc
comment's line "Does **not** touch the catalog", which stays true in this task
(Task 4 changes it); `core/core/src/session/handle.rs` `from_session` (it consumes
the `Session` by value — see "Key logic"); `cli/src/main.rs`'s `Laps`/`Visits`
subcommands and `emit_structured` / the §29.7 envelope; IDL0_SPEC §15a, §29.6,
§29.7; ruling R18 (import belongs in core, shared by CLI and Tauri).

## Interfaces

```rust
// added to ImportReport
pub struct ImportReport {
    // …existing fields unchanged…
    /// Outcome of the lap-index step. `None` when the step did not run
    /// (see the `ImportPlan::Skip` rule below).
    pub lap_index: Option<LapIndexReport>,
    /// Set when lap indexing failed; the import itself still succeeded.
    pub lap_index_warning: Option<String>,
}
```

CLI: `idl-rs rescan <data_root> --session <session_id> [--format json]`.

## Key logic

- **Call site:** in `finish_import`, *after* the `session.json` creation block,
  so the file exists before `index_laps` reads it.
- **Handle:** `SessionHandle::from_session` takes the `Session` by value. Build
  the handle from the already-parsed session rather than re-reading Parquet —
  restructure `finish_import` so the handle is created once after
  `write_session_parquet` has had its `&session`, and reuse it. Do **not**
  clone the channel data. If ownership makes this awkward, STOP and report
  rather than adding a deep clone (CLAUDE.md §1; the sessions are hundreds of MB).
- **When it runs (Q5):** on `Write` and `Regenerate`, always, `force = false`.
  On `Skip`, also run with `force = false` — `index_laps` returns early when the
  stamp is current, so a duplicate import costs a hash and a read, and a session
  imported before this lane gets its laps on the next import attempt. On the
  `Collision` branch nothing runs (it returns early already).
- **Non-fatal:** wrap the call so `Err` sets `lap_index_warning` to the error's
  `Display` and leaves `lap_index: None`. The import must still return `Ok`.
  Mirror idl0's `_detectAndSaveVisits`, which swallows detection failures for
  exactly this reason. Warnings from `LapIndexReport::warnings` stay on the
  report; do **not** fold them into `import_warnings` (different provenance).
- **CLI `rescan`:** resolve the data root and session id, call `reindex_laps`,
  print a human summary (visits, laps, cleared flags, warnings) by default and
  the §29.7 success envelope under `--format json` with
  `data: { "rescan": { … } }`. Map `LapIndexError` through the existing
  `CliError` conversion — add a `From` impl if none exists.

## Tests

Extend `core/core/src/store/import.rs`'s existing test module (it already builds
tempdir roots and synthetic `.idl0`/GPX/FIT fixtures).

- `import_file` on a root with a matching `.idl0t` in `tracks/` → `session.json`
  has non-empty `laps[]` and `track_visits[]`, `report.lap_index` is `Some`.
- `import_file` on a root with **no** `tracks/` → import succeeds, `laps: []`,
  `lap_index` is `Some` with `laps_indexed: 0`, no warning. (Honest empty.)
- re-importing the same bytes (the `Skip` plan) → `lap_index.skipped_up_to_date`
  is true and `session.json` is byte-identical.
- a `tracks/` entry that is not valid JSON → import still `Ok`, the artifact
  appears in `lap_index.warnings`, laps from the readable tracks still land.
- `ImportPlan::Regenerate` re-runs the index.
- CLI: a `rescan` unit test in `cli/` asserting the envelope shape, following
  `cmd_laps`'s own test idiom if one exists; otherwise assert `reindex_laps`'s
  report maps into the structured value correctly.

## COMPUTE RULES

`cargo test -p idl-rs store::import::` then
`cargo test -p idl-rs-cli rescan` — both foreground, both non-zero `passed`.
`cargo check -p idl-rs-cli --tests` (`ImportReport` is `pub`, its shape moves).
No `cargo fmt`, no `--workspace`. One cargo process.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `finish_import` wiring. 4. CLI `rescan`.
- [ ] 5. Both test filters green with non-zero `passed`.
- [ ] 6. `cargo check -p idl-rs-cli --tests` clean.
- [ ] 7. SPEC §29.6 + §15a edits. 8. CHANGELOG bullet; commit
      `core+cli: lap indexing at import; idl-rs rescan (SPEC 17.4, 29.6)`.

## Do not

- Do not touch the catalog — that is Task 4, and `import.rs`'s module doc
  still says the caller refreshes it.
- Do not clone `Session` channel data to get a handle.
- Do not make a lap-index failure fail the import.
- Do not change `plan_import`'s four outcomes.

## Spec discipline

**spec-during.** Add `rescan` to IDL0_SPEC §29.6 alongside `laps`/`visits`, and
state in §15a (importers) that every import path runs lap indexing after
`data.parquet` and that failure is non-fatal and recoverable by `rescan`.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with `passed` counts;
`cargo check -p idl-rs-cli --tests` result; how you obtained the `SessionHandle`
without cloning channel data; the `Skip`-plan behaviour you implemented;
SPEC sections touched; anything needing a ruling.
