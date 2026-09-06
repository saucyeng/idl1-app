# L8x Task 5b review — catalog indexes workbooks (R87)

**Commits:** idl-rs `571e410` (branch `l8x-data-writes`, on `ffc7fd3`) —
`core/src/store/catalog.rs`, `tauri/src/commands/workbook.rs`. idl1-app
`e189789` — `CHANGELOG.md`, `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`.

**Test command:** none run (read-only review, no cargo). Verified statically:
`grep -c '#\[test\]' core/src/store/catalog.rs` = 27, no `#[ignore]` — matches
reported `store::catalog:: 27 passed`. `grep -c '#\[test\]' tauri/src/commands/workbook.rs`
= 45, no `#[ignore]` — matches reported `commands::workbook::tests:: 45 passed`.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verdict rationale

C4 §5's rebuild procedure always builds a fresh staging `catalog.sqlite`
(`core/src/store/catalog.rs:196-198`, unchanged by this commit) and swaps it
in — so `rebuild_catalog`'s step 6 is truth-from-tree by construction: a
deleted workbook file is simply absent from the fresh scan, and a renamed
file's old `file_name` never carries over, with no code needed to reconcile
stale rows. `upsert_workbook`'s `ON CONFLICT(workbook_id) DO UPDATE` matters
only for the two live-catalog paths (`create_workbook_via`/`save_workbook_via`
calling the shared `index_workbook_after_write`), where it correctly keeps
the same row when a `save` changes `name` without moving the file
(`save_workbook_via_a_front_matter_name_edit_updates_the_same_workbook_id_row_in_place`)
and is exercised directly for an out-of-band rename
(`upsert_workbook_a_rename_keeps_the_id`). Both a two-valid/one-malformed
rebuild test and a two-row assertion exist in one test
(`rebuild_catalog_indexes_two_valid_workbooks_and_skips_one_malformed`), the
malformed file is skipped and counted without aborting the scan, and
`list_workbooks`'s existing `ORDER BY name ASC` (pre-dating this diff,
consistent with `list_tracks`) is asserted. `create_workbook_via`/
`save_workbook_via` upsert immediately after their atomic write and are
proven with a catalog present (queryable without a rebuild) and absent (no
catalog created, per C4 §5's incremental-indexing rule); a catalog failure
is `eprintln!`-logged and swallowed rather than failing the save, matching
the brief's fallback for a C3 result shape with no warning field — verified
against `WorkbookHandle`/`SaveResult` in C3 §3.4, neither of which has one
(unlike `SaveTrackResult`, which does and surfaces its own `save_track_via`
upsert failure as a warning — a real asymmetry between the two after-write
paths, but one the doc comment already discloses and the brief explicitly
sanctioned). The single commit per worktree touches only the files the
brief named, `Cargo.lock` is untouched, the NUL-byte check is clean, tests
are named `thing — condition — result` with Arrange/Act/Assert, and the C4
sentence plus CHANGELOG bullet are accurate to the diff.

VERDICT: CLEAN
