# L3 Task 7 — implementer brief (table cells; C2 §4)

You are the implementer for L3 Task 7 of the idl1 rewrite — the seventh task
of the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 6 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 7` (474–505); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §4 (table-cell field table ~line 510, worked JSON example ~519–534); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks6-9.md`, Task 7 section (G7.1–G7.7,
  L3-R19–R20); ledger `R21` in `runs\2026-09-03\decisions.md` (approves L3-R19/20 as drafted);
  landed `core/src/table/model.rs` in full (small file, `TableModel`, `Row{context:
  Option<RowContext>, ...}`, `RowContext{session_id, lap_index}`, `Cell::default()`,
  `table/model.rs:13-58`) — shared with v2's `.idl0wb`, read-only, this plan's "v2 code is
  untouched" rule forbids editing it; the landed `workbook/v3/error.rs` (Task 2 —
  `WorkbookErrorKind`, per-kind constructors, `WorkbookError::new`), `cell.rs` (`CellDoc`,
  `CellKindToken::Table`), `mod.rs` (`parse_workbook`, `WorkbookDoc.cells`).

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). The
ONLY cargo build/test commands you run, as few times as TDD needs:
`cargo test -p idl-rs workbook::v3::table_cell` and `cargo test -p idl-rs table::` (once —
L3-R20 adds no behaviour there, but `CellDoc` is a shared struct). Every run must report a
non-zero `passed` count — a targeted filter that matches nothing is a failed gate, not a pass.
No full suite, no tarpaulin, no `-j`, no separate `cargo build`/`cargo check` (not required this
task — no `pub` signature reaching `idl-rs-cli` changes), no `.cargo/` edits, never
`cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 7, Steps 1–4) with these rulings
Plan 481's "Interfaces" paragraph does not describe anything compilable — it argues itself in a
circle and lands on "`kind` set to a plan-local constant string embedded in the message" (G7.1);
`WorkbookError.kind` is the `WorkbookErrorKind` enum (landed, Task 2), it cannot hold a string.
The same paragraph's "flag this as Open Question 2, assigned to the lead" is stale (G7.2):
ledger `R7` already approved "the stray-math-line **and malformed-table-JSON** error-kind
defaults" — do not re-raise it.

**Ruling (lead, R21) — L3-R19.** `parse_table_cell(cell_id: &str, fence_body: &str) -> Result<
TableModel, WorkbookError>` (L3-R2). Malformed JSON is a **new** `WorkbookErrorKind::
InvalidTableJson` with message `"Table cell JSON is malformed: <serde_json error text>"` — a
real variant, not a string smuggled through `message`, because C3's per-cell routing keys on
`kind`. R7 ruled the default; do not re-raise it. The variant's doc comment marks it provisional
pending the C2 §3.5.A amendment batch that already owns `InvalidFrontMatter`, `InvalidCellId`
and L3-R4's `workbook_*` C3 kinds. **Lead-owned to land in C2; L3 codes it now.**

**Ruling (lead, R21) — L3-R20.** Task 7's Files line is `workbook/v3/table_cell.rs` (create),
`workbook/v3/cell.rs` + `workbook/v3/mod.rs` + `workbook/v3/error.rs` (modify). `CellDoc` gains
`pub table: Option<TableModel>` (`TableModel` derives `Debug + Clone + PartialEq`, so `CellDoc`'s
derives still hold); `parse_workbook` fills it for `kind_token == Table` and pushes the error
into the collected `Vec<WorkbookError>` on failure. `table::validate` is **not** run at parse
time (dimension/cycle problems are evaluation-time, `table/eval.rs`) — stated so a reviewer
does not demand it. Step 1's test becomes: C2 §4's literal example parses `Ok`,
`columns[0].template == None`, `rows[0].context == Some(RowContext{session_id: "s1", lap_index:
1})`, `cells[0][1] == Cell::default()`. A `// TODO(idl0):` on `parse_table_cell` records G7.7
(no `deny_unknown_fields`, no `skip_serializing_if`) as the save path's problem, naming
`table/model.rs`. No serde attribute is changed — that is a v2 `.idl0wb` byte change.

### Step 1: Parse C2 §4's worked example (corrected — see L3-R20)
Test exactly the four assertions L3-R20 states above. Do NOT write the plan's own Step 1 test
(comparing `parse_table_cell` against `serde_json::from_str::<TableModel>` on the same text,
plan 485) — both sides make the same call, so any deserialization defect is invisible (G7.5).

### Step 2: Malformed JSON
Test: `fence body is not valid JSON — parse_table_cell returns Err(WorkbookError{kind:
InvalidTableJson, ...}), message includes the serde_json error text`.

### Step 3: Wire into `WorkbookDoc`
`mod.rs`: for a `CellDoc` whose `kind_token == Table`, eagerly parse via `parse_table_cell`
(unlike math cells, which stay lazy text until Task 9's eval pass — a table's JSON either
parses or it doesn't, there is no per-line partial result to preserve) and store the
`TableModel` on `CellDoc.table`, or push the parse error into the doc-level `Vec<WorkbookError>`
and leave `table` as `None`.

### Step 4: Test and commit
Run both filters, expect non-zero `passed`, `0 failed` each. Commit with explicit paths (NOT
`git add -A`): `git add core/src/workbook/v3/table_cell.rs core/src/workbook/v3/cell.rs
core/src/workbook/v3/mod.rs core/src/workbook/v3/error.rs` — message `workbook: v3 table-cell
fence body wired to table::model::TableModel (C2 §4)`. Single line, no AI attribution trailer.

## Do not
- Do not re-raise the plan's "Open Question 2" (plan line 481) — closed by ledger `R7`, which
  already covers "the stray-math-line **and** malformed-table-JSON error-kind defaults" (G7.2).
- Do not smuggle a kind through `message` as a plan-local constant string (plan line 481's
  fallback idea) — `InvalidTableJson` is a real `WorkbookErrorKind` variant (L3-R19); C3's
  per-cell routing keys on `kind`, a string inside `message` is invisible to it.
- Do not write the plan's Step 1 round-trip test verbatim (plan 485) — it is tautological (G7.5).
- Do not add `context` as a top-level `TableModel` field (G7.6) — it is `Row.context`; C2 §4's
  field table (spec line 510) is misleading on this point, `table/model.rs:27` is ground truth.
- Do not change any `serde` attribute on `table::model` to fix G7.7's round-trip gaps — it is
  shared with v2's `.idl0wb`, out of scope for this lane. Add the `// TODO(idl0):` instead.
- Do not run `table::validate` from `parse_table_cell` or Step 3's wiring — dimension/cycle
  checks are evaluation-time, not this task's.

## Style / hygiene
Doc comment on every public symbol; units where numeric (none new here); typed errors only;
A/A/A tests named `thing — condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §4 is the existing `table::model` verbatim; `InvalidTableJson`'s
landing in the signed contract is the lead's ledger-R21 batch, not this task's.

## Report back (concise)
Commit hash + `git show --stat`; both test commands and result lines (with `passed` counts);
per-step done/deviated; confirmation the `// TODO(idl0):` cites both G7.7 gaps (missing
`deny_unknown_fields`, missing `skip_serializing_if`); confirmation `context` was NOT added as a
top-level field; anything ambiguous you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).
