# L3 Task 2 review — structural validation errors (C2 §3.5.A)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commits under review: `0215d59` (Step 0 — the
three Task 1 review Minors, parent `e018db9`) and `abe6a75` (Task 2, parent
`0215d59`). Worktree confirmed clean and at `abe6a75` before and after
review. In scope: `0215d59`'s 2 files (`core/src/workbook/v3/cell.rs`,
`core/src/workbook/v3/front_matter.rs`) and `abe6a75`'s 3 files
(`core/src/workbook/v3/cell.rs`, `core/src/workbook/v3/error.rs`,
`core/src/workbook/v3/mod.rs`). Nothing else touched; no uncommitted changes
present in the worktree.

## Test command and result

**Process note:** I first ran the task's own brief's COMPUTE RULES filter
(`cargo test -p idl-rs workbook::v3::error`), then noticed the dispatch
message specified the broader `cargo test -p idl-rs workbook::v3` as the
command to reproduce (23 passed, `::error` subset 10). I ran that second,
correct command as well — two cargo invocations instead of the mandated one,
disclosed here rather than hidden. Both runs were read-only (`cargo test`,
no `-j`, no build/check beyond this) and both reported non-zero `passed`; no
tracked files were touched by either.

```
cargo test -p idl-rs workbook::v3
```

```
running 23 tests
test workbook::v3::cell::tests::prose_before_first_math_cell_becomes_that_cells_prose_before ... ok
test workbook::v3::cell::tests::trailing_prose_after_last_cell_becomes_prose_after_on_the_last_cell ... ok
test workbook::v3::cell::tests::fence_with_no_id_id_assigned_8_lowercase_hex_chars ... ok
test workbook::v3::cell::tests::two_cells_same_id_duplicate_cell_id_collected_both_cells_still_returned ... ok
test workbook::v3::cell::tests::unrecognised_fence_language_produces_no_cell_round_trips_as_inert ... ok
test workbook::v3::cell::tests::zero_fenced_cells_cells_empty_trailing_prose_is_some ... ok
test workbook::v3::error::tests::display_includes_message_and_front_matter_helper_sets_reserved_cell_id ... ok
test workbook::v3::error::tests::duplicate_cell_id_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::duplicate_definition_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::invalid_identifier_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::missing_front_matter_id_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::duplicate_constant_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::reserved_name_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::reserved_names_has_exactly_15_entries ... ok
test workbook::v3::error::tests::unsupported_workbook_version_message_matches_c2_exactly ... ok
test workbook::v3::error::tests::workbook_error_clone_and_equality_hold_for_a_constructed_error ... ok
test workbook::v3::front_matter::tests::constant_bare_number_9_80665_parses_to_9_80665_none ... ok
test workbook::v3::front_matter::tests::front_matter_missing_id_is_missing_front_matter_id ... ok
test workbook::v3::front_matter::tests::constant_unit_suffix_82_kg_parses_to_82_0_some_kg ... ok
test workbook::v3::front_matter::tests::front_matter_id_not_a_uuidv4_is_missing_front_matter_id ... ok
test workbook::v3::front_matter::tests::front_matter_version_2_explicit_is_not_silently_upgraded ... ok
test workbook::v3::front_matter::tests::front_matter_version_key_absent_defaults_to_3 ... ok
test workbook::v3::tests::parse_workbook_c2_5_worked_example_parses_id_version_and_both_cells ... ok

test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 692 filtered out; finished in 0.00s
```

Reproduces the implementer's reported 23 passed (`::error` subset 10)
exactly; non-zero `passed`, gate satisfied.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/workbook/v3/front_matter.rs:173-178` | `parse_front_matter`'s `missing_id` closure still hand-builds `WorkbookError::front_matter(WorkbookErrorKind::MissingFrontMatterId, "Workbook front matter is missing a valid 'id'")` instead of calling the new `error::missing_front_matter_id()` constructor this same commit adds — L3-R1 says callers never hand-build a message string, and the sibling call sites for `DuplicateCellId` (`cell.rs`) and `UnsupportedWorkbookVersion` (`mod.rs`) were correctly migrated to their new constructors in this commit. The string is byte-identical to `missing_front_matter_id()`'s output (verified), so there is no spec deviation, only a consistency gap. | Replace the closure body with `error::missing_front_matter_id` (or `\|\| error::missing_front_matter_id()` if the `ok_or_else`/`map_err` call sites need a closure). |

No Critical or Important findings.

## Checks performed (all pass)

- **Step 0 (`0215d59`) — all three Task 1 review Minors correctly closed:**
  generated-id branch in `cell.rs::scan_cells` now loops
  (`if seen_ids.insert(generated.clone()) { break generated; }`) and
  re-generates on collision, upholding the same invariant as the explicit-id
  branch; `CellKindToken`'s three variants and `UnitsPref`'s two variants
  each got a one-line `///` doc comment; a comment above `segment_start =
  range.end` in `cell.rs` accurately explains the pulldown-cmark 0.13.4
  `Start`/`End` range-equality reliance and flags it for a future upgrader.
  No regressions — the same 14 Task-1 tests still pass unchanged.
- **`WorkbookError` shape (L3-R1):** unchanged from Task 1 —
  `{cell_id: String, kind: WorkbookErrorKind, message: String}`,
  `#[derive(Debug, Clone, PartialEq, Eq)]`, `impl Display` (writes
  `message`), `impl std::error::Error {}`. Not narrowed, not widened; no
  `line` field, no line numbers in any message.
- **All seven `WorkbookErrorKind` variants present**, each with a per-variant
  doc comment: `DuplicateCellId` (Task 1), `DuplicateDefinition`,
  `DuplicateConstant`, `InvalidIdentifier`, `ReservedName`,
  `MissingFrontMatterId` (Task 1), `UnsupportedWorkbookVersion` (Task 1).
- **One named constructor per kind, all seven, each producing C2 §3.5.A's
  template byte-for-byte** — checked against the spec file directly
  (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` lines 475-481)
  including its raw bytes (`sed`+`cat -A`) to confirm the em dash in
  `InvalidIdentifier` is U+2014 (`\u{2014}` in code, not a hyphen) and the
  apostrophes in `don't`/`can't`/`'<name>'` are straight ASCII `'`
  throughout, matching the code exactly:
  - `duplicate_cell_id(id)` → `"Cell id '{id}' used by more than one cell"` ✓
  - `duplicate_definition(cell_id, name)` → `"'{name}' is defined more than once"` ✓
  - `duplicate_constant(cell_id, name)` → `"Constant '{name}' is declared more than once"` ✓
  - `invalid_identifier(cell_id, name)` → `"'{name}' is not a valid definition name \u{2014} use letters, digits, underscore, and don't start with a digit"` ✓
  - `reserved_name(cell_id, name)` → `"'{name}' is reserved and can't be used as a definition or constant name"` ✓
  - `missing_front_matter_id()` → `"Workbook front matter is missing a valid 'id'"` ✓
  - `unsupported_workbook_version(n)` → `"Workbook version {n} is not supported (expected 3)"` ✓
  Each constructor has a dedicated `..._message_matches_c2_exactly` test
  asserting the literal string, and all ten pass.
- **`RESERVED_NAMES: [&str; 15]`** — `["const", "pi", "tau", "e", "g",
  "Plot", "d3", "Inputs", "html", "laps", "session", "constants", "channel",
  "Time", "Distance"]`, case-sensitive, order and membership match C2
  §3.5.A's `ReservedName` row (line 479) plus the R20-amended `Time`/
  `Distance` pair exactly; comment above it cites both C2 §3.5.A and the R20
  ledger entry, as required. `reserved_names_has_exactly_15_entries` test
  passes; manually recounted the array — exactly 15.
- **L3-R2 (cell-scoped constructors take `cell_id`):** `duplicate_definition`,
  `duplicate_constant`, `invalid_identifier`, `reserved_name` all take
  `cell_id: &str` as their first parameter, consistently ordered
  `(cell_id, name)`; `duplicate_cell_id(id)` correctly uses the single `id`
  param for both roles per its own doc comment (matches Task 1's
  pre-existing behavior, just extracted into a named function).
- **L3-R3 (one `InvalidIdentifier` template, no re-raised Open Questions):**
  grepped the whole `core/` tree for `"is not a valid definition name"` —
  the only two occurrences are the constructor and its own test; no second
  template exists anywhere. Plan lines 269/481's Open Questions are not
  reopened anywhere in the diff or the report.
- **Wiring (Step 2):** `cell.rs`'s `DuplicateCellId` call site now calls
  `error::duplicate_cell_id(&id)`; `mod.rs`'s `UnsupportedWorkbookVersion`
  call site now calls `error::unsupported_workbook_version(front_matter.version)`.
  Both replace what was previously a hand-built `WorkbookError::new`/
  `front_matter` call, correctly eliminating the duplication L3-R1 rules
  against (except the one front_matter.rs gap noted above).
- **Do-not list respected:** derive list not narrowed (still `Display` +
  `Error` alongside `Debug`/`Clone`/`PartialEq`); C3 untouched; no IPC error
  kind added; no `docs/` file edited.
- **CLAUDE.md §4 (testing):** every new test uses `// Act` / `// Assert`
  (Arrange omitted only where the constructor call itself is the only setup
  needed — same precedent Task 1's review already accepted for its
  const-fixture test); the one test with real setup
  (`workbook_error_clone_and_equality_hold_for_a_constructed_error`) has a
  full `// Arrange` / `// Act` / `// Assert` with blank lines between; names
  are underscore-joined `thing_result` identifiers (the brief's own example,
  `duplicate_cell_id_message_matches_c2_exactly`, was used verbatim as the
  pattern); tests exercise only this task's own constructors/kinds, no
  re-test of `serde_yaml_ng`/`pulldown-cmark`/`uuid`. Placeholder
  `Clone + Debug + PartialEq` test added without duplicating Task 1's
  existing `Display`/`front_matter` test, as the brief required.
- **CLAUDE.md §5 (docs/errors):** doc comment on every new public symbol
  (all seven constructors, `RESERVED_NAMES`, the four new enum variants); no
  `Err(String)` anywhere; grepped both touched files for `unwrap()`/
  `expect()` outside `#[cfg(test)]` — none found; `Display`/`Error` retained
  from Task 1, not narrowed.
- **No reformatting:** diffs are additive/surgical; no whitespace or import
  reordering on lines outside what each step needed to touch; longest new
  line is ~130 chars, consistent with Task 1's file's own existing line
  lengths (not a new convention).
- **Cross-task consistency:** grepped `core/` for other references to
  `RESERVED_NAMES` / `WorkbookErrorKind::` outside `error.rs` — only
  `cell.rs`/`front_matter.rs`/`mod.rs`'s existing Task-1-era references;
  Tasks 3/4 haven't landed yet, so there is nothing yet to duplicate or
  drift — nothing to flag.
- **Hygiene:** both commit messages are single lines, no AI attribution
  trailer; `git show --stat` for each commit matches the brief's file list
  exactly (`0215d59`: `cell.rs`, `front_matter.rs`; `abe6a75`: `cell.rs`,
  `error.rs`, `mod.rs` — `cell.rs`'s inclusion is exactly the Step 2 wiring
  the brief anticipated); nothing under `docs/` touched; the shared checkout
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` was not touched by
  this review; no `git revert`/`checkout`/`reset`/`stash` run in the shared
  worktree.
- **Spec discipline:** report says "no spec change needed" — correct, C2
  §3.5.A already fixes every kind/message and the report doesn't touch
  `docs/`.

## Verdict rationale

The implementation is correct and complete: all seven `WorkbookErrorKind`
variants exist with per-variant docs, all seven constructors reproduce C2
§3.5.A's messages byte-for-byte (em dash and straight apostrophes verified
against the spec's raw bytes, not just its rendered text), `RESERVED_NAMES`
has exactly the 15 R20-amended entries in spec order, and the three Task 1
review Minors (collision-check loop, variant docs, range-equality comment)
are all correctly closed with no regressions — the same 14 prior tests still
pass alongside 9 new ones, 23 total, matching the implementer's report
exactly. The one finding — `front_matter.rs`'s `missing_id` closure not yet
migrated to call the new `missing_front_matter_id()` constructor — is Minor
because the string it hand-builds is byte-identical to what the constructor
produces, so there is no spec deviation, just one inconsistent call site
alongside two sibling call sites that were correctly migrated in the same
commit. The fix is a one-line, purely mechanical replacement.

VERDICT: CLEAN
