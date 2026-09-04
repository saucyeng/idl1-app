# L3 Task 8 review — host-variable data (`channel`/`laps`/`session`/`constants`) and `${…}` span extraction (C2 §5)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`, branch
`wave1-l3-workbook`. Commit under review: `f7c757b5b10bf281ec7cd7b8d19573983c613575` (parent
`2936118`, Task 7). In scope: `core/src/workbook/v3/host.rs` (new, 400 lines),
`core/src/workbook/v3/js_cell.rs` (new, 195 lines), `core/src/workbook/v3/mod.rs` (+4 lines,
`pub mod`/re-export only). Worktree is clean otherwise — nothing else in scope.

## Test command and result

```
cargo test -p idl-rs workbook::v3::host
```
```
running 12 tests
... (all ok)
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 773 filtered out; finished in 0.00s
```

```
cargo test -p idl-rs workbook::v3::js_cell
```
```
running 6 tests
... (all ok)
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 779 filtered out; finished in 0.00s
```

Both non-zero `passed`, `0 failed`, matching the two filters the brief mandates (not the plan's
broken `workbook::v3::(host|js_cell)` regex-style filter, correctly avoided). Reproduces the
implementer's reported result.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important findings. | — |

Two items below are not defects — they are the two judgment calls the dispatch asked me to report
precisely rather than adjudicate. Neither is filed as a table finding; both need a lead ruling.

### (a) `other_session` lookup — exact behavior

`host.rs:92-95`:
```rust
let resolved = match other_session {
    Some((_, other_lookup)) => other_lookup.lookup(name),
    None => lookup.lookup(name),
};
```
Confirmed on every path: `Some((_, other_lookup))` looks up **exclusively** in `other_lookup`;
`None` looks up **exclusively** in the primary `lookup`. No fallback either direction — this is
what the code does unconditionally, not just on the tested paths.

The tuple's `&str` (the session id) is bound to `_` and is **never read** inside `channel()`. The
doc comment (`host.rs:67-74`) states this is deliberate: the signature carries no separate
"requested session id" to compare against a mismatch, so a caller asking for a specific session's
channel "must already have resolved that session's id and lookup and hand both in here." Given
that, `channel()` itself cannot detect a mis-wired call — e.g. a Task 9 caller that binds the
wrong `ChannelLookup` to an id string would have that error silently absorbed: `channel()` would
return a real (but wrong-session) result rather than an error, because it never looks at the id.
That trust boundary sits entirely with the future caller (Task 9's orchestrator, per the doc
comment), not with this function. Whether that's acceptable is exactly the "mismatched id" case
L3-R22's prose names — the signature as ruled has no field to enforce it in `channel()` itself, so
if the lead wants `channel()` to guard against it, the signature needs another parameter; as
ruled, the code matches the ruling.

Error for a session-scoped request that finds nothing (`other_session: None`, or `Some` but
`other_lookup.lookup(name)` misses): `MathEvalErrorKind::UnknownChannel`, message
`` Channel '[{name}]' not in this session" `` (`host.rs:97`) — e.g. for `name = "X"`:
`Channel '[X]' not in this session`. This is the identical string template `eval.rs:313` already
uses for `Ast::ChannelRef`, so it's consistent with existing prior art, not a new/inconsistent
message.

### (b) Out-of-range lap number vs. no laps at all — exact message

`host.rs:104-110`:
```rust
let window = (lap_number as usize).checked_sub(1).and_then(|i| lap_ctx.main_lap_bounds.get(i));
let &(start_s, end_s) = window.ok_or_else(|| {
    MathEvalError::new(
        MathEvalErrorKind::NoLapContext,
        format!("channel(\"{name}\", lap: {lap_number}): no lap {lap_number} in this session's lap table"),
    )
})?;
```
For `lap: 7` on a session with `main_lap_bounds.len() == 3`: `i = 6`, `.get(6)` on a 3-element
`Vec` is `None`, so the error is `MathEvalErrorKind::NoLapContext` with message:

```
channel("X", lap: 7): no lap 7 in this session's lap table
```

For `lap: 7` on a session with `main_lap_bounds` empty (0 laps), the message is **byte-identical**
— same kind, same string. So the two situations ("has laps, wrong number" vs. "no laps at all")
are genuinely collapsed to one code path and one message, exactly as the dispatch flagged.

However, that message does not itself claim "this session has no laps" — it says "no lap 7",
naming the specific requested lap number, which is true in both cases. It is not the misleading
"lie" the dispatch was concerned about; a user reading it learns their requested lap doesn't
exist, not that the session is lap-less. It also doesn't tell them how many laps *do* exist (e.g.
"only 3 laps recorded"), which would be a strictly more useful message for the out-of-range case.

On the ruling gap: L3-R22's brief text says only "`NoLapContext` for a `lap` with empty
`main_lap_bounds`" — it does not explicitly rule on non-empty-but-out-of-range. The implementer
extended `NoLapContext` to cover both, and says so in the doc comment (`host.rs:82-84`: "empty, or
`lap` out of range — both mean 'no lap context available for that lap'"). `MathEvalErrorKind`'s
existing variant set (`Parse`, `UnknownFunction`, `UnknownChannel`, `ArgCount`, `Type`,
`DivisionByZero`, `NoLapContext`, `NotImplemented`, `Runtime`) has no dedicated "lap out of range"
kind, so `NoLapContext` is the only fitting existing kind without inventing a new one (which the
brief didn't authorize). This is a genuine brief gap, not a slip — flagging for a lead ruling per
the dispatch, not filing as a defect.

## Checks performed (all pass)

- **Step 1 (`to_host_channel`, L3-R21).** `length = v.len()` always (never follows `t`);
  `t = t_us[i] as f64 / 1e6` over `min(t_us.len(), v.len())`; empty `t_us` → empty `t`, `v`/
  `length` unaffected. All three named tests present and correctly named:
  `recorded_axis_t_us_converts_microseconds_to_seconds`,
  `empty_t_us_three_values_length_3_t_empty_v_preserved`, `both_empty_length_0`. The plan's wrong
  "empty input → length 0" case (plan 537) is absent, as ruled.
- **Step 2 (`channel()`, L3-R22).** Signature matches exactly: `lookup: &dyn ChannelLookup, name:
  &str, lap: Option<u32>, lap_ctx: &MathLapContext, other_session: Option<(&str, &dyn
  ChannelLookup)>) -> Result<HostChannel, MathEvalError>`. Returns `MathEvalError`, never
  `WorkbookError`. Five named tests present:
  `channel_with_no_lap_or_session_same_as_lookup_converted_via_to_host_channel`,
  `channel_with_lap_windows_t_and_v_to_that_laps_bounds_inclusive_both_ends`,
  `channel_nonexistent_name_unknown_channel`,
  `channel_session_scoped_request_with_no_other_session_data_unknown_channel`,
  `channel_lap_requested_with_empty_main_lap_bounds_no_lap_context`; plus an extra test for the
  seconds→µs conversion site's boundary-inclusivity, as the ruling required its own test. Lap
  window: seconds→µs conversion is `(t_secs * 1e6).round() as i64`, done once; filter is
  `t >= start_us && t <= end_us` (inclusive both ends, matching `slice_by_time`). Manually
  re-derived the boundary test (`channel_seconds_to_microseconds_conversion_site_rounds_and_is_inclusive_at_both_boundary_samples`):
  lap `[0.5s, 1.0s]` → `[500_000, 1_000_000]` µs inclusive; samples at `t_us = [0, 500_000,
  1_000_000, 1_500_000]`, `v = [10, 20, 30, 40]` → kept indices 1,2 → `v = [20.0, 30.0]`, matches
  assertion.
- **Step 3 (`host_laps`/`host_session`/`host_constants`, L3-R23).** `HostLap`/`HostSession`/
  `HostChannel` all `#[derive(Serialize)]` with `#[serde(rename_all = "camelCase")]` and a doc
  comment naming this as the deliberate C3 §1 snake_case exception. `host_laps` numbers
  `index + 1`, doc comment states the `Lap.lap_number` divergence caveat. `host_session(...).name`
  is always `None` with `// TODO(idl0):` present (`host.rs:172-173`), pointing at Q2.
  `host_constants` reads `doc.constants` (Task 6's merged field) verbatim. All three have a
  field-for-field test against a synthetic value; `host_session` and `host_constants` tests
  construct real `Session`/`WorkbookDoc` values field-for-field (not partial/mocked).
  `host_session`/`host_laps`/`host_constants` have no caller anywhere in this diff or the existing
  tree (confirmed no other file in the commit references them beyond the `mod.rs` re-export) — no
  `Session` threaded into anything resembling Task 9's `eval_cells`.
- **Step 4 (`find_inline_exprs`, L3-R24).** Brace-depth counter skips `'…'`/`"…"`/`` `…` ``
  literals honouring `\`-escapes (`js_cell.rs:78-92`); skips `pulldown_cmark::Event::Code` and
  `Event::Start(Tag::CodeBlock(_))` byte ranges collected in one prior `into_offset_iter()` pass
  (`inert_ranges`, mirrors `cell.rs`'s `scan_cells` style as instructed). All required tests
  present by name: `single_span_in_prose_one_inline_expr_js_expr_matches`,
  `two_spans_two_inline_exprs_in_document_order`,
  `nested_object_literal_brace_balanced_not_closed_early`, `no_dollar_brace_present_empty_vec`,
  and L3-R24's two new ones: `brace_inside_a_string_literal_is_ignored_by_the_depth_counter`,
  `dollar_brace_inside_a_fenced_code_block_in_prose_is_not_extracted`. `start`/`end` documented as
  byte offsets into `prose`, not the document (`js_cell.rs:11-14`).
- **No `regex` dependency added** — `grep`'d `core/Cargo.toml` for `regex`, no match; the scanner
  is a hand-rolled byte scan as required.
- **`mod.rs` diff** is exactly two `pub mod` lines and two `pub use` lines — no other change, no
  churn.
- **Repo hygiene.** Commit is single-line, exact message from the brief, no AI attribution
  trailer. `git show --stat` confirms only the three named files touched — no `git add -A` stray.
  Shared checkout and other worktrees untouched (not visited). Nothing under `docs/` touched.
- **CLAUDE.md §5.** Doc comment on every public symbol (`HostChannel`, `to_host_channel`,
  `channel`, `HostLap`, `host_laps`, `HostSession`, `host_session`, `host_constants`,
  `InlineExpr`, `find_inline_exprs`); units stated at every numeric field/conversion site
  (`t`/`start_t`/`end_t` in seconds, `t_us` in µs, called out explicitly at the one conversion
  site in `channel()`); no `Err(String)`; no unexplained `unwrap()`/`expect()` in production code
  (only in `#[cfg(test)]` blocks, confirmed by `grep`).
- **CLAUDE.md §4.** All ten new tests are Arrange/Act/Assert with blank lines between sections,
  named `thing_condition_result` (underscore-joined, as the standing brief notes is the expected
  Rust realization of the naming convention). Tests exercise only this task's new code, not a
  re-test of `eval.rs`/`cell.rs`/`resolve.rs`.
- **No reformatting** — both `.rs` files are new; `mod.rs`'s diff is purely additive.

## Verdict rationale

The implementation matches L3-R21 through L3-R24 precisely on every point the rulings state
explicitly: `to_host_channel`'s `length = v.len()` rule, `channel()`'s corrected signature and
`MathEvalError` return type, the camelCase `Serialize` exception with its documented rationale,
`host_session`/`host_laps`/`host_constants` left uncalled, and the string/fence-aware `${…}`
scanner. Both targeted test filters pass with non-zero counts, all eleven named tests exist by
name, no `regex` was added, and hygiene is clean. The two items above are not code defects: (a)
the `other_session` id string being unused is a direct, documented consequence of the signature as
ruled — `channel()` cannot itself detect a caller mis-wiring `(id, lookup)`, which is worth the
lead knowing but is not something this task's ruled signature lets the implementer fix
unilaterally; (b) collapsing "no laps" and "lap out of range" into one `NoLapContext` message is a
genuine gap in L3-R22's literal text (which only names the empty case), resolved by the
implementer using the only fitting existing error kind and documenting the extension — the
resulting message is honest (names the specific lap requested) rather than a "no laps" lie, but
doesn't tell the user how many laps do exist. Both are reported for the lead to rule on, not
findings against this task's execution.

VERDICT: CLEAN
