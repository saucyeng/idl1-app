# Re-review: L5 Task 11 — R49 fix (duplicate-name resolution order + reserved-name guard)

Commit reviewed: `b48ab3c` (`core+tauri: pin duplicate-name resolution to
document order (R49), guard reserved file-name stems`), diffed against
`6e4920f` in `idl-rs` worktree `wave1-l5-tauri`.

Files touched: `core/src/workbook/v3/resolve.rs` (+84/-21, `primary_for_name`
construction, `resolved` overlay gated on pointer identity, doc-comment
rewrite, new test), `tauri/src/commands/workbook.rs` (+39, `is_windows_reserved_name`,
`sanitize_file_name_stem` fallback wired to it, new test). No other files
changed.

## Test commands run and results

- `cargo test -p idl-rs workbook::v3::resolve`: **11 passed, 0 failed** (plus the pre-existing 0-test `real_session_odr_validation` integration binary, 0/0).
- `cargo test -p idl-rs-tauri workbook`: **21 passed, 0 failed** (40 filtered out; unrelated `idl-transport` `async fn in public trait` warnings only).

Both gates satisfied with non-zero `passed` counts. No reruns.

## (a) The rule is pinned by construction, not by timing

Traced `defs`'s provenance to `parse_workbook` (`core/src/workbook/v3/mod.rs:139-166`):
a single `for cell in &mut cells` loop over `scan_cells`'s document-order cell
list, pushing each `Def` line to `defs` as it's encountered — genuinely
document order, not reconstructed or sorted anywhere downstream. `eval.rs:101`
passes `&doc.defs` straight through to `resolve_workbook_defs` unchanged.

`primary_for_name` (`resolve.rs:163-171`) is `defs.iter().fold(HashMap::new(),
|mut m, d| { m.entry(d.name.as_str()).or_insert(d); m })` — `or_insert` only
writes on the *first* visit to a key, and since the fold walks `defs` in that
same document order, `primary_for_name[name]` is genuinely the first
`&MathCellDef` with that name, by construction, independent of any later
fixed-point iteration order.

The pointer-identity test (`std::ptr::eq(primary_for_name[def.name.as_str()],
def)`, `resolve.rs:207`) is sound: both `primary_for_name`'s values and the
loop's `def` (via `remaining: Vec<&MathCellDef> = defs.iter().collect()`,
line ~178) are `&MathCellDef` references borrowed from the same `defs: &[MathCellDef]`
slice for the whole function body — no clone, no rebuild, no second slice
with re-allocated elements at any point in this function or in `parse_workbook`.
Pointer equality between two references into the same backing allocation is a
correct identity test here; it is not a "same value" test that could
accidentally match two distinct-but-equal duplicates (which is exactly why
this holds even when two defs have the same name and same expression text).

`defs` cannot be reordered upstream within this call: it is passed by shared
reference (`&doc.defs`) and never mutated inside `resolve_workbook_defs`
(confirmed — no `sort`, `retain`, or `push` on `defs` anywhere in the
function body, only reads via `.iter()`/`.fold()`). (a) confirmed.

## (b) The new test discriminates

`a_duplicated_name_a_third_definitions_reference_resolves_to_the_first_in_document_order_not_the_second`
(`resolve.rs:456-472`): `defs = [c1.x=10, c2.x=20, c3.y=[x]+1]`, asserts
`y == 11`.

Re-derived the pre-fix behaviour by hand: `c1` and `c2` have no dependencies,
so both become "ready" in the fixed-point loop's first pass; `remaining` is
iterated in document order within that pass, so the pre-fix code's unconditional
`resolved.insert(def.name.clone(), ...)` writes `c1`'s value (10) first, then
overwrites it with `c2`'s (20) — the last write in the pass is `c2`'s, so the
old code deterministically produces `resolved["x"] == 20` here, and `c3`'s
`y = [x] + 1` evaluates to **21**, not 11. The new code produces 11. The test
is not tautological — it asserts a value (11) that the pre-fix code was
capable of producing only if `c1` came *last* in an equal-readiness pass (the
opposite ordering), so a regression back to unconditional last-write-wins on
this exact document would flip the assertion to fail. Confirmed to discriminate.

## (c) R47 not re-broken

`c2`'s own entry: the `if std::ptr::eq(...)` guard wraps only the write to the
`resolved` cross-reference overlay (`resolve.rs:207-217`); the `results.insert((def.cell_id.clone(), def.name.clone()), out)` write (a few lines below, unconditional,
outside the `if`) still runs for every def regardless of primary status. The
new R49 test itself asserts this directly: `get(&out, "c2", "x") == vec![20.0]`
succeeds only if `c2`'s own `(cell_id, name)`-keyed `results` entry survived
untouched.

The original R47 test, `a_name_repeated_in_two_different_cells_both_still_get_their_own_result_no_panic_no_dropped_entry`, is unmodified by this diff (confirmed via `git diff` — no hunk touches it) and passed in this run (`cargo test -p idl-rs workbook::v3::resolve`, listed above) for the same reason it passed before: both cells' `(cell_id, name)` keys are distinct in the `results`/`deps` maps, a code path this commit does not touch. (c) confirmed — R49's change is additive to the `resolved` overlay only, R47's fix in `results`/`deps` keying is untouched.

## (d) Reserved-name guard

`is_windows_reserved_name` (`commands/workbook.rs:186-197`): a `const [&str; 22]`
list (`CON, PRN, AUX, NUL, COM1-9, LPT1-9` — 4 + 9 + 9 = 22, matches C3's Minor
text exactly) checked via `stem.eq_ignore_ascii_case(r)` for each — exact
whole-stem match, case-insensitive, not a substring/contains check. Wired into
`sanitize_file_name_stem`'s existing `if trimmed.is_empty() { "workbook" } else { trimmed }`
branch, now `if trimmed.is_empty() || is_windows_reserved_name(trimmed) { "workbook" } else { trimmed }` — same fallback string, same branch shape as the
pre-existing empty-after-trim path, per the ledger's explicit instruction
("falls back the same way the empty-after-trim case already does").

Test (`sanitize_file_name_stem_a_windows_reserved_device_name_case_insensitively_falls_back_to_workbook`)
asserts `"CON"`, `"con"`, `"Lpt3"` → `"workbook"`, and `"CONTAINER"`, `"Fork tuning"`
→ themselves unchanged. Verified `CONTAINER` is not in the reserved list and
`eq_ignore_ascii_case` performs whole-string comparison (not `contains`), so
it cannot be flagged by construction. (d) confirmed.

## (e) Nothing else changed; doc comments consistent

`git diff --stat` confirms only the two expected files changed, no other
hunks. Grepped the full diff and the surrounding doc comments for any
remaining reference to the old order-dependent rule (`"last write"`,
`"last wins"`, `"pass timing"`) — the only hits are in the new/rewritten
prose that correctly describes the *old* (pre-R49) behaviour in past tense,
explaining what changed, not a live contradiction. The `resolve_workbook_defs`
doc comment (`resolve.rs:96-116`) now states the R49 rule, cites the ledger
number, and cross-references `merge_constants`/L3-R16/R17 as precedent,
matching the ruling's own reasoning verbatim. `is_windows_reserved_name`'s
doc comment matches its implementation exactly (exact match, case-insensitive,
`CONTAINER` example called out explicitly). (e) confirmed.

## Findings

None. All items (a)-(e) hold.

## Verdict rationale

R49's ruling is implemented precisely as specified: the primary-definition
selection is built by an explicit first-occurrence fold over `defs` (verified
by tracing `defs`'s construction back to `parse_workbook`'s single document-order
loop, not assumed), the pointer-identity gate is sound because both sides of
the comparison borrow the same backing slice for the function's entire
lifetime, and the new test's arithmetic was re-derived by hand to confirm it
would produce a different, wrong answer (21, not 11) under the exact pre-fix
code path, not just under a hypothetical. R47's fix — every duplicate keeps
its own `(cell_id, name)`-keyed result — is untouched by this diff (the R49
change only gates the separate `resolved` name-keyed cross-reference overlay)
and its regression test is unmodified and still green. The reserved-name
guard matches the ruling's Minor text field-for-field: same 22-name list,
exact case-insensitive match (not substring), same fallback string and branch
shape as the pre-existing empty-after-trim case, with a passing test covering
both the reserved and non-reserved (including the `CONTAINER` near-miss)
cases. No stray changes, no stale doc comments. Both required test gates ran
once each with non-zero passing counts.

VERDICT: CLEAN
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\lanes\l5-tauri-scaffold\review-task11-r49.md
COUNTS: critical=0 important=0 minor=0
