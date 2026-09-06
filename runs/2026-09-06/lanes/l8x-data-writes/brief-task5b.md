# L8x Task 5b — implementer brief (catalog indexes workbooks; R87)

Lead-added after the 2026-09-06 preview. Ruling R87 (ledger, end) is the
spec; read it first, then `runs/2026-09-06/RULINGS-DIGEST.md`.

## GATE
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 01b0f3f HEAD && echo GATE-OK
grep -n "6. workbooks" core/src/store/catalog.rs        # the no-op step to replace
grep -n "pub fn parse_front_matter" core/src/workbook/v3/front_matter.rs
grep -n "fn create_workbook_via\|fn save_workbook_via" tauri/src/commands/workbook.rs
```

## Where / Files
- idl-rs worktree above, branch `l8x-data-writes`. Files: `core/src/store/catalog.rs`
  (step 6 + a `pub fn upsert_workbook(conn, row)`), `core/src/store/catalog_read.rs`
  only if `list_workbooks` needs a field, `tauri/src/commands/workbook.rs`
  (`create_workbook_via`/`save_workbook_via` call `upsert_workbook` after their
  atomic write; a catalog failure is a warning on the result if the C3 shape has
  one, else logged — never a failed save).
- idl1-app worktree `C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/l8x-data-writes`:
  C4 §5 one sentence (step 6 is real), CHANGELOG bullet.

## Interfaces
- `workbooks` row = C4 §5 DDL: `workbook_id, file_name, name, updated_at_ms
  (file mtime), size_bytes`. `workbook_id`/`name` from `parse_front_matter`.
- Malformed file ⇒ skipped, counted in `RebuildReport` (add a
  `workbooks_skipped: usize` if no field fits; additive).

## Steps
- [ ] 1. Tests first: rebuild over a tree with two valid `.idl1wb` and one
  malformed ⇒ two rows, one skipped; `list_workbooks` returns them sorted as
  C3 §3.2 says.
- [ ] 2. Implement step 6 + `upsert_workbook` (`INSERT … ON CONFLICT(workbook_id)
  DO UPDATE`; `file_name` UNIQUE — a rename of the file keeps the id).
- [ ] 3. `create_workbook_via` / `save_workbook_via` upsert after the write;
  test: create then `list_workbooks` shows it with no rebuild.
- [ ] 4. Filters: `cargo test -p idl-rs store::catalog::` and
  `cargo test -p idl-rs-tauri commands::workbook::tests::` (non-zero passed);
  `cargo check -p idl-rs-cli --tests`; `cargo check -p idl-rs-tauri`.
- [ ] 5. C4 sentence + CHANGELOG; ONE commit per worktree.

## Report (≤12 lines)
commits; filters + counts; anything unstated ⇒ question; `STATUS: DONE|BLOCKED`.
