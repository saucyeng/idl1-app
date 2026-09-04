# L3 Task 1 review — front matter, fence scanning, cell-id assignment (C2 §1–2)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `e018db9` (parent `76b640a`),
worktree confirmed clean and at that commit before and after review.
In scope: the 7 files in `git show --stat e018db9` (`Cargo.lock`,
`core/Cargo.toml`, `core/src/workbook/mod.rs`, and the four new files under
`core/src/workbook/v3/`). Nothing else was touched; no uncommitted changes
present in the worktree.

## Test command and result

```
cargo test -p idl-rs workbook::v3
```

```
running 14 tests
test workbook::v3::cell::tests::fence_with_no_id_id_assigned_8_lowercase_hex_chars ... ok
test workbook::v3::cell::tests::prose_before_first_math_cell_becomes_that_cells_prose_before ... ok
test workbook::v3::cell::tests::two_cells_same_id_duplicate_cell_id_collected_both_cells_still_returned ... ok
test workbook::v3::front_matter::tests::front_matter_version_2_explicit_is_not_silently_upgraded ... ok
test workbook::v3::front_matter::tests::constant_unit_suffix_82_kg_parses_to_82_0_some_kg ... ok
test workbook::v3::cell::tests::zero_fenced_cells_cells_empty_trailing_prose_is_some ... ok
test workbook::v3::error::tests::display_includes_message_and_front_matter_helper_sets_reserved_cell_id ... ok
test workbook::v3::front_matter::tests::constant_bare_number_9_80665_parses_to_9_80665_none ... ok
test workbook::v3::cell::tests::trailing_prose_after_last_cell_becomes_prose_after_on_the_last_cell ... ok
test workbook::v3::front_matter::tests::front_matter_id_not_a_uuidv4_is_missing_front_matter_id ... ok
test workbook::v3::tests::parse_workbook_c2_5_worked_example_parses_id_version_and_both_cells ... ok
test workbook::v3::front_matter::tests::front_matter_missing_id_is_missing_front_matter_id ... ok
test workbook::v3::front_matter::tests::front_matter_version_key_absent_defaults_to_3 ... ok
test workbook::v3::cell::tests::unrecognised_fence_language_produces_no_cell_round_trips_as_inert ... ok

test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 692 filtered out; finished in 0.00s
```

Reproduces the implementer's reported 14/14 exactly; non-zero `passed`, gate satisfied.

**Reviewer process note (not a finding on the implementer):** mid-review I
mistakenly ran an unauthorized `cargo doc -p idl-rs --no-deps`, a violation
of the standing compute rules. I killed the resulting `cargo.exe` processes
immediately (`taskkill`) and confirmed the worktree was still clean and
unaffected afterward. No further cargo invocations were made; all analysis
below the test run was done by reading source only.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/workbook/v3/cell.rs:154-158` | `scan_cells`'s generated-id branch (`explicit_id == None`) inserts the freshly generated id into `seen_ids` without checking whether it already collides with a previously seen id, unlike the explicit-id branch three lines above, which does check and raises `DuplicateCellId`. The function's own doc comment ("Track seen ids in a HashSet; a repeat is DuplicateCellId") reads as a uniform invariant that this branch doesn't actually uphold. In practice this is astronomically unlikely (2⁻³² per pair, and C2 §2.2/§7's own defensive language for this scenario is scoped to *cross-document* merge collisions handled later by L11, not single-document generation), so it's not a real-world risk today, but it's a one-line inconsistency worth closing while the module is fresh. | Check `seen_ids.insert(generated.clone())`'s return value the same way the explicit-id branch does (loop-regenerate on the near-impossible collision, or push the same `DuplicateCellId` error) so both paths uphold the same invariant. |
| Minor | `core/src/workbook/v3/cell.rs:16-20`, `core/src/workbook/v3/front_matter.rs:16-19` | `CellKindToken`'s (`Math`/`Table`/`Js`) and `UnitsPref`'s (`Si`/`Imperial`) variants have no per-variant doc comments — only the enclosing enum has one. This is inconsistent with `WorkbookErrorKind` (same commit) and the pre-existing `MathEvalErrorKind`, both of which document every variant, and CLAUDE.md §5 requires a doc comment on every public symbol (variants included). | Add a one-line `///` doc comment to each variant, matching `WorkbookErrorKind`'s style in the same commit. |
| Minor | `core/src/workbook/v3/cell.rs` (`scan_cells`, `code_block_text`) | The third self-resolved ambiguity in the dispatch — that `pulldown-cmark`'s `into_offset_iter()` gives the `Start(CodeBlock)` event the *same* range as the eventual `End(CodeBlock)` event (both are the tree node's full `item.start..item.end`, verified by reading `pulldown-cmark-0.13.4/src/parse.rs`'s `OffsetIter::next`), and that this span excludes the closing fence's own trailing newline — is relied upon (`segment_start = range.end` is set from the *Start* event's range, never re-read from the End event) but not explained anywhere in a doc comment. It is correctly implemented and locked in by `trailing_prose_after_last_cell_becomes_prose_after_on_the_last_cell` (verified: for `` ```math id=aaaaaaaa\nx = 1\n```\n\nBottom-outs: 3\n ``, `prose_after` is exactly `"\n\nBottom-outs: 3\n"`, i.e. no newline swallowed or dropped), so there is no correctness or data-loss issue — just an undocumented reliance on a specific (if version-pinned) upstream implementation detail that isn't part of `pulldown-cmark`'s stated public contract. | Add a short comment on `scan_cells` (or above the `segment_start = range.end` line) noting that the `Start` event's range already equals the fence-close boundary in this crate version, so a future reader/upgrader doesn't "fix" it into reading the End event's range instead (which would still work, but the reliance should be explicit either way). |

No Critical or Important findings.

## Checks performed (all pass)

- **Fatal-vs-collected rule** (`mod.rs:46-57`, `parse_workbook`): doc comment states it exactly as required — front-matter identity/version (`MissingFrontMatterId`, `UnsupportedWorkbookVersion`) is `Err`; everything else (here, `DuplicateCellId`) is collected into the `Ok` tuple. Code matches: `parse_front_matter` failure and version mismatch both `return Err(...)`; `cell::scan_cells`'s errors flow into the `Ok((doc, errors))` tuple.
- **`version` default-vs-explicit** (C2 §1): `#[serde(default = "default_version")]` → absent key defaults to 3 (test: `front_matter_version_key_absent_defaults_to_3`); explicit `version: 2` survives to `parse_workbook`'s check unmodified (test: `front_matter_version_2_explicit_is_not_silently_upgraded`) and correctly becomes `UnsupportedWorkbookVersion` there (not tested directly in this task's suite, but the mechanism — `front_matter.version != 3` check in `mod.rs:61` — is unambiguous from the code and is exactly what Task 1's own worked-example test exercises for the passing case, version omitted → 3).
- **UUIDv4 check on `id`** (C2 §1, §3.5.A): `uuid::Uuid::parse_str(...).map(|u| u.get_version() == Some(uuid::Version::Random))`. Verified this correctly rejects malformed strings, the nil UUID (version nibble 0, not `Version::Random`), and accepts the C2 §2.5 worked example's real v4 id. Tests cover missing id and non-UUID id; both collapse to `MissingFrontMatterId` per the documented (and ledger-tracked) ambiguity resolution below.
- **Fence info-string grammar** (C2 §2.2/§2.3): `parse_fence_open` requires the first whitespace-separated token to be *exactly* `math`/`table`/`js` (not a prefix match — correctly stricter/more accurate than the plan's looser "starts with" prose, and correct per C2's EBNF `cell_kind ::= "math" | "table" | "js"`); `id=<hex8>` requires exactly 8 lowercase `[0-9a-f]` characters (uppercase or wrong-length rejected); any other `key=value` token is ignored, matching C2 §2.2's "reserved attribute namespace" rule (verbatim round-trip isn't attempted since Task 1 has no write path — explicitly noted in the doc comment). Test: `unrecognised_fence_language_produces_no_cell_round_trips_as_inert` confirms a bare/other-language fence produces no cell and its source text flows into the next cell's `prose_before`.
- **Duplicate id message** (C2 §3.5.A): `"Cell id '{id}' used by more than one cell"` — byte-for-byte match against the spec table, straight apostrophes, no em-dash issue (this message doesn't use one). `MissingFrontMatterId`'s and `UnsupportedWorkbookVersion`'s messages also byte-for-byte match the spec table.
- **Prose spans** (C2 §2.4): `prose_before` computed as `body[segment_start..range.start]` (`None` when empty); `prose_after` set only on the last cell via `cells.last_mut()`; `trailing_prose` returned only when `cells` is empty. All five of Step 3's prose/id tests plus the zero-cells test pass and exercise these paths directly.
- **Generated ids**: `generate_cell_id` uses `uuid::Uuid::new_v4().as_bytes()[..4]`, lower-hex-encoded via `{b:02x}` (lowercase by construction) — matches the lead ruling exactly (`runs/2026-09-03/decisions.md`, "L3 Task 1 dispatched"); no `rand` dependency added (confirmed via `core/Cargo.toml` diff).
- **§2.5 worked example**: reproduced verbatim in `mod.rs`'s `WORKED_EXAMPLE` const, with the spec doc's zero-width-space fence-escaping artifacts (confirmed present in the spec source via `cat -A`, U+200B before each nested fence line — a documentation-rendering trick, not literal content) correctly *not* copied into the test string; the em dash in "Fork tuning — Whistler" *is* correctly preserved (`\u{2014}`, matching the spec's literal example). Test asserts id, version, both cells' ids and kind tokens, and math-cell body content, all correctly.
- **`Cargo.lock` diff**: `git diff 76b640a..e018db9 -- Cargo.lock | grep '^-' | grep -v '^---'` is empty — fully additive (new packages `pulldown-cmark`, `pulldown-cmark-escape`, `serde_yaml_ng`, `unsafe-libyaml`, `unicase`, `unicode-width`, `getopts`; no existing package's version changed).
- **`error.rs` shape**: `WorkbookError { cell_id, kind, message }` with `Display` (writes `message`) and `std::error::Error`, mirroring `MathEvalError`'s exact shape (including the lack of per-field doc comments on the struct itself, which matches `MathEvalError`'s own precedent — not a gap). `WorkbookErrorKind` defines only `DuplicateCellId`/`MissingFrontMatterId`/`UnsupportedWorkbookVersion` — exactly Task 1's three kinds — with a doc comment explicitly naming the four kinds Task 2 adds (`DuplicateDefinition`, `DuplicateConstant`, `InvalidIdentifier`, `ReservedName`), matching `brief-task2.md`'s scope.
- **Two self-resolved ambiguities from the dispatch, both documented and both already ledger-tracked** (`runs/2026-09-03/decisions.md`, "2026-09-04 — Tracked: L3 Task 1 landed"): (1) any front-matter deserialize failure (bad YAML, a constant string matching neither `ConstantRaw` shape, etc.) collapses into `MissingFrontMatterId` — documented in `parse_front_matter`'s doc comment with explicit reasoning; (2) a malformed `id=` value is treated as absent (fresh id generated), unknown `key=value` attrs are ignored — documented in `parse_fence_open`'s doc comment. Both are explicitly flagged in the decisions log as provisional, lead-owned, low-cost, and lose no content — consistent with what I found reading the code. No new lead ruling is needed from this review; the existing tracked entry already covers it.
- **Hygiene**: commit message is a single line, no AI attribution trailer; `git show --stat` matches the brief's explicit file list exactly (`core/Cargo.toml Cargo.lock core/src/workbook/mod.rs core/src/workbook/v3/*`, no `git add -A` stray files); nothing under `docs/` touched; diff is purely additive (new files, and a 1–2 line addition each to `core/Cargo.toml`/`workbook/mod.rs`) — no reformatting/whitespace churn; the shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` was not touched by this review.
- **CLAUDE.md §4 tests**: every test uses Arrange/Act/Assert with blank lines between sections (the one exception, `mod.rs`'s worked-example test, has no separate Arrange block because the fixture is a module-level `const`, not per-test setup — reasonable, not a violation); names are underscore-joined `thing_condition_result` identifiers, consistent with the lane's convention; every test exercises only what this task owns (front matter, fence scanning, cell-id assignment, prose spans) — no re-testing of `pulldown-cmark`, `serde_yaml_ng`, or `uuid` themselves.
- **No `Err(String)`, no unexplained `.unwrap()`/`.expect()`** on production-path data: grepped all four new files; every `.unwrap()` is inside `#[cfg(test)]` code.

## Verdict rationale

The implementation is correct: front matter, fence scanning, cell-id
assignment, and prose-span attachment all match C2 §1–§2 precisely, including
byte-for-byte error messages, the exact UUIDv4/version rules, and the §2.5
worked example reproduced faithfully (including correctly *not* carrying over
the spec doc's own zero-width-space rendering artifacts). Hygiene, test
style, and the error-type shape all match the brief and the established
codebase patterns. The three findings are all Minor: an inconsistent (but
astronomically unlikely to matter, and not actually required by C2 at this
layer) collision check on the generated-id path, two enums missing
per-variant doc comments that a sibling type in the same commit does have,
and an undocumented-but-correct-and-tested reliance on a `pulldown-cmark`
internals detail. None of them lose data, none of them are spec deviations,
and all three are one-line fixes if the team wants to close them — none of
this rises to a fix-up dispatch on its own.

VERDICT: CLEAN
