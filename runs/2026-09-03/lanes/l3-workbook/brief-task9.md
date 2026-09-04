# L3 Task 9 — implementer brief (cell evaluation orchestrator; shape matches C3 §3.4)

You are the implementer for L3 Task 9 of the idl1 rewrite — the ninth and
last task of this batch of the core workbook-v3 lane. TDD, one commit, then
report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 8 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 9` (581–645); contract C3
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c3-ipc-surface.md`
  §3.4 (`CellOutput`, "one entry per cell, in document order", spec line 449, `kind: "math" |
  "table" | "js" | "prose"` at line 453 — the `"prose"` variant is a known contract bug, see
  below); the pre-read `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks6-9.md`, Task 9 section
  (G9.1–G9.5, L3-R25–R27); ledger `R21` in `runs\2026-09-03\decisions.md` ("L3-R25 is
  provisional against L3-R26 exactly as the pre-read says" — L3-R26 is lead-owned, listed below
  for context only; do not edit C3 or any other contract file); landed `workbook/v3/resolve.rs`
  (Task 6 — `resolve_workbook_defs`'s `HashMap<String, Result<EvalOutput, MathEvalError>>`,
  `WorkbookDoc.defs: Vec<MathCellDef>` with `order`, `WorkbookDoc.constants`),
  `workbook/v3/host.rs` (Task 8 — `to_host_channel`), `workbook/v3/table_cell.rs`+`cell.rs`
  (Task 7 — `CellDoc.table: Option<TableModel>`), `workbook/v3/error.rs`+`mod.rs`
  (`WorkbookError{cell_id, kind, message}`, the `"front-matter"` cell_id convention,
  `parse_workbook`'s returned `Vec<WorkbookError>`, `WorkbookDoc.cells: Vec<CellDoc>` in
  document order, `CellKindToken` — three variants: `Math`/`Table`/`Js`, no `Prose`).

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). While
working: `cargo test -p idl-rs workbook::v3::eval`, non-zero `passed`. **Then, per L3-R27, and
only because this is the last task of the Tasks 6–9 batch, run ONE additional end-of-batch
gate**: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`. Every `test result:` line must
show `0 failed`. **Never `cargo test --workspace`** (standing rule, R13/R19) — the two-crate
form above is the correct end-of-batch command, not a substitute for it. No tarpaulin, no `-j`,
no `.cargo/` edits, never `cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 9, Steps 1–4) with these rulings
The plan's stated struct (`CellEvalResult{cell_id, kind, host_value: Option<HostChannel>,
error: Option<MathEvalError>}`, plan 590–596) is superseded — it has no delivery path for
structural errors (G9.1: `parse_workbook`'s `Vec<WorkbookError>` is never threaded in), assumes
a `"prose"` cell kind that doesn't exist in this lane's code or in C2 (G9.2: `CellKindToken`
has three variants, a prose span has no `cell_id`), contradicts C3 §3.4's own "one entry per
cell" against the plan's stated "one entry per definition" default (G9.3, the plan's Open
Question 3 — closed below against that default), and makes a successful table cell
indistinguishable from a silently-skipped one (G9.4).

**Ruling (lead, R21) — L3-R25, PROVISIONAL against L3-R26 below.** **One `CellEvalResult` per
cell** (C3 §3.4 literally), closing the plan's Open Question 3 against its stated default:
```
pub struct CellDefResult { pub name: String, pub label: Option<String>,
                           pub value: Option<HostChannel>, pub error: Option<MathEvalError> }
pub enum CellError { Structural(WorkbookError), Eval(MathEvalError) }
pub struct CellEvalResult { pub cell_id: String, pub kind: CellKindToken,
                            pub defs: Vec<CellDefResult>,      // math cells; def_line order
                            pub errors: Vec<CellError> }       // structural + cell-level
pub fn eval_cells(doc: &WorkbookDoc, structural: &[WorkbookError],
                  lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> Vec<CellEvalResult>;
```
`cell_id` stays unique, per-definition addressing survives for L6 (C2 §5.1 binds one host
variable per definition), and `structural` errors are routed to their owning cell by
`WorkbookError.cell_id` (L3-R2), with `"front-matter"`-scoped ones dropped here — they are
already fatal or returned separately by `parse_workbook`. Ordering: document order, and within
a math cell, `def_line` source order via `MathCellDef.order`. Code this struct/enum/fn exactly
as written above — **do not edit any contract file to match it**; the correction lands in C3
via L3-R26, separately, by the lead.

**L3-R26 (lead, not L3 — for context only, do not implement or edit contracts).** Three C3
§3.4 corrections to land with L3-R4's amendment batch, before L5's workbook-command task: (a)
drop `"prose"` from `CellOutput.kind` — prose travels as `prose_before`/`prose_after` on its
owning cell (C2 §2.4), and a prose span has no id; (b) state that a `table` cell's `value` is
the `TableModel` plus `table::eval`'s `CellResult` grid, so success is representable (G9.4); (c)
add the `workbook_*` kinds L3-R4 already asks for, now including `workbook_invalid_table_json`.

### Step 1: One `CellEvalResult` per cell, in document order
Iterate `doc.cells` (already document order). For a `Math` cell: for every `MathCellDef` whose
`cell_id` matches, look up its resolved result in `resolve_workbook_defs`'s output map by name;
build one `CellDefResult{name, label, value: Some(to_host_channel(out.t_us, out.samples)) on
Ok, error: Some(err) on Err}`, in `MathCellDef.order` order, pushed into that cell's `defs`. For
a `Table` or `Js` cell, `defs` stays empty — **G9.4:** a table cell's success value lives on
`CellDoc.table`, not on this struct; document this explicitly on `CellEvalResult.defs`'s doc
comment ("L5 reads `CellDoc.table` for a table cell's value; this struct carries only
structural errors for it") so L5 doesn't go looking for it here.

### Step 2: Route structural errors by `cell_id`
For each `WorkbookError` in the `structural` parameter, find the `CellEvalResult` whose
`cell_id` matches and push `CellError::Structural(err)` into its `errors`; an error whose
`cell_id == "front-matter"` is dropped here (G9.1) — it is not cell-scoped and is already
handled elsewhere by `parse_workbook`'s caller. This is how a `Table` cell's `InvalidTableJson`
(Task 7) and a `Math` cell's `DuplicateDefinition`/`InvalidIdentifier`/`ReservedName` (Tasks
2–3) both reach a cell — no separate per-kind wiring needed. `Js`/prose-adjacent cells get no
structural errors from this lane's parsing in practice, but the routing is generic, not
special-cased per kind.

### Step 3: Ordering
`Vec<CellEvalResult>` in document order (`doc.cells`'s order), one entry per cell — a
multi-definition math cell's extra definitions are nested inside that one entry's `defs` (not
extra top-level entries), in `def_line` source order via `MathCellDef.order` (deterministic,
tested).

### Step 4: Test and commit
Tests: `workbook with two math cells (one two-definition, one single), a table cell, a js cell —
eval_cells returns one entry per cell in document order, the two-definition cell's entry has two
CellDefResults`; `one definition errors, its cell's other definition still returns a value`
(CLAUDE.md §5 at this integration layer); `a cell with a DuplicateDefinition structural error —
the error appears in that cell's errors, siblings still evaluate`; `a "front-matter"-scoped
structural error — dropped, appears on no cell`.

Run `cargo test -p idl-rs workbook::v3::eval`, non-zero `passed`, `0 failed`. Then run the
end-of-batch gate (COMPUTE RULES above), `0 failed` across both crates. Commit with explicit
paths (NOT `git add -A`): `git add core/src/workbook/v3/eval.rs core/src/workbook/v3/mod.rs` —
message `workbook: v3 per-cell evaluation orchestrator (Tauri-free; shape matches C3 §3.4)`.
Single line, no AI attribution trailer.

## Do not
- Do not add a `"prose"` variant to `CellEvalResult.kind` or produce an entry for a prose span
  (G9.2) — `CellKindToken` has three variants, `Math`/`Table`/`Js`, none of them `Prose`.
- Do not follow the plan's "one `CellEvalResult` per definition" default (plan 611–616, its own
  Open Question 3) — L3-R25 closes it the other way: one per cell, `defs: Vec<CellDefResult>`
  nested instead.
- Do not edit `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` or any other contract
  file for L3-R26 — lead-owned, provisional; code L3-R25 exactly as written above.
- Do not leave a table cell's success/failure indistinguishable (G9.4) — its structural error
  (if any) must appear in `errors` via Step 2's routing; document that its success value lives
  on `CellDoc.table`, not on `CellEvalResult`.
- Do not run `cargo test --workspace` for the end-of-batch gate — use
  `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` (L3-R27).

## Style / hygiene
Doc comment on every public symbol, including a loud one on `CellEvalResult.defs`/`errors`
explaining the G9.4 table-cell caveat; units where numeric (none new here — `to_host_channel`
already handles the seconds/µs boundary); typed errors only; A/A/A tests named `thing —
condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — shape matches C3 §3.4's `CellOutput` (Tauri-free Rust equivalent; L5
maps it 1:1 to JSON). L3-R26's three corrections to the signed C3 text are the lead's, tracked
in ledger R21 — not built or touched here.

## Report back (concise)
Commit hash + `git show --stat`; the per-module test command result, plus the end-of-batch
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` result (both, with `passed`/`failed`
counts); per-step done/deviated; confirmation `CellEvalResult` matches L3-R25's shape exactly,
byte-for-byte; confirmation no contract file was touched; anything ambiguous you resolved (say
how) or that needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
