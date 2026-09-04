# L3 Task 4 review — constants: flat table, universal-constant guard, parser wiring (C2 §3.1–3.2)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. In scope: `2d8e4b6` (Task 4 —
`core/src/math/parse.rs`, `core/src/workbook/v3/constants.rs` (new),
`core/src/workbook/v3/mod.rs`). Also reviewed for context (per dispatch,
Step 0 of this lane's Task 4 dispatch): `668a483` (const-line leading-minus
fix, R24, and Task 3 review minors — `core/src/workbook/v3/math_cell.rs`
only). Worktree HEAD = `2d8e4b6`, status clean at review time; nothing else
uncommitted or out of scope.

## Test command and result

Dispatch mandated two commands with implementer-reported counts
(`workbook::v3` → 48, `parse_with_constants` → 3); the task's own brief
(`brief-task4.md`, L3-R8) specifies a narrower first filter
(`workbook::v3::constants` → 6). I ran the narrower brief filter first, then
the dispatch's broader filter, since the dispatch is the specific
instruction governing this review and its counts are what I was told to
reproduce. Both non-zero, both `0 failed`.

```
$ cargo test -p idl-rs workbook::v3::constants
running 6 tests
... (all `ok`)
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 738 filtered out; finished in 0.00s
```

```
$ cargo test -p idl-rs workbook::v3
running 48 tests
... (all `ok`)
test result: ok. 48 passed; 0 failed; 0 ignored; 0 measured; 696 filtered out; finished in 0.01s
```

```
$ cargo test -p idl-rs parse_with_constants
running 3 tests
test math::parse::tests::parse_with_constants_pi_in_table_still_resolves_to_the_builtin_pi ... ok
test math::parse::tests::parse_with_constants_bare_identifier_k_evaluates_as_literal_9_81 ... ok
test math::parse::tests::parse_with_constants_unknown_identifier_is_parse_error ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 741 filtered out; finished in 0.00s
```

Reproduces the implementer's reported 48/48 and 3/3 exactly. Per dispatch
instruction, `cargo check -p idl-rs-cli --tests` was **not** re-run; the
implementer reports it clean, taken on trust.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/workbook/v3/constants.rs:86` | `DuplicateConstant` for a `const` line colliding with an earlier front-matter constant is reported at `"front-matter"` instead of the colliding line's own `cell_id`. Per lead ruling (`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 4 landed"), this is wrong: L3-R25's `eval_cells` drops front-matter-scoped errors (already fatal or returned separately), so a `"front-matter"`-scoped `DuplicateConstant` silently vanishes from the notebook — the author never sees it. C2 §3.5 also frames these as "per-cell" errors. The implementer followed `error::duplicate_constant`'s own doc comment (`error.rs:100–102`) literally, but that doc comment is itself wrong. | Change line 86 to `error::duplicate_constant(&line.cell_id, &line.name)`; fix `merge_constants`'s doc comment (lines 34–42) to say the collision always reports at the *second occurrence's* cell regardless of which source claimed the name first; fix `error::duplicate_constant`'s doc comment (`error.rs:100–102`) to drop the `"front-matter"` case; update the `same_name_in_front_matter_and_a_const_line_duplicate_constant` test (`constants.rs:111–125`) to assert `errors[0].cell_id == "aaaaaaaa"` (the const line's id), not `"front-matter"`. `"front-matter"` remains correct for `ReservedName` (both call sites, lines 68 and 81, are correct as-is) and for a duplicate *within* front matter itself. |

No other Critical or Important findings.

No Minor findings — the diff is additive/surgical, doc comments are present
and accurate elsewhere, no `Err(String)`, no unexplained `unwrap`/`expect`
on production-path data, message strings match C2 §3.5.A byte-for-byte
(unchanged, since this task didn't touch those constructors), and tests
follow the A/A/A + `thing — condition — result` naming convention.

## Checks performed (all pass)

- **Signature.** `merge_constants(front_matter: &HashMap<String, ConstantRaw>, const_lines: &[ConstLine]) -> (HashMap<String, f64>, Vec<WorkbookError>)` matches the brief's corrected (Task-3-`ConstLine`-based) signature exactly.
- **`ConstantRaw` value extraction.** `Number(v) → v`, `WithUnit { value, .. } → value`; `unit_display` never consulted — matches C2 §3.1 and the brief.
- **`RESERVED_NAMES` imported, not redeclared.** `constants.rs` does `use super::error::{self, WorkbookError};` and references `error::RESERVED_NAMES` — the 15-entry set built by Task 2 (confirmed still 15 via `error.rs`'s `reserved_names_has_exactly_15_entries` test, present in the 48-test run). No local redeclaration.
- **`ReservedName` enforcement over both sources, case-sensitive.** Front-matter loop (`constants.rs:66–70`) and const-line loop (`:79–83`) both check `RESERVED_NAMES` before merging; a reserved name is `continue`d past, never inserted into `table` or `owners`. Tests cover `g` (universal constant), `session` (host var, L3-R10's explicit case), and `const` (keyword) from front matter; `math_cell.rs`'s own tests (Task 3, in the 48-test run) cover `Time`/`Distance`/`pi`/`channel` from `const`/`def` lines at the grammar level.
- **`ReservedName` `cell_id` placement.** Front-matter source → `"front-matter"` (line 68); `const`-line source → the line's own `cell_id` (line 81) — matches the brief exactly (this is the one place `"front-matter"` for a `Reserved`/`Duplicate` kind is *not* a bug, since the offending declaration genuinely lives in front matter).
- **`DuplicateConstant` "first claim wins the table entry."** Both `two_const_lines_named_k` and `same_name_in_front_matter_and_a_const_line` tests confirm the *value* in `table` is the first declaration's, only the `cell_id` on the reported error is wrong for the front-matter-first case (see Findings).
- **Front-matter constants with spaces (G4.5).** `"rider mass"` accepted and present in the table (test at `constants.rs:188–200`); doc comment (`:49–57`) states the JS-`constants`-object-only reachability and that the math-cell tokenizer can never produce a spaced bare identifier — matches the brief's "document, don't fix" instruction verbatim.
- **`parse_with_constants` signature and precondition.** `pub fn parse_with_constants(src: &str, constants: &HashMap<String, f64>) -> Result<Ast, MathEvalError>`; doc comment (`parse.rs:80–93`) states the no-enforcement-here precondition and that `constant_value` (universal four) is checked first and always wins — matches L3-R9.
- **`parse()` unchanged behaviour.** `parse(src)` is now `parse_with_constants(src, &HashMap::new())` — zero-constants call, no allocation; `parse_with_empty_constants_table_equals_parse` test asserts `parse(expr) == parse_with_constants(expr, &HashMap::new())` for `"1 + [X] * g"`. `Ast` and `MathEvalError` both derive `PartialEq`, so the equality assertion compiles and is meaningful.
- **`parse_primary` fallback order.** Read at `parse.rs:266–286`: call → `constant_value` (universal four, unchanged position) → `self.constants.get(&name)` (new, inserted between) → `Unexpected identifier` error (unchanged). Matches "universal-four → table → error" exactly.
- **Step 1 test corrections (L3-R9).** All three present and correct: `k * 2` with `{"k": 9.81}` asserts on the produced `Ast` (`Binary{Mul, Number(9.81), Number(2)}`); `pi * 2` with `{"pi": 1.0}` in the table still resolves to the built-in `π` (asserted via `std::f64::consts::PI`), not the table's `1.0`; `nope * 2` with an empty table asserts `err.kind == Parse` and `err.message.contains("Unexpected identifier \"nope\"")` as a substring — the full landed message (with the em dash, confirmed U+2014 at `parse.rs:284`, unchanged by this diff) is not re-transcribed.
- **No new dependency.** `constants.rs` and the `parse.rs` changes are `HashMap`-only; no `Cargo.toml` change in this diff.
- **CLAUDE.md §5 (docs/errors/units).** Doc comment on `merge_constants`, `parse_with_constants`, `Parser<'a>`'s new field understood via the function doc (no separate field doc, consistent with the existing undocumented `tokens`/`pos` fields — pre-existing pattern, not a regression); units stated ("Constant values are unitless scalars throughout this function," `constants.rs:47`; `unit_display` called out as display-metadata-only). No `Err(String)`; `WorkbookError`/`MathEvalError` (typed, `Display` + `std::error::Error`, pre-existing) used throughout. No unexplained `unwrap()`/`expect()` outside `#[cfg(test)]`.
- **No reformatting.** `git diff 668a483..2d8e4b6` is additive/surgical — the `Parser` → `Parser<'a>` and `impl Parser` → `impl<'a> Parser<'a>` changes are the minimal edits needed for the new borrowed field; no unrelated whitespace/import churn.
- **Hygiene.** Commit message is one line, no AI attribution trailer; `git show --stat` lists exactly the three files the brief's `git add` command named; `docs/` untouched by this commit; shared checkout `idl1-app/rust` confirmed still clean and on `main`.
- **Scope.** `merge_constants` is infrastructure only in this task — `parse_workbook` (`mod.rs`) does not yet call it (confirmed by reading `mod.rs` in full); wiring it into evaluation is a later task's job, consistent with the brief's Steps 1–4 (parser + merge function, not full pipeline integration).

## Verdict rationale

The parser-wiring half (Step 2, `parse_with_constants`) and the `parse()`
equivalence/precondition documentation are exactly right, matching L3-R9's
corrected tests and the universal-four → table → error fallback order
byte-for-byte. `ReservedName` enforcement (Step 3) correctly covers all 15
names from both sources, case-sensitive, imported not redeclared, with the
front-matter-with-spaces case correctly accepted and documented rather than
"fixed." The one defect is `DuplicateConstant`'s `cell_id` when the first
claimant is a front-matter constant: it reports at `"front-matter"` instead
of the colliding `const` line's own cell, which per the lead's ruling would
make the error silently disappear once `eval_cells` lands (L3-R25 drops
front-matter-scoped errors). The implementer's doc comment matches the
(also-wrong) pre-existing `error::duplicate_constant` doc comment it was
transcribing, so this reads as a slip that traces back to Task 2's doc
comment rather than a fresh invention. The fix is small and mechanical: one
line changed in `constants.rs`, two doc comments corrected, one test
assertion updated — no rework of the approach.

VERDICT: NEEDS_FIXES
