# L3 Task 10 review — tile endpoint, v2 layout (C3 §3.5)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`, commit under review `b1a33d4` (parent `f1f5ce7`).
Scope: `core/src/chart_decimation.rs`, `core/src/lib.rs`, `core/src/session/handle.rs`,
`core/src/tile.rs` — exactly the four files the brief's `git add` line names.
Worktree was clean at `b1a33d4` when reviewed; nothing else in scope.

## Test command and result

```
cargo test -p idl-rs chart_decimation
```
`test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 789 filtered out`

```
cargo test -p idl-rs "tile::"
```
`test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 806 filtered out`

```
cargo test -p idl-rs "session::handle"
```
`test result: ok. 59 passed; 0 failed; 0 ignored; 0 measured; 753 filtered out`

All three reproduce the implementer's reported non-zero `passed` / `0 failed` results. No
other cargo command was run.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `core/src/chart_decimation.rs:11-16` (doc on `MAX_TIER`) and the ruling text it implements | The claim "a too-large tier becomes an all-NaN tile" (brief's L3-R28, restated in the `MAX_TIER` doc comment) is **false at `tile_index == 0`**. Traced the arithmetic: for `tier > MAX_TIER`, `checked_pow` fails and `bucket_size` becomes `u32::MAX`. In `decimate_channel`, `start = tile_index.saturating_mul(...).saturating_mul(bucket_size)`; at `tile_index = 0` this is `0`, so `decimate_tile_pure`'s bucket `0` runs `lo=0, hi=min(0+u32::MAX, samples.len())=samples.len()` — i.e. it folds the **entire** sample array into bucket 0 as genuine (non-NaN) min/max, not NaN. Only buckets 1..1023 are NaN (their `lo` is astronomically past `samples.len()`). The identical bug exists in `SessionHandle::decimate_tile` (`handle.rs:619-624`, same `tile_start`/`min_max_range` shape) for the same reason. Both of the task's mandated tests (`decimate_channel_tier_above_max_tier_returns_all_nan_tile_no_panic`, `decimate_tile_tier_above_max_tier_returns_all_nan_tile_no_panic`) deliberately use `tile_index: 1`, not `0`, and their comments say why — so the false "all-NaN" claim is never exercised. Confirmed by reading the code, not by trusting the test names or the implementer's report: the guard prevents a **panic** correctly, but does not prevent a **real, non-NaN bucket** at `tier > MAX_TIER, tile_index == 0`. This is exactly the fact the dispatch asked to verify independently, and the implementer's own characterization (only true at `tile_index != 0`) is correct. | Either special-case `tier > MAX_TIER` to return `empty_tile()`/an explicit all-NaN vec before doing any arithmetic (in both `decimate_channel` and `decimate_tile`), or narrow the doc/ruling text to state the true guarantee ("no panic; real data may still appear in bucket 0 when `tile_index == 0`"). Since C3 §3.5 says L5 rejects `tier > MAX_TIER` before any bytes are produced, this is currently unreachable from the IPC surface — but the doc comment on a `pub const` and the ruling text both overstate what the code actually does, which the next reader (L5) will rely on. |
| Important | `core/src/chart_decimation.rs` — new `column_sample_range` (private fn feeding the `pub` `column_stats`/`column_times_us`) | `tile_start = tile_index as u64 * tile_span` and `(j as u64 * tile_span)` use plain (non-saturating, non-checked) `u64` multiplication, unlike every other overflow-prone site this task touches (`decimate_channel`/`decimate_tile` both use `saturating_mul`). Worked the numbers: at `tier > MAX_TIER` (`bucket_size = u32::MAX`), `tile_span = TILE_SIZE_BUCKETS as u64 * u32::MAX = 4,398,046,510,080`. `u64::MAX / tile_span ≈ 4,194,304` — so any `tile_index` (or `column_count`, since `j` ranges up to `column_count`) at or above ~4.19 million, combined with `tier > MAX_TIER`, overflows the `u64` multiplication. Debug/test builds panic on this (`attempt to multiply with overflow`); release builds wrap silently to a bogus range. No test in this diff exercises a `tile_index`/`column_count` anywhere near that magnitude, so the panic path is untested and unguarded — a direct violation of CLAUDE.md §5 "never a crash on bad data" for `pub fn column_stats`/`column_times_us`, and precisely the "let tier overflow silently anywhere" risk the brief said to close. | Use `saturating_mul`/`checked_mul` for `tile_start` and the two `j * tile_span` products in `column_sample_range`, matching the pattern already used in `decimate_channel` and `SessionHandle::decimate_tile`. |

No Critical findings — the build is sound, the byte layout is correct, and every filter passed
with a non-zero `passed` count.

## Checks performed (all pass)

- **(a) Binary tile layout vs. C3 §3.5 v2, byte-for-byte.** Read `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
  §3.5 (the amended, landed text) side by side with `tile.rs::build_tile_bytes` and its
  in-test `decode()`. Header: `magic` @0 `"IDLT"`, `version` @4 `u16 = 2`, `tier` @6 `u16`
  (narrowed via `tier.min(u16::MAX as u32) as u16`), `tile_index` @8 `u32`, `sample_count` @12
  `u32`, `column_count` @16 `u32`, `flags` @20 `u32 = 0`, `reserved` @24 `[u8; 8]` — matches the
  spec's field table exactly, and the header test (`build_tile_bytes_header_matches_c3_3_5_field_table_version_is_2`)
  asserts each field by byte slice, not just total length. Sample region: `32 + i*8`
  min/max — matches, interleaved pairs from `decimate_channel` written in order. Column
  region: `(32+sample_count*8) + j*12`, `min, max, mean` in that order — matches. Column
  time region: `(32+sample_count*8+column_count*12) + j*8`, `i64` LE — matches, including the
  sentinel-vs-NaN-sample distinction (`column_times_us_nan_valued_sample_at_bucket_start_still_returns_real_t_us`,
  and its `build_tile_bytes` counterpart via the round-trip test). Total length formula and the
  spec's own tier-3/512-sample/256-column worked example are reproduced verbatim in
  `offset_formula_matches_c3_3_5_worked_example_pure_arithmetic` and check out arithmetically
  (4128/7200/9248, all confirmed by hand).
- **(b) `MAX_TIER` guard — verified independently, see Findings table above.** The "no panic"
  half of the guarantee holds in all cases checked (including hand-derived edge cases). The
  "all-NaN" half is false at `tile_index == 0`, and a new, separate overflow (panic in
  debug, silent wraparound in release) exists in `column_sample_range` for large
  `tile_index`/`column_count` combined with `tier > MAX_TIER`. Both are recorded above.
- **(c) Scope of the `handle.rs` edit.** `git diff` shows exactly one production line changed
  (`decimate_tile`'s `TIER_BASE.pow(tier)` → `.checked_pow(tier).unwrap_or(u32::MAX)`,
  line 620) plus two new `#[cfg(test)]` tests appended at the end of the existing test module.
  Nothing else in `handle.rs` was touched — matches R25's scope authorization exactly.
- **(d) The cross-check test genuinely compares two independent paths.** `build_tile_bytes_sample_region_matches_decimate_tile_over_materialized_samples`
  (`handle.rs`) builds a real `Channel` via `SessionHandle::from_channels`, takes
  `h.channel_samples("C")` (materialized), calls both `h.decimate_tile(...)` (the
  non-materializing, `RawColumn::min_max_range`-based production path) and
  `tile::build_tile_bytes(&samples, &t_us, ...)` (which internally calls
  `chart_decimation::decimate_channel`, a materialized-slice path with independent
  bucket-folding code) for `tier in 0..=6, tile in 0..2`, decodes the byte-encoded sample
  region back to `f64` pairs, and asserts NaN-aware equality against `decimate_tile`'s
  output. Confirmed `decimate_tile` and `decimate_channel` are separate implementations
  (different files, different fold mechanisms — `RawColumn::min_max_range` vs. iterating a
  materialized `&[f64]`) — this is not a value compared to itself. `tile.rs`'s own
  `build_tile_bytes_round_trip_decode_matches_independent_computation` similarly decodes
  bytes and compares against direct calls to `decimate_channel`/`column_stats`/`column_times_us`
  — genuinely independent of the encoder's own internal state.
- `build_tile_bytes`'s signature matches the brief's proposed shape exactly (`&[f64]`,
  `&[t_us]: &[i64]`, `tier/tile_index/column_count: u32` → `Vec<u8>`); no deviation to report.
- `column_count == 0` legal path tested for `column_stats`, `column_times_us`, and (implicitly,
  via the header test) `build_tile_bytes`.
- Short-channel degenerate test (G10.4) present and correct: 3-sample channel, `column_count =
  20`, asserts most columns NaN/sentinel and exact (untruncated) tile length.
- Doc comments present on every new `pub` symbol (`MAX_TIER`, `column_stats`,
  `column_times_us`, `build_tile_bytes`) and on the private `column_sample_range`; `t_us`'s
  unit (µs) is stated; no `Err(String)` (module is infallible by construction, correctly
  undocumented as such); no unexplained `.unwrap()`/`.expect()` in production code —
  `unwrap_or(u32::MAX)` is a safe default, not a panic risk, and all `.try_into().unwrap()`
  calls are inside `#[cfg(test)]` modules.
- Tests named `thing_condition_result`, Arrange/Act/Assert with blank lines between (a few
  tests fold Act+Assert into one block inside a loop over parameter combinations — a
  reasonable, common pattern, not a violation).
- No reformatting: `tile.rs` is a new file; the other three files show only additive/surgical
  diffs, no churn on untouched lines.
- Commit is a single line, no AI attribution trailer; `git add` used the exact four paths the
  brief names (confirmed via `git show --stat`); nothing under `docs/` touched; the shared
  checkout and other worktrees untouched.
- Deferrals: the tier cache and the "extend the non-materializing approach to column/column-time
  regions" deferral are both named in `build_tile_bytes`'s doc comment, not silently built.
- Cross-lane authorization (R25) for the `handle.rs` edit and for reusing `MAX_TIER`/
  `checked_pow` in a landed L1 file is present and scoped correctly.

## Verdict rationale

The byte layout is correct in every field and offset checked against C3 §3.5's amended text —
this is the part the dispatch weighted heaviest, and it is clean. The cross-check test is a
genuine two-independent-paths comparison, the short-channel and sentinel/NaN-distinction tests
are present and correctly targeted, and hygiene (commit, file scope, doc comments, no
reformatting) is all in order. What keeps this from CLEAN is the `MAX_TIER` guard: the "all-NaN
tile" guarantee the ruling and the doc comment both state is false for `tile_index == 0` (real
folded data leaks into bucket 0), and the two mandated tests were written with `tile_index: 1`
specifically to avoid exercising that case — a fact the implementer disclosed rather than hid,
but the code and doc comment still assert something untrue. Separately, `column_sample_range`'s
new `u64` arithmetic introduces an unguarded overflow (panic in debug, silent wraparound in
release) for `tile_index`/`column_count` above ~4.19 million combined with `tier > MAX_TIER`,
where the rest of this same diff uses `saturating_mul` everywhere else. Both are narrow (today
unreachable without L5 validating `tier` first, and requiring unusual `tile_index`/`column_count`
magnitudes) but concrete, and both fixes are small and mechanical — either tighten the doc/
ruling wording and add `saturating_mul` in `column_sample_range`, or special-case `tier >
MAX_TIER` to short-circuit to an explicit all-NaN tile in both `decimate_channel` and
`decimate_tile`. This does not require re-architecting the approach.

VERDICT: NEEDS_FIXES
