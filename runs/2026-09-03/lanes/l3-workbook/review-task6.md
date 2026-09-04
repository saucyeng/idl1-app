# L3 Task 6 review — cross-cell resolver (C2 §2.4)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`, commit under review `34291d5938c9fd1e118d6da2477b26aff873b6aa`
(parent `fd9b30d`, Task 5). Working tree clean, HEAD matches the reviewed commit.
In scope: `core/src/math/eval.rs`, `core/src/workbook/v3/mod.rs`,
`core/src/workbook/v3/resolve.rs` — the three files the brief names, and exactly
the three files touched (`git show --stat` confirms no stray file).

## Test command and result

```
cargo test -p idl-rs workbook::v3::resolve
```
```
running 9 tests
test workbook::v3::resolve::tests::constants_table_is_passed_through_to_evaluate_with_constants ... ok
test workbook::v3::resolve::tests::a_depends_on_b_depends_on_a_both_report_unknown_channel_no_panic_no_infinite_loop ... ok
test workbook::v3::resolve::tests::a_definition_referenced_by_two_others_is_stored_once_and_shared ... ok
test workbook::v3::resolve::tests::a_depends_on_b_depends_on_c_no_cycle_resolves_in_one_pass_c_before_b_before_a ... ok
test workbook::v3::resolve::tests::definition_named_after_a_base_channel_the_definitions_value_is_returned_not_the_base_channels ... ok
test workbook::v3::resolve::tests::definition_referencing_a_base_session_channel_not_in_defs_falls_through_to_lookup_as_today_s_v2_resolver_does ... ok
test workbook::v3::resolve::tests::self_reference_against_a_base_channel_of_the_same_name_is_a_cycle_leftover_unknown_channel_naming_it_never_loops_never_reads_the_base_channel ... ok
test workbook::v3::resolve::tests::one_definitions_expression_has_a_parse_error_its_own_entry_is_err_parse_sibling_definitions_still_resolve ... ok
test workbook::v3::resolve::tests::three_independent_definitions_none_referencing_each_other_all_three_resolve ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 756 filtered out
```

```
cargo test -p idl-rs math::eval
```
```
test result: ok. 72 passed; 0 failed; 0 ignored; 0 measured; 693 filtered out
```

Both filters exactly as the brief names, each run once, both report non-zero
`passed`, 0 failed. Reproduces the implementer's reported result.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important findings | — |

## Checks performed (all pass)

**(a) The `merge_constants` call, verified independently, not taken on trust.**
- Diffed `fd9b30d:core/src/workbook/v3/mod.rs` against a `merge_constants` grep:
  zero call sites of `merge_constants(` inside that file at the parent commit —
  only the `pub use constants::merge_constants;` re-export existed. The
  implementer's premise (brief's stated concern that Task 4 didn't actually
  wire the call) is confirmed correct, not a slip that should have been
  escalated: the brief itself, written after this was already checked, tells
  the implementer to add it — this is not an unauthorized deviation.
- Post-fix: exactly one call site, `core/src/workbook/v3/mod.rs:169`
  (`let (constants, constant_errors) = merge_constants(&front_matter.constants, &const_lines);`),
  inside `parse_workbook`, after `const_lines`/`defs` are fully collected from
  all cells and before `WorkbookDoc` is constructed — matches L3-R16/17's
  placement (front-matter constants merged with all `const_lines`, in one
  pass, stored on `WorkbookDoc.constants`).
- Cannot run twice on any path: `parse_workbook` is a single straight-line
  function with no loop or branch around the call; `merge_constants` is not
  called anywhere else in the diff or pre-existing code (grep across the
  whole diff shows only the two lines: the call and its doc-comment
  mentions).
- Precedence: `merge_constants(&front_matter.constants, &const_lines)` —
  read `core/src/workbook/v3/constants.rs` (unchanged this task, landed
  Task 4) to confirm its own precedence rule is front-matter-vs-cell as
  L3-R16/17 assume; Task 6 does not alter that function, only wires its
  output through, so this task owns only the wiring, not the precedence
  logic itself, and the wiring is correct.

**(b) Step 0 / R33 — `if(cond,t,f)`.**
- `combine_t_us` (`eval.rs:491-514`, pre-existing, unchanged) is folded
  across cond then the `t` branch then the `f` branch
  (`eval.rs:1017-1019`): `combine_t_us(cond.t_us, value_t_us(args[1]))` then
  `combine_t_us(that, value_t_us(args[2]))`. `value_t_us` (new,
  `eval.rs:712-719`) returns `Value::Channel(c).t_us.clone()` or empty
  `Arc<[i64]>` for any other `Value` variant (`Scalar`, `Str`, `Vec3`) — "scalar
  branches contribute empty" is exactly what the code does.
- Mismatch raises the same typed `MathEvalErrorKind::Runtime` from
  `combine_t_us`, whose message embeds both operands' sample count and
  µs span (`eval.rs:504-512`) — "naming both spans" is literal, not just
  a claim.
- The two named tests are not vacuous:
  - `if_scalar_branches_passthrough_result_carries_conds_t_us_unchanged`
    (`eval.rs:1957-1970`) uses a `cond` channel with a real, non-uniform
    `t_us` (`[0, 100_000]`) and two scalar branches; asserts the output's
    `t_us` equals cond's exactly. Since `combine_t_us(a, empty) = a`, this
    does exercise the fold (both calls), it just confirms the "equal-or-empty
    passes through" arm rather than the mismatch arm — legitimate coverage
    of that arm, not a no-op (an unfolded, cond-only-adoption implementation
    would have produced the same result here too, but the sibling test below
    is what proves the fold, not adoption, is actually happening).
  - `if_branch_channel_with_different_t_us_than_cond_is_runtime_error_naming_both`
    (`eval.rs:1972-1987`) uses `cond` with `t_us = [0, 100_000]` and the `t`
    branch as a channel with `t_us = [5, 100_005]` — genuinely different, not
    a length mismatch that would already have errored elsewhere. Asserts
    `MathEvalErrorKind::Runtime` and that the message contains "different
    per-sample time axes" (the exact substring `combine_t_us` emits). This
    is the test that proves cond's `t_us` is no longer silently adopted —
    the old code (`Ok(channel(out, cond.sample_rate_hz, cond.t_us))`) would
    have passed this case silently; the new code correctly rejects it. Ran
    both tests as part of the `math::eval` filter above — both `ok`.

**Other checks:**
- `evaluate` (`eval.rs:239-246`) now reads
  `evaluate_with_constants(expression, &HashMap::new(), lookup, lap_ctx)` —
  a pure delegation, no other logic added or removed; confirmed genuinely
  unchanged behaviorally by the required equivalence test
  `evaluate_equals_evaluate_with_constants_given_an_empty_constants_table`
  (`eval.rs:2536-2547`), which asserts `assert_eq!` on the full `EvalOutput`
  (not just `.samples`) for a real expression — ran and passed.
- `evaluate_with_constants` (`eval.rs:249-266`) is the only new public
  function in `eval.rs`; it wraps `MemoLookup` (same as old `evaluate`) and
  is the only call site `resolve.rs` uses (`resolve.rs:145`) — never
  `parse` + `eval` by hand (G6.3 honored).
- `resolve_workbook_defs`'s signature matches L3-R17 exactly:
  `(defs: &[MathCellDef], constants: &HashMap<String, f64>, lookup: &dyn
  ChannelLookup, lap_ctx: &MathLapContext) -> HashMap<String,
  Result<EvalOutput, MathEvalError>>`.
- `MathCellDef` matches L3-R16 exactly (`cell_id, name, expr_text, label,
  order`, `workbook/v3/mod.rs:47-65`), placed beside `ConstLine` as ruled.
- `WorkbookDoc.defs` population (`mod.rs:145-161`): `order` is a per-cell
  counter reset to `0` at the top of each cell's loop body
  (`let mut order = 0;` inside the `for cell in &cells` loop) and pushed to
  the document-level `defs: Vec<MathCellDef>` in the same iteration order
  the outer `for cell in &cells` loop runs — cells themselves are already in
  document order (unchanged from Task 3). Result: document-cell order, then
  per-cell `Def`-line order via `order` — exactly what L3-R16 specifies, not
  merely what the implementer's report claims; read the loop structure to
  confirm, did not just take the summary at face value.
- L3-R18(a) definitions-win-over-session-channels: `OverlayLookup::lookup`
  (`resolve.rs:45-54`) checks `self.resolved` first, falls through to
  `self.base` only on a miss — confirmed by
  `definition_named_after_a_base_channel_the_definitions_value_is_returned_not_the_base_channels`,
  which shares a name between a definition and a base channel and asserts
  the definition's value wins. Ran, passed.
- L3-R18(b) — `Arc<[i64]>` conversion happens once at insertion
  (`resolve.rs:148-155`, `Arc::from(eval_out.t_us.as_slice())`), and
  `OverlayLookup::lookup` clones the `Arc` (`t_us.clone()` on an
  `Arc<[i64]>` field, `resolve.rs:50`), never the underlying `Vec` — no
  `.to_vec()`/`Vec::from` anywhere in the lookup hot path.
- L3-R18(c) / R21 self-reference addition: the required test
  (`self_reference_against_a_base_channel_of_the_same_name_is_a_cycle...`,
  `resolve.rs:266-283`) is present, correctly named, and — traced by hand,
  not just run — genuinely exercises the no-progress branch: `deps` for the
  lone self-referencing def is `["IMU0_AccelZ"]` (itself, since
  `channel_refs` is filtered to names present in `defs`, and the def's own
  name is in `defs`); `ready` is false on the first (only) pass since
  `resolved` is empty; the loop breaks with `made_progress == false`; the
  leftover sweep assigns `UnknownChannel` naming `IMU0_AccelZ` without ever
  calling `evaluate_with_constants`, so the base channel's `[1.0, 1.0]` is
  provably never read (the `OneChannel` double is never invoked). Ran,
  passed.
- Fixed-point/cycle mechanics: no dedicated cycle kind invented, leftover
  members get `MathEvalErrorKind::UnknownChannel` naming one blocking
  dependency (`resolve.rs:176-189`) — matches "no cycle kind exists" and
  plan 445's fallback. `channel_refs` used as-is at its existing
  `pub(crate)` visibility (no visibility edit in the diff) — G6.6 honored.
- "Store every definition regardless of reference count" — confirmed by both
  code (`results.insert` runs for every def processed, referenced or not,
  `resolve.rs:163`) and the named test
  `a_definition_referenced_by_two_others_is_stored_once_and_shared`, which
  asserts `out.len() == 3` including the referenced-but-never-queried `A`.
- Doc comments present on `MathCellDef`, its fields, `WorkbookDoc.defs`,
  `WorkbookDoc.constants`, `resolve_workbook_defs`, `OverlayLookup`, both new
  `eval.rs` functions and `value_t_us` — units stated where numeric
  (`t_us` in µs documented on `MathCellDef`/module doc references, rates
  inherited from existing `EvalOutput` docs).
- No `Err(String)`, no unexplained `.unwrap()`/`.expect()` on production-path
  data anywhere in the diff (test-only `.unwrap()` throughout, as expected).
- Tests: Arrange/Act/Assert with blank lines between, in every new test;
  names follow the lane's established long-form
  `thing_condition_result`-as-one-identifier convention (matches prior
  tasks' style, e.g. `one_definitions_expression_has_a_parse_error_...`
  already landed in Task 5's file) — consistent, not a new pattern this task
  introduced.
- No reformatting: diff is additive/surgical, no whitespace/import churn on
  untouched lines (only the one necessary import edit,
  `crate::math::parse::{parse, ...}` → `{Ast, BinOp, UnOp}`, since `parse`
  becomes fully-qualified at its two remaining call sites and unused as a
  bare import).
- Commit: single line, matches the brief's mandated message verbatim, no AI
  attribution trailer; `git add` used explicit paths — `git show --stat`
  lists exactly the three files the brief names (`math/eval.rs`,
  `workbook/v3/mod.rs`, `workbook/v3/resolve.rs`), nothing else.
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  and `docs/` untouched (not read this review beyond the required
  brief/plan/contract citations, no write attempted).
- No `pub` signature reaching `idl-rs-cli` changed — `cargo check -p
  idl-rs-cli --tests` correctly not run, matching the brief's compute note.

## Verdict rationale

Both hard-check items hold up under independent verification, not just the
implementer's report: `merge_constants` genuinely had no prior call site,
now has exactly one, in the ruled location, uncallable twice, and the
precedence it applies is Task 4's unmodified logic that this task only
wires through. Step 0's `if()` fix folds `combine_t_us` across all three
operands exactly as R33 rules, with a typed error naming both spans, and
both required tests trace through real code paths (confirmed by hand, not
just by passing) rather than passing vacuously. `evaluate`'s behavior is
provably unchanged via a real equivalence test on the full struct.
`WorkbookDoc.defs` ordering is confirmed by reading the loop structure, not
assumed from the report. Every `Do not` item in the brief is honored, every
required test is present and correctly named, hygiene (commit, doc comments,
typed errors, no reformatting) is clean. No Critical or Important findings.

VERDICT: CLEAN
