# L3 Task 5 review — per-sample `t_us` on the workbook math engine (C1 §8 item 5)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `fd9b30d` (single commit,
parent `d0fc17b`). In scope: `core/src/math/eval.rs`, `core/src/math/value.rs`,
`core/src/math/resolve.rs`, `core/src/math/variance_geom.rs`,
`core/src/math/vector.rs`, `core/src/math/tests_ahrs.rs`,
`core/src/math/tests_parity.rs`, `core/src/session/handle.rs`,
`core/src/table/eval.rs`, `core/src/estimate/run.rs` — matches `git show
--stat` exactly, no stray files. Working tree is clean (`git status` —
nothing to commit); no unrelated uncommitted changes present.

## Test command and result

Per L3-R14/brief-task5's COMPUTE RULES, ran the four per-group filters (the
implementer's own working filters), one cargo process at a time, foreground.
Did **not** re-run the end-of-task full `-p idl-rs -p idl-rs-cli
--test-threads=4` — per the dispatch, that was already run at this commit and
is out of scope for this review.

```
cargo test -p idl-rs -- --test-threads=4 math::
  test result: ok. 164 passed; 0 failed; 0 ignored; 0 measured; 588 filtered out

cargo test -p idl-rs -- --test-threads=4 table::
  test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 740 filtered out

cargo test -p idl-rs -- --test-threads=4 estimate::
  test result: ok. 99 passed; 0 failed; 0 ignored; 0 measured; 653 filtered out

cargo test -p idl-rs -- --test-threads=4 session::handle
  test result: ok. 57 passed; 0 failed; 0 ignored; 0 measured; 695 filtered out

cargo check -p idl-rs-cli --tests
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.70s (no errors)
```

All four filters report a non-zero `passed` count; `cargo check -p
idl-rs-cli --tests` is clean. This reproduces what the implementer reported
(332 total lib tests across the four groups, `idl-rs-cli` unaffected by the
three `pub` struct shape changes).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |
| Minor | `core/src/math/eval.rs:1005-1015` (`if`) | `if(cond,t,f)` takes `cond`'s `t_us` as the output axis without checking `t`/`f` channel operands' own `t_us` against it (L3-R12's equality-or-error rule is only applied inside `elemwise`, not here). Pre-existing behaviour (this task didn't introduce positional `value_at` indexing of the branches, only added the `t_us` field on top of it), and `if` isn't in Step 2's named function list — not a task-5 obligation, but worth a lead note since it's a silent-axis-adoption gap the same class as what L3-R12 exists to prevent. | Track as a follow-up if `if()` gains channel-typed `t`/`f` args with independent axes; not blocking. |
| Minor | `core/src/math/eval.rs:1258`, `core/src/estimate/run.rs:947`, `core/src/math/tests_ahrs.rs:269`, `core/src/math/tests_parity.rs:16` | `synthetic_t_us(len, rate)` is copy-pasted verbatim in four test modules rather than a single shared test-support helper. Test-only code, not a "shared constant/type" in the cross-task-consistency sense (each is a private `fn` in its own `#[cfg(test)]`/test-file module, not a redeclared domain constant), so it doesn't drift silently the way `RESERVED_NAMES` would. | Could be hoisted to a `#[cfg(test)]` helper module if a later task adds a fifth copy; not worth doing now. |

## Checks performed (all pass)

- **L3-R11 (`SessionHandle` side, store round-trip).** `store_math_with_times`
  (`handle.rs:571-593`) calls `Channel::from_f64_with_times(...,
  "synthesized")` — `"synthesized"` is a literal, not threaded from a
  parameter that could be misused, and the doc comment explicitly calls out
  why it isn't optional (ties to `store/parquet.rs`'s exclusion filter).
  `math/resolve.rs:75`'s `resolve_dependencies` switched from `store_math` to
  `store_math_with_times`, passing `out.t_us`. `handle.rs:934-941`'s
  `lookup()` populates `t_us: Arc::from(c.t_us.as_slice())` in the
  `LookupChannel` literal. `store_math` itself is untouched and still used by
  the estimator's eight outputs / existing tests, per the ruling.
  Round-trip test `store_math_with_times_round_trips_the_real_axis_not_a_synthesized_ramp`
  uses a genuinely irregular axis (`[0, 103_412]`) that a uniform `i/rate`
  ramp (`[0, 100_000]`) could never produce, and asserts both the correct
  value and inequality with the wrong one — a real regression guard, not a
  tautology. It also asserts `source_kind == "synthesized"` on the stored
  channel.
- **L3-R12 (`combine_t_us`), verified against the exact three-way rule.**
  `eval.rs:466-485`: `a.is_empty()` → return `b.clone()`; `b.is_empty()` →
  return `a.clone()`; both non-empty and `a.as_ref() == b.as_ref()` → return
  `a.clone()`; both non-empty and unequal → `MathEvalErrorKind::Runtime`
  naming both spans (`len`, `first`, `last` for each side) — matches "empty
  inherits; both-non-empty-and-equal passes through; mismatch is a typed
  Runtime error naming both spans" exactly, arm order and all. Wired into
  `elemwise`'s `(Channel, Channel)` arm only (line 424) — the two scalar
  mixed arms correctly keep the channel operand's `t_us` unchanged without
  calling `combine_t_us` (no channel-vs-channel comparison needed there).
  Rate-0/table sources (`table/eval.rs:161-171`, `eval.rs:col-ref` arm at
  ~315) and scalar results (`EvalOutput`'s `Value::Scalar` arm) return
  `Arc::from(&[] as &[i64])`/`Vec::new()`, never a synthetic axis — no
  `INFINITY as i64` anywhere in the diff. `{col_a[]} - {col_b[]}` and
  "channel + empty-t_us channel" tests both present and correct
  (`col_minus_col_both_empty_t_us_still_evaluates`,
  `channel_with_t_us_plus_channel_with_empty_t_us_result_carries_the_non_empty_axis`).
  `add`-identical / `add`-mismatch / `differentiate` pass-through tests all
  present, all correctly named and structured A/A/A.
- **Every channel-returning path threads `t_us`.** Grepped every
  `Value::Channel(ChannelValue { … })` construction (6 sites) and every call
  to the `channel(samples, rate, t_us)` helper (18 sites) in `eval.rs` — all
  pass a `t_us` value, none omitted. `map_value` (elementwise unary,
  backs `abs`/`sqrt`/`sign`/`floor`/`ceil`/`round`/trig/`neg`/`not`) passes
  `c.t_us` through unchanged (1:1 map, correct). `min`/`max`/`atan2`/`pow`
  2-arg forms route through `elemwise` (covered by `combine_t_us`), not a
  separate hand-rolled path. `integrate`/`butter`/`declip`/`differentiate`/
  `detrend`/rolling `rms`/`mean`/`std`/`clamp` all pass `ch.t_us` through
  unchanged. `fft` (bins, not samples), `current_lap()`, `sector_number()`
  correctly emit empty `t_us` with a comment explaining why (no real axis to
  inherit; fabricating one from the closed-form `i/rate` base would violate
  L3-R12). `lap_start_time`/`lap_end_time`'s per-sample maps clone `c.t_us`
  (1:1 over `c`'s own samples, correct). `require_ref_channel` (eval.rs:617)
  is now a 4-tuple `(samples, rate, t_us, channel_id)`; both call sites
  (`variance_time`/`variance_dist` at eval.rs:1130/1155) unpack all four and
  pass `main_t_us` into `eval_variance_time`/`eval_variance_dist`
  (`variance_geom.rs`), which build their result `ChannelValue` with
  `t_us: Arc::from(main_t_us)` — matches G5.7 ("the result aligns to
  `main_samples`"), not a fabricated axis. `variance_geom.rs`'s pre-existing
  numeric tests are untouched by the diff (only the two function signatures
  and their `ChannelValue` literals changed), so they exercise unchanged
  arithmetic against the new parameter — no behaviour change smuggled in.
  `vector.rs`'s `chan_or_scalar` (used by `rotate_euler_varying`, a
  multi-operand broadcast with no single source axis to inherit) emits empty
  `t_us` with an explicit, reasoned comment — a defensible judgment call
  consistent with L3-R12's "don't fabricate" principle for a case the brief
  didn't explicitly cover.
- **No DSP algorithm change (L3-R13).** `git diff --stat` touches only
  `eval.rs`, `value.rs`, `resolve.rs`, `variance_geom.rs`, `vector.rs`,
  `handle.rs`, `table/eval.rs`, `estimate/run.rs`, and the two math test
  files — none of `integration.rs`, `filters.rs`, `statistics.rs`,
  `clip_reconstruct.rs`, `fft.rs`, or `session/synthesis.rs` appear in the
  diff. `resolve_time_base`'s `(len, rate)` closed form (`eval.rs:648-668`)
  is untouched arithmetic; only its doc comment changed. The false sentence
  ("Time is the synthesized uniform ramp … the closed form is exact") is
  deleted and replaced with a `// TODO(idl0):` naming
  `session::synthesis.rs:64` (checked — that line is exactly the winning
  channel's `t_us` clone inside `synthesize_time`) and the measured drift,
  matching the brief's wording requirement verbatim in form (`//
  TODO(idl0):`, not a bare `// TODO`). `LookupChannel::t_us`'s doc comment
  (eval.rs:19-26) states only what's true: real recorded time, not a
  synthesized ramp, `samples.len() == t_us.len()` when non-empty. No new
  step-size math anywhere in the diff.
- **L3-R15.** `ChannelLookup::sample_times`'s doc comment
  (`eval.rs:76-79`) and `handle.rs:333-334`'s
  `channel_sample_times` doc comment both gained the required one-line
  restatement ("seconds view … kept for the estimator; new code reads
  `t_us` instead"); `MathLapContext`'s doc comment (`eval.rs:178-181`)
  restated the same. Neither function's body changed.
- **Step 1 struct shapes (G5.9).** `LookupChannel.t_us: Arc<[i64]>`,
  `ChannelValue.t_us: Arc<[i64]>`, `EvalOutput.t_us: Vec<i64>` — matches the
  mandated ownership split (shared intermediate vs. owned top-level return)
  exactly. `MemoLookup`'s cache-hit and cache-miss-insert paths both
  `.clone()` the `Arc` (`eval.rs:38-56`), never re-copy the underlying data —
  checked both branches. Grepped for `.to_vec()`/`Vec::from` on any `t_us`
  outside `EvalOutput`'s two construction sites and `store_math_with_times`'s
  parameter (both intentional, owned-return conversions) — found none
  elsewhere.
- **Test-double sizing.** Test doubles across `eval.rs`, `estimate/run.rs`,
  `tests_ahrs.rs`, `tests_parity.rs` use an explicit synthetic-rate formula
  (`i * 1_000_000 / rate`) matching `Channel::from_f64`'s own formula, not a
  raw index relabeled as µs — checked each `synthetic_t_us`/inline
  equivalent. The dedicated `TimedLookup` test double
  (`eval.rs:1276-1291`) gives per-channel explicit `t_us` for the
  propagation tests, needed because the always-agreeing synthetic formula
  would defeat the identical/differing/empty-axis test cases.
  `evaluate_t_us_matches_source_channels_axis_exactly` confirms
  `evaluate()`'s top-level wiring end to end.
- **CLAUDE.md §4/§5.** All new tests are A/A/A with blank lines between
  arrange/act/assert and named `thing — condition — result` (realized as
  underscore-joined identifiers). Doc comments present on every touched
  `pub` symbol (`LookupChannel::t_us`, `ChannelValue::t_us`,
  `EvalOutput::t_us`, `store_math_with_times`, `eval_variance_time`/
  `eval_variance_dist`'s new parameter) and every one states units (µs). No
  `Err(String)` introduced; `combine_t_us`'s error is a typed
  `MathEvalError`/`MathEvalErrorKind::Runtime` via the existing `err()`
  helper. No unexplained `.unwrap()` on production-path data — the two
  `.write().unwrap()`/`.read().unwrap()` calls in `handle.rs` are the
  pre-existing lock-poisoning pattern `store_math` already uses, not new.
- **Hygiene.** Commit is a single line, no AI attribution trailer, matches
  the mandated message text exactly. File list matches `git show --stat`
  with no stray files (no `git add -A` artifacts). No reformatting — diffs
  are additive/surgical; multi-line `channel(...)` calls that grew a
  parameter reformat only their own call, not surrounding lines. Nothing
  under `docs/` touched. Working tree clean, no leftover state.

## Verdict rationale

This is a large, mechanically thorough task (10 files, ~30 call sites) and
every one of L3-R11 through L3-R15's specific, checkable rulings is
implemented exactly as specified: `combine_t_us` matches the three-way rule
arm-for-arm including the Runtime-error-naming-both-spans requirement, the
store-side round-trip fix is real and tested with a genuinely irregular axis
that would catch a regression to the old ramp-discarding path, no DSP
algorithm file is touched, and the required doc-comment corrections
(`resolve_time_base`'s false sentence, `LookupChannel::t_us`,
`sample_times`, `MathLapContext`) are all present and accurate. The two
Minor findings are a pre-existing `if()` design gap this task didn't
introduce and wasn't asked to fix, and harmless test-helper duplication —
neither changes a maintainer's decision about this diff. Test commands
reproduce non-zero `passed` counts across all four mandated per-group
filters and `cargo check -p idl-rs-cli --tests` is clean, confirming the
three `pub` struct shape changes don't break `idl-rs-cli`.

VERDICT: CLEAN
