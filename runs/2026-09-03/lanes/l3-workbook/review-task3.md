# L3 Task 3 review — math-cell definition/const-line grammar (C2 §3.1)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commits under review: `38fce89` (Step 0 — Task 2 review Minor
fix, `front_matter.rs`) and `58c3ef9` (Task 3 proper, `math_cell.rs` + `mod.rs`), parent
`abe6a75`. HEAD at review time: `58c3ef9` (working tree clean — confirmed). In scope: both
commits' diffs (`git diff abe6a75..38fce89`, `git diff 38fce89..58c3ef9`). Nothing else was
present in the worktree (no uncommitted/unrelated changes).

## Test command and result

Dispatch-specified command (`cargo test -p idl-rs workbook::v3`, run once):

```
running 38 tests
... (all 38 listed tests) ...
test result: ok. 38 passed; 0 failed; 0 ignored; 0 measured; 692 filtered out; finished in 0.00s
```

Reproduces the implementer's reported `38 passed` exactly, including the
`workbook::v3::math_cell::*` subset (`14 passed` within the 38 — matches the reported
subset count). No failures. Non-zero `passed` — gate satisfied.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/workbook/v3/math_cell.rs:220` (`const_line_const_k_eq_9_80665_const`) | Test name encodes the value `9.80665` (gravity, `g`) but the test body parses `"const k = 9.81"` and asserts `value: 9.81` — name doesn't match condition/expected per CLAUDE.md §4's `thing — condition — result` convention. Functionally correct, just mislabeled (looks like a copy-paste from a nearby `g`-flavoured example). | Rename to `const_line_const_k_eq_9_81_const` (or change the literal to `9.80665` if that was the intended fixture — either resolves the mismatch). |
| Minor | `core/src/workbook/v3/math_cell.rs` (`classify_const_line`, `fallback_name`) | Judgment call (a) — a `const` line with no `=` or a non-numeric RHS (e.g. `"const k"`, `"const k = abc"`) correctly falls through to `InvalidIdentifier` naming `"const k"` (unmodified C2 §3.5.A template, verified by tracing both code paths), and the behaviour is documented in `fallback_name`'s doc comment — but neither case has a dedicated test. The brief's own Step-1 test list doesn't require one either, so this isn't a missed *required* test, just a coverage gap on a documented edge case. | Add `const_line_no_equals_invalid_identifier` and/or `const_line_non_numeric_value_invalid_identifier` cases (small, mechanical). |

**No Critical or Important findings.**

**Lead-ruling item, resolved by the spec text itself (flagged separately per the dispatch's
own contingency, not because the implementation is wrong):** judgment call (b) — whether a
`const` line's RHS should accept a leading `-`. C2 §3.1's `const_line` grammar ties `number`
by explicit reference to `crate::math::token`'s `Number` literal, and I traced that
tokenizer (`core/src/math/token.rs:88-110`): a leading `-` is always emitted as a separate
`Minus` token (line 187), never folded into `Number` — unary negation is handled at the
*parser* level (`unary` production, C2 §3.2), not the *tokenizer*'s `Number` terminal. Since
`const_line`'s grammar explicitly says `"=" number` and not `"=" expression` or `"=" unary`,
and `number` is defined nowhere else in C2 except by that one reference, C2 does literally
forbid a sign on a `const` line's RHS — this is a different, textually separate grammar
production from front matter's `constants:` unit-suffix regex (`/^\s*(-?\d+...)/`, §3.1),
which allows `-` in a wholly different context (a YAML string value, not this EBNF). The
implementer's `parse_bare_number` (`math_cell.rs:198-207`) correctly implements this and
says so in its own doc comment. Per the dispatch's contingency this is a Minor
observation, not a defect: **`const offset = -1.5` being rejected while front matter's
`offset: -1.5` is accepted is spec-literal, not a bug** — but it is a real asymmetry an
author will hit (front matter allows a negative constant, an inline `const` line doesn't,
with no expression-level escape hatch since `const_line` never falls through to full
`expression` parsing). Worth a deliberate lead call on whether to widen `const_line`'s grammar
in a future C2 revision; not blocking this task, which conforms to the spec as written.

## Checks performed (all pass)

- **L3-R5 (no `regex` crate).** `core/Cargo.toml` diff between `abe6a75` and `58c3ef9` is
  empty. `identifier` (`is_identifier`) and the trailing-comment scan
  (`split_trailing_comment`) are both hand-written char/byte scans matching `math/token.rs`'s
  and `math/resolve.rs`'s house style.
- **L3-R6 classification order**, traced line-by-line against `classify_line`: comment strip
  (outside double-quoted strings, preceded by whitespace) → blank → leading-`#` comment →
  `const` + required whitespace (not `starts_with`, closes G3.2 — traced `"constant = [X]"`
  through the code: `strip_prefix("const")` leaves `"ant = [X]"`, which does not start with a
  space/tab, so it correctly falls through to the `def_line` branch) → contains `=` →
  else `InvalidIdentifier` with the unmodified template, `<name>` = trimmed text up to first
  `=` (`fallback_name`) or the whole trimmed line. Order in code matches exactly.
- **G3.3 (in-string `#`).** `split_trailing_comment` toggles `in_string` on every `"` and only
  splits at a `#` that is both outside a string and immediately preceded by whitespace; traced
  `x = detrend([X], "no#ne") # trailing comment` — the in-string `#` is skipped, the real
  trailing comment is found correctly. Verified by the passing test.
- **`# label:` annotation.** `extract_label` matches "optional leading whitespace, literal
  `label`, a colon, then free text" — traced both the labeled and plain-comment test cases by
  hand; matches C2 §3.1's prose rule. (It also tolerates whitespace between `label` and `:`,
  which C2's prose doesn't explicitly cover either way — harmless over-permissiveness, not
  flagged as a finding since no test or spec line contradicts it.)
- **`identifier` scanner.** `is_identifier` matches `/[A-Za-z_][A-Za-z0-9_]*/` exactly —
  ASCII-alphabetic-or-underscore first char, ASCII-alphanumeric-or-underscore thereafter, empty
  string correctly rejected (traced the `"const = 5"` no-name case).
  No `regex` crate.
- **`RESERVED_NAMES` reused, not redeclared.** `math_cell.rs` imports `super::error::{self,
  WorkbookError}` and calls `error::RESERVED_NAMES.contains(&name)` — no second list. `error.rs`
  has zero diff in this commit (Task 2's file untouched).
- **`parse_math_cell_body(cell_id: &str, body: &str) -> (Vec<MathCellLine>, Vec<WorkbookError>)`**
  — signature matches L3-R2 exactly.
- **`MathCellLine` shape** — `Blank`, `Comment`, `Const { name, value, unit_display }`,
  `Def { name, expr_text, label }` — matches plan line 263's shape unchanged; `unit_display` on
  `Const` is hard-coded `None` from this parser (traced both construction sites), matching the
  brief's "do not attempt to parse a unit suffix out of a `const_line`" instruction.
- **`ConstLine`** defined once, in `mod.rs`, with the exact field set specified
  (`cell_id: String, name: String, value: f64, unit_display: Option<String>`), all `pub`.
- **Task 3 raises `DuplicateDefinition` only.** `mod.rs`'s flatten loop pushes
  `error::duplicate_definition` for a repeated `Def` name (against a document-wide `HashSet`
  that also catches within-cell repeats, a superset of the required cross-cell case) and never
  calls `duplicate_constant` — `Const` lines are only collected into `const_lines`, per G3.6 /
  the "single enforcement point" ruling. `error.rs`'s `duplicate_constant` constructor exists
  (from Task 2) but is unreferenced by this commit.
- **L3-R7 widening (`Time`/`Distance` → `ReservedName`)** — both already present in Task 2's
  15-entry `RESERVED_NAMES`; `validate_identifier` checks every `def_line`/`const_line` name
  against that one constant (no second hard-coded list), case-sensitive (`&str` equality).
  Confirmed via the `def_line_name_time_reserved_name` and
  `const_line_name_distance_reserved_name` tests, both passing. No shadowing-test variant was
  written (correctly — that superseded proposal is explicitly not to be used per the brief).
- **G3.5 (`and`/`or`/`not` not added to `RESERVED_NAMES`).** Confirmed — `RESERVED_NAMES` is
  untouched (still 15 entries, `error.rs` has zero diff) and no code path in `math_cell.rs`
  treats these keywords specially.
- **Message byte-for-byte vs. C2 §3.5.A** (`InvalidIdentifier`, `ReservedName`,
  `DuplicateDefinition`): all three constructors are Task 2's, unmodified by this commit;
  spot-checked the em dash (`\u{2014}`) and ASCII apostrophes against the C2 spec text
  directly — match.
- **Step 2 whole-document flatten.** `parse_workbook` in `mod.rs` iterates every cell, skips
  non-`Math` kinds, calls `parse_math_cell_body(&cell.id, &cell.raw_fence_body)`, and folds
  `Def`/`Const` lines into `def_names`/`const_lines` respectively; `DuplicateDefinition`'s
  `cell_id` is the cell holding the *second* occurrence, matching `error.rs`'s own doc comment
  for that constructor. New test
  `same_identifier_defined_in_two_different_math_cells_duplicate_definition_both_cells_still_parse`
  passes and both cells are confirmed still present in `doc.cells`.
- **CLAUDE.md §4 (testing).** All 14 `math_cell` tests and the 1 `mod.rs` integration test use
  Arrange/Act/Assert with blank-line separation (`Arrange` comment present only where
  non-obvious, matching the surrounding file's convention) and `thing — condition — result`
  names realized as underscore-joined identifiers — one naming/value mismatch flagged above.
  Every required test from the brief's Step 1 and Step 2 lists is present; no test re-covers
  Task 1/Task 2 territory (cell scanning, front matter).
- **CLAUDE.md §5 (docs/errors).** Doc comment on every public symbol (`MathCellLine` and its
  variants, `parse_math_cell_body`, `ConstLine` and its fields) and on every private helper too
  (a courtesy beyond the requirement). `value: f64` documented as unitless/raw scalar on both
  `MathCellLine::Const` and `ConstLine`. No `Err(String)`. No unexplained `.unwrap()`/`.expect()`
  on production-path data — the one `.ok()?` (`parse_bare_number`) discards a typed
  `MathEvalError` deliberately, converting "not a bare number" into `None` for the caller to
  turn into `InvalidIdentifier`, not a panic.
- **No reformatting.** Diff is purely additive (`math_cell.rs` new file; `mod.rs`'s existing
  lines are untouched except the surgical insertions needed for Task 3's wiring). Style
  (long single-line signatures, brace placement) matches `error.rs`/`front_matter.rs`.
- **Hygiene.** Both commit messages are single-line, no AI attribution trailer. `58c3ef9`
  touches exactly `core/src/workbook/v3/math_cell.rs` and `core/src/workbook/v3/mod.rs` (`git
  show --stat`) — `error.rs` was listed in the brief's `git add` but has no diff, harmless.
  Nothing under `docs/` touched. Shared checkout
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` not touched (out of scope for this
  worktree entirely). No push.
- **Spec discipline.** Report's "no spec change needed" is accurate — nothing in this commit
  amends C2 §3.1; the `Time`/`Distance` widening was already landed in the spec text by the
  lead before this task started.

## Verdict rationale

The implementation is correct and precisely matches every ruling in the task's brief: L3-R5
(no regex), L3-R6 (exact classification order, traced by hand against the tricky G3.2/G3.3
cases), L3-R7 (`Time`/`Distance` widened into `ReservedName` via the shared `RESERVED_NAMES`
list, not a second one), the corrected `parse_math_cell_body` signature, the `ConstLine` shape,
and the G3.6 single-enforcement-point split with Task 4 (`DuplicateDefinition` here,
`DuplicateConstant` deferred). The test suite reproduces the implementer's reported `38
passed`/`0 failed` exactly and covers every required case from the brief. The only two findings
are cosmetic: a test name that doesn't match its own literal (a one-word rename), and a
documented-but-untested edge case that the brief itself didn't require a test for. The
sign-on-`const`-value question the dispatch specifically asked me to adjudicate resolves in the
implementer's favor — C2's `number` production is textually tied to a tokenizer terminal that
structurally excludes the sign, so the current rejection is spec-conformant, not a bug (flagged
above as a possible future spec asymmetry worth a lead decision, not as a fix owed by this
task). Both Minor findings are small and mechanical; neither warrants withholding approval.

VERDICT: CLEAN
