# L3 Task 7 review — table cells (C2 §4)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `2936118` (parent `34291d5`,
Task 6's `resolve.rs`). In scope: `core/src/workbook/v3/cell.rs`,
`core/src/workbook/v3/error.rs`, `core/src/workbook/v3/mod.rs`,
`core/src/workbook/v3/table_cell.rs` (new) — matches the brief's Files line
exactly (`git show --stat` confirms no stray file). Working tree otherwise
clean; nothing else present to exclude.

## Test command and result

```
cargo test -p idl-rs workbook::v3::table_cell
```
```
running 2 tests
test workbook::v3::table_cell::tests::c2_4_worked_example_parses_ok_columns_rows_and_cells_match ... ok
test workbook::v3::table_cell::tests::fence_body_not_valid_json_err_invalid_table_json_message_includes_serde_error ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 765 filtered out; finished in 0.00s
```

```
cargo test -p idl-rs table::
```
```
running 12 tests
... (10 pre-existing table::eval tests, unaffected by this task) ...

test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 755 filtered out; finished in 0.00s
```

Both filters run exactly once, one cargo process at a time, foreground.
Both reproduce non-zero `passed`/`0 failed`, matching the implementer's
reported result.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|

No Critical/Important findings. No Minor findings.

## Checks performed (all pass)

- **(a) Loop refactor (`mod.rs`).** Compared the pre- and post-diff Math
  branch line-for-line: `math_cell::parse_math_cell_body` call, `errors.extend`,
  the `order` counter (still declared fresh per cell, inside the per-cell
  iteration, not hoisted — increments identically per `Def` line), the
  `def_names.insert` dedupe → `duplicate_definition` push, `MathCellDef`
  construction, and the `Const`/`Blank`/`Comment` arms are byte-identical,
  just re-indented one level into the `match` arm and switched from `&cells`/
  `if kind != Math { continue }` to `&mut cells`/`match kind_token`. No
  early-`continue` semantics existed to preserve (the original `continue`
  short-circuited iterations for non-Math cells only, exactly what the
  `match`'s other two arms now do structurally). `CellKindToken` has exactly
  three variants (`Math`, `Table`, `Js`, confirmed at `cell.rs:18-25`); the
  `match` is exhaustive with no wildcard, so a future fourth variant will
  fail to compile here rather than silently fall through — an improvement
  over the old `if`. The `Js` arm is `{}`, a genuine no-op: nothing upstream
  of this task or in C2 §5 assigns JS cells any parse-time work in
  `parse_workbook`.
- **(b) `InvalidTableJson`.** Variant added to `WorkbookErrorKind` with a doc
  comment that states it is provisional pending the C2 §3.5.A amendment
  batch and cites ledger R21, matching L3-R19/R21's instruction. Constructor
  `error::invalid_table_json(cell_id, detail)` builds message
  `"Table cell JSON is malformed: {detail}"` — checked byte-for-byte against
  the brief's `"Table cell JSON is malformed: <serde_json error text>"`,
  exact match including punctuation. `parse_table_cell` maps `serde_json`'s
  error via `.map_err(|e| error::invalid_table_json(cell_id, e))`, so
  `detail` is `serde_json::Error`'s own `Display` text as required. Test
  `fence_body_not_valid_json_...` asserts `kind == InvalidTableJson`,
  `cell_id` propagation, and `message.starts_with(...)` — adequate given the
  serde_json error suffix is not itself under test-worthy contract.
- **(c) `context` placement / `TODO(idl0):`.** No `context` field was added
  to `TableModel` — confirmed `table/model.rs` untouched by this diff (not
  in the changed-files list) and the new test reads `table.rows[0].context`,
  i.e. `Row.context` (G7.6). The `// TODO(idl0):` in `table_cell.rs:10-17`
  names both G7.7 gaps (missing `deny_unknown_fields`, missing
  `skip_serializing_if` producing non-empty JSON for a default `Cell`) and
  cites `table/model.rs` as the owning file, without touching any `serde`
  attribute there.
- Step 1 test asserts exactly L3-R20's four points (`columns[0].template ==
  None`, `rows[0].context == Some(RowContext{session_id: "s1", lap_index:
  1})`, `cells[0][1] == Cell::default()`, and the parse itself is `Ok` via
  `.unwrap()`) — not the plan's tautological round-trip-vs-`serde_json`
  comparison (G7.5), correctly avoided.
- `table::validate` is not called from `parse_table_cell` or the `mod.rs`
  wiring — grepped both files, absent.
- `CellDoc.table: Option<TableModel>` added; `TableModel` derives `Debug +
  Clone + PartialEq` (checked `table/model.rs`), so `CellDoc`'s existing
  derives still compile (confirmed by the successful build/test run above).
  The one other `CellDoc` literal construction site (`cell.rs:179`,
  `scan_cells`) was updated to include `table: None` — no other construction
  sites exist in the diff's changed files.
- Step 3 wiring: `Table` arm calls `parse_table_cell(&cell.id,
  &cell.raw_fence_body)`, sets `cell.table = Some(table)` on success or
  pushes the error into the doc-level `errors` Vec on failure, leaving
  `cell.table` at its `None` default otherwise — matches the brief exactly.
  Eager (not lazy like math), as required.
- CLAUDE.md §4: both new tests are Arrange/Act/Assert (first test has no
  distinct Arrange since the worked-example constant is defined outside the
  test body — Act/Assert only, acceptable, no logic needed arranging) with a
  blank line separating Act from Assert; names are `thing_condition_result`
  snake_case renderings of the brief's requested assertions.
- CLAUDE.md §5: doc comments present on `parse_table_cell`, the `table_cell`
  module doc, the `CellDoc.table` field, the `InvalidTableJson` variant, and
  `invalid_table_json`; no `Err(String)`; no unexplained `unwrap()` outside
  `#[cfg(test)]`; error is typed (`WorkbookError`/`WorkbookErrorKind`).
- No reformatting: diff is additive/surgical; the one touched pre-existing
  line (`cells.push(CellDoc { ... })`) only gained the new `table: None`
  field, no wider whitespace churn.
- Hygiene: commit message is a single line, no AI attribution trailer;
  `git add` used explicit paths per `git show --stat`; nothing under `docs/`
  touched; shared checkout `idl1-app\rust` untouched.
- No `pub` signature reaching `idl-rs-cli` was added (nothing there depends
  on `core::workbook::v3` yet), so the brief's exemption from an extra
  `cargo check -p idl-rs-cli --tests` is correctly not run.
- Report-back's spec-discipline line ("no spec change needed... lead's
  ledger-R21 batch, not this task's") matches the brief's script.

## Verdict rationale

The implementation matches L3-R19/R20/R21 precisely: `InvalidTableJson` is a
real enum variant (not a string smuggled through `message`), its message
text is byte-identical to the brief's template, `context` stays on `Row` (no
top-level `TableModel` field added), the `TODO(idl0):` correctly names both
G7.7 gaps without touching any serde attribute, and Step 1's test asserts
exactly the four brief-mandated points rather than the plan's tautological
round-trip. The `&cells`→`&mut cells`/`if`→`match` loop refactor (the
implementer's own judgment call, not brief-specified) was checked against
the pre-refactor Math branch line-for-line and found behaviourally identical
— same `order` counter scope, same dedupe/error-push order, same effective
early-`continue` semantics — with the `Js` arm a genuine no-op and the
`match` now exhaustive (a mild safety improvement, not a functional change).
Both targeted test filters were rerun once each and reproduce the
implementer's reported passing counts. No deviations, no spec violations, no
hygiene issues found.

VERDICT: CLEAN
