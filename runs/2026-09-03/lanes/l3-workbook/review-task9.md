# L3 Task 9 review — cell evaluation orchestrator + R37 fixture fix

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commits under review: `79214d1` (Task 9, incl.
R34/R35 Step 0 folded into `host.rs`) and `f1f5ce7` (R37 fixture fix, one
line in `mod.rs`). Diff base: `f7c757b` (Task 8). In scope: `core/src/workbook/v3/eval.rs`
(new), `core/src/workbook/v3/host.rs`, `core/src/workbook/v3/mod.rs`. Working
tree is clean at HEAD `f1f5ce7`, nothing else present.

## Test command and result

```
cargo test -p idl-rs workbook::v3::eval
```
```
running 6 tests
test workbook::v3::eval::tests::a_front_matter_scoped_structural_error_dropped_appears_on_no_cell ... ok
test workbook::v3::eval::tests::a_table_cells_invalid_table_json_structural_error_appears_in_its_errors_defs_stays_empty ... ok
test workbook::v3::eval::tests::two_math_cells_one_two_def_one_single_a_table_cell_a_js_cell_one_entry_per_cell_in_document_order_two_def_cell_has_two_defrslts ... ok
test workbook::v3::eval::tests::multi_definition_cells_defs_are_in_def_line_order_regardless_of_doc_defs_storage_order ... ok
test workbook::v3::eval::tests::one_definition_errors_its_cells_other_definition_still_returns_a_value ... ok
test workbook::v3::eval::tests::a_cell_with_a_duplicate_definition_structural_error_the_error_appears_in_that_cells_errors_siblings_still_evaluate ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 786 filtered out; finished in 0.00s
```
6 passed / 0 failed, reproducing the implementer's reported result. Per the
dispatch, the end-of-batch two-crate gate (already run green by the
implementer at `f1f5ce7`: 791 passed idl-rs, 51 passed idl-rs-cli) was not
rerun.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important/Minor findings | — |

## Checks performed (all pass)

- **L3-R25 shape, field-for-field.** `CellDefResult{name: String, label:
  Option<String>, value: Option<HostChannel>, error: Option<MathEvalError>}`
  (`eval.rs:37-48`), `CellError::Structural(WorkbookError) | Eval(MathEvalError)`
  (`eval.rs:59-64`), `CellEvalResult{cell_id: String, kind: CellKindToken,
  defs: Vec<CellDefResult>, errors: Vec<CellError>}` (`eval.rs:70-91`), and
  `eval_cells(doc: &WorkbookDoc, structural: &[WorkbookError], lookup: &dyn
  ChannelLookup, lap_ctx: &MathLapContext) -> Vec<CellEvalResult>` (`eval.rs:101-106`)
  — all byte-for-byte against the ruling's code block in `brief-task9.md`.
- **Front-matter-scoped errors dropped correctly, with no lost reporting
  path.** `eval_cells` skips `structural` entries with `cell_id ==
  "front-matter"` (`eval.rs:113-117`), matching `WorkbookError::front_matter`'s
  literal (`error.rs:82-84`). The dropped errors are not lost: `structural`
  is the same `Vec<WorkbookError>` `parse_workbook` already returns to its
  caller in full (Task 9's own doc comment and the brief both say so); the
  caller — not built in this lane — reports front-matter-scoped ones from
  that vector directly. Confirmed no code path exists in this diff that
  would only ever see errors via `eval_cells`'s output.
- **One entry per cell, in document order**, verified in
  `two_math_cells_one_two_def_one_single_a_table_cell_a_js_cell_...` — 4
  cells in, 4 results out, in `doc.cells` order, multi-def cell nests two
  `CellDefResult`s rather than producing extra top-level entries.
- **`def_line` order within a cell** independent of `doc.defs` storage
  order — `math_cell_defs` sorts by `MathCellDef::order` (`eval.rs:143`),
  proven by `multi_definition_cells_defs_are_in_def_line_order_...` with
  defs deliberately pushed out of order.
- **Sibling-definition independence (CLAUDE.md §5 at this layer)** — one
  def erroring (`UnknownChannel`) does not suppress its sibling's value,
  proven in `one_definition_errors_its_cells_other_definition_still_returns_a_value`.
- **G9.4 (table cell success not swallowed)** — `defs` doc comment
  (`eval.rs:78-82`) states explicitly that a table cell's value lives on
  `CellDoc.table`, not here, and that this struct carries only structural
  errors for it; `a_table_cells_invalid_table_json_structural_error_...`
  confirms a table cell's `InvalidTableJson` reaches `errors` while `defs`
  stays empty.
- **G9.2 (no `"prose"` variant)** — `CellKindToken` match in `eval_cells`
  is exhaustive over `Math`/`Table`/`Js` only (`eval.rs:123-126`); no
  fourth variant added anywhere in the diff.
- **Generic routing, not per-kind special-casing** — Step 2 groups by
  `cell_id` in one pass before the per-cell map (`eval.rs:109-118`), so a
  `DuplicateDefinition` on a math cell and an `InvalidTableJson` on a table
  cell go through the identical code path; confirmed by the two respective
  tests.
- **R34(b) message fix** — `channel()`'s `NoLapContext` message now
  appends the recorded lap count (`host.rs:391-402`); verified byte-for-byte
  against both new/renamed tests: `"...lap table (no laps recorded)"` for
  the empty case and `"...lap table (3 laps recorded)"` for lap 7 of 3 —
  matches R34(b)'s example text exactly, including the parenthetical form.
- **R35 doc-only, no behaviour/trait change.** Diffed `core/src/math/eval.rs`
  (where `ChannelLookup` lives) against `f7c757b..79214d1` — zero lines
  changed, confirming no new trait method. `host.rs`'s only additions
  around `channel()` are: a doc-comment paragraph stating the `(id, lookup)`
  pairing is trusted and `id` is unread (`host.rs:359-366`), and a
  `// TODO(idl0):` naming L6 as the wave-2 owner with the reason the trait
  can't answer the question today (`host.rs:379-383`). No `ChannelLookup`
  method added, no wrapper function, `channel()`'s signature is unchanged
  (still `(lookup, name, lap, lap_ctx, other_session)` — confirmed same
  parameter list before/after in the diff hunk).
- **R37 fixture fix is a single-field, non-weakening change.** `git diff
  f7c757b..f1f5ce7 -- core/src/workbook/v3/mod.rs` touches exactly one
  line: `constants: { g: 9.80665, rider_mass_kg: 82 }` →
  `constants: { rider_mass_kg: 82 }` inside `WORKED_EXAMPLE`. Read the full
  updated string and the unchanged test body directly — every other
  character (id, name, both cell fences, the `js` cell body, the trailing
  prose interpolation) is byte-identical to the pre-fix string. The test
  `parse_workbook_c2_5_worked_example_parses_id_version_and_both_cells`
  still contains `assert!(errors.is_empty())` unchanged and unmoved, plus
  all its other structural assertions (`doc.id`, `doc.version`, cell
  count/kind/ids, fence-body substrings) untouched — nothing was removed
  to make the test pass; it passes because `merge_constants` no longer
  rejects the fixture's constants as `ReservedName`. Ran the filter above
  and confirmed this test is present and green among the 6.
- **Hygiene.** Both commits are single-line messages, no AI attribution
  trailer. `git show --stat` for both matches the brief's/ruling's file
  lists exactly (`eval.rs`, `host.rs`, `mod.rs` for Task 9; `mod.rs` alone
  for the R37 fix) — no stray files from `git add -A`. `docs/` untouched in
  either commit (checked via `git diff --stat -- docs/`, empty). Doc
  comments present on every new public symbol (`CellDefResult`,
  `CellError`, `CellEvalResult`, `eval_cells`), units n/a (no new numeric
  fields), no `Err(String)`, no unexplained `.unwrap()` on production data
  — the one `.expect()` in `math_cell_defs` (`eval.rs:151`) is guarded by a
  comment citing `resolve_workbook_defs`'s own documented invariant
  (verified: `resolve.rs` does insert an entry for every def handed to it,
  Ok or Err, regardless of references), which is the accepted pattern for
  an internal-invariant panic elsewhere in this lane. Tests named `thing —
  condition — result` (realized as underscore-joined identifiers), A/A/A
  with blank lines between sections. No `cargo fmt`-style reformatting —
  diff is additive/surgical except the fixture's one-token edit.

## Verdict rationale

`eval_cells`, `CellDefResult`, `CellError`, and `CellEvalResult` match
L3-R25's ruled shape exactly, route structural errors generically by
`cell_id` with front-matter ones correctly dropped (and not lost, since the
same `structural` vector reaches the eventual caller unfiltered), preserve
G9.4's table-cell success/failure distinguishability via a documented
caveat, and never introduce a `"prose"` variant. The R34/R35 folded-in Step
0 in `host.rs` is genuinely doc-only — no trait surface, no wrapper, no
behaviour change beyond the ruled message-text improvement — and the R37
fixture fix changes exactly the one token the ruling specifies, with the
test's assertions, including `errors.is_empty()`, left intact and now
truthfully passing. Tests cover every case the brief's Step 4 names. No
findings at any severity.

VERDICT: CLEAN
