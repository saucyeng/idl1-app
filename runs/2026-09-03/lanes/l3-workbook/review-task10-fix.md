# L3 Task 10 re-review — fix commit for the two Important findings

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Diff reviewed: `git diff b1a33d4..1f04286` (commit
`1f04286`, "tile: fix MAX_TIER guard to yield true all-NaN tile at every
tile_index; saturate column_sample_range"). Scope: this commit only — Task 10's
main commit (`b1a33d4`) was already reviewed and is not re-reviewed here.
Files touched: `core/src/chart_decimation.rs`, `core/src/session/handle.rs`.

## Test command and result

```
cargo test -p idl-rs chart_decimation
```
`test result: ok. 25 passed; 0 failed; 0 ignored; 0 measured; 790 filtered out`

```
cargo test -p idl-rs "tile::"
```
`test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 809 filtered out`

```
cargo test -p idl-rs "session::handle"
```
`test result: ok. 60 passed; 0 failed; 0 ignored; 0 measured; 755 filtered out`

Each run reports a non-zero `passed` count and `0 failed`, and the counts are
exactly the prior review's counts +2, +0, +1 respectively — matching the two
new `chart_decimation` tests, the renamed-but-not-added `tile_index: 1` test,
and the one new `handle.rs` test. No other cargo command was run.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. Both prior Important items are genuinely fixed; see verification below. | — |

## Verification of (a): true all-NaN guarantee at every `tile_index`, including 0

`chart_decimation.rs`: `decimate_channel` now has `if tier > MAX_TIER { return
empty_tile(); }` as its first statement, before `bucket_size`, `start`, or any
call into `decimate_tile_pure` is computed. `empty_tile()` returns
`2 * TILE_SIZE_BUCKETS` `f64::NAN` values unconditionally. This makes the
guarantee true at every `tile_index` by construction — there is no longer any
arithmetic on `tile_index` that runs before the check.

`handle.rs`: `SessionHandle::decimate_tile` has the identical guard as its
first statement, before `with_channel`/`min_max_range` is touched, returning
`crate::chart_decimation::empty_tile()`.

**Reasoning about the restored `tile_index: 0` tests, not just their
presence:**
- `decimate_channel_tier_above_max_tier_at_tile_index_zero_returns_all_nan_tile_no_panic`
  calls `decimate_channel(&samples, MAX_TIER + 1, 0)` on a 16-element sample
  vec and asserts every output value `is_nan()`. Traced the pre-fix code path
  by hand (as in the prior review): with the old code, `tier > MAX_TIER` makes
  `checked_pow` fail, `bucket_size = u32::MAX`; at `tile_index = 0`,
  `start = 0.saturating_mul(1024).saturating_mul(u32::MAX) = 0`; bucket 0 in
  `decimate_tile_pure` then computes `lo = 0, hi = min(0 + u32::MAX, 16) = 16`
  and folds the real `min=0.0, max=15.0` — non-NaN. So this test would have
  **failed** against the pre-fix code (asserts all-NaN, old code returns a
  real pair in the first two output slots) and only passes now because the
  early return removes that arithmetic entirely. This is a genuine regression
  test, not one that happens to pass either way.
- `decimate_tile_tier_above_max_tier_at_tile_index_zero_returns_all_nan_tile_no_panic`
  (`handle.rs`) is the same argument against the pre-fix `decimate_tile`: old
  code computed `tile_start = 0.saturating_mul(...).saturating_mul(bucket) = 0`
  at `tile_index = 0`, then `c.column.min_max_range(0, bucket)` over a
  20-sample channel of `1.0`s — a real, non-NaN `Some((1.0, 1.0))` in bucket 0.
  Read `min_max_range`'s call site (`handle.rs:626-636`, unchanged by this
  commit) to confirm this. The test would have failed pre-fix for the same
  reason.
- The `tile_index: 1` tests were renamed, not newly added (same bodies as the
  prior commit's tests, confirmed by diff) — still correct, still pass, no
  regression there.

Both doc comments (`MAX_TIER` in `chart_decimation.rs:11-19`, and
`SessionHandle::decimate_tile`'s doc in `handle.rs:611-620`) now state the true
guarantee: "checked before any bucket folds data, at every `tile_index`
including `0`" — matches the code exactly, no overstatement remains.

## Verification of (b): `column_sample_range` saturating arithmetic and the boundary test

`column_sample_range` now uses `saturating_mul` for `tile_span`
(`TILE_SIZE_BUCKETS as u64 * bucket_size`), `tile_start`
(`tile_index as u64 * tile_span`), and both `j * tile_span` products, plus
`saturating_add` for the `lo`/`hi` sums — matching the pattern already used in
`decimate_channel`/`decimate_tile`. No plain `u64` multiplication remains in
this function.

The new test `column_sample_range_large_tile_index_and_column_count_saturates_no_panic`
uses `tier = MAX_TIER + 1` (`bucket_size` saturates to `u32::MAX`),
`tile_index = column_count = 5_000_000`. Redid the arithmetic independently:
`tile_span = 1024 * u32::MAX = 4,398,046,510,080`. `u64::MAX / tile_span ≈
4,194,304` (≈4.19M, matching the prior review's boundary). `tile_index =
5,000,000 > 4,194,304`, so `tile_start = tile_index.saturating_mul(tile_span)`
genuinely overflows `u64` and saturates to `u64::MAX` under the fix — this
test does cross the boundary the prior review identified, not just approach
it. Pre-fix, this same call would have panicked in a debug build (`attempt to
multiply with overflow`), so the test is a genuine regression test for the
overflow, not a no-op. Under the fix, `stats`/`times` land on ranges far past
`samples.len()`/`t_us.len()` (3 samples), so every output column is
correctly the past-end/NaN case — asserted directly.

## `build_tile_bytes` output shape for in-range tiers

`tile.rs` (the file containing `build_tile_bytes`) is untouched by this commit
— confirmed via the `git diff --stat` above showing only `chart_decimation.rs`
and `handle.rs` changed. For any `tier <= MAX_TIER`, the new `if tier >
MAX_TIER { return empty_tile(); }` / early-return guards in `decimate_channel`
and `decimate_tile` are not taken, and `column_sample_range`'s arithmetic is
unchanged in effect for in-range tiers — `saturating_mul`/`saturating_add`
only differ from plain `*`/`+` when the product would actually overflow
`u64`, which cannot happen for `tier <= MAX_TIER` (`bucket_size <=
TIER_BASE.pow(MAX_TIER)`, far below the overflow threshold). So
`build_tile_bytes`'s encoded byte output is unchanged for any in-range tier —
confirmed by inspection (no arithmetic change on the in-range path) and by the
`tile::` test suite (6/6 passed, including the byte-for-byte header/round-trip
tests from the original review) reproducing identical results.

## Verdict rationale

Both Important findings from the original review are fixed correctly and
minimally. (a) is fixed by moving the `tier > MAX_TIER` check ahead of all
arithmetic in both `decimate_channel` and `SessionHandle::decimate_tile`,
making the all-NaN guarantee unconditionally true rather than true-except-at-
`tile_index == 0`; the restored `tile_index: 0` tests are genuine regression
tests, verified by hand-tracing that they fail against the pre-fix arithmetic.
(b) is fixed by switching every multiplication/addition in
`column_sample_range` to `saturating_mul`/`saturating_add`, matching the
pattern already used elsewhere in this file, and the new boundary test
verifiably crosses the ~4.19M overflow point identified in the original
review. Doc comments were updated to state the true (now-correct) guarantee
rather than the prior overstatement. No new files touched beyond the two the
fix required, no scope creep, commit is a single line with no AI attribution
trailer, and `build_tile_bytes`'s encoded output is unaffected for any
in-range tier. All three named test filters report non-zero `passed` and zero
`failed`.

VERDICT: CLEAN
