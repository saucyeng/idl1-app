# L3 Task 12 review — cursor readout (C3 §3.7, R31)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `489247e` (`cursor: nearest-sample
readout, clamped inside span / null outside (R31), one algorithm shared with
SessionHandle (C3 §3.7)`), diffed against parent `812f761`. In scope: `core/src/cursor.rs`
(new), `core/src/lib.rs` (+1 line), `core/src/session/handle.rs` (extraction of
`nearest_at_t_us` + tests). Worktree is otherwise clean (`git status` → nothing to
commit); the shared checkout `idl1-app\rust` is untouched, still on `main`.

## Test command and result

```
cargo test -p idl-rs cursor
```
```
running 9 tests
test cursor::tests::cursor_readout_axis_less_channel_is_none ... ok
test cursor::tests::cursor_readout_empty_channel_is_none ... ok
test cursor::tests::cursor_readout_multiple_channels_one_empty_others_populated ... ok
test cursor::tests::cursor_readout_t_us_between_samples_ties_to_earlier ... ok
test cursor::tests::cursor_readout_t_us_after_last_sample_is_none ... ok
test cursor::tests::cursor_readout_t_us_before_first_sample_is_none ... ok
test cursor::tests::cursor_readout_nan_sample_at_nearest_index_is_some_nan ... ok
test cursor::tests::cursor_readout_t_us_matches_a_recorded_sample_exactly ... ok
test parse::reader::tests::bytes_and_skip_advance_cursor ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 835 filtered out; finished in 0.00s
```

```
cargo test -p idl-rs session::handle
```
```
test result: ok. 64 passed; 0 failed; 0 ignored; 0 measured; 780 filtered out; finished in 0.25s
```
(includes `nearest_at_t_us_empty_arrays_none_not_nan`,
`nearest_at_t_us_target_between_samples_tie_goes_to_earlier`,
`nearest_at_t_us_target_matches_a_sample_exactly`,
`nearest_at_t_us_target_past_the_ends_clamps`, all `ok`, plus every
pre-existing `session::handle` test including the `gps_channel_values_*` suite,
unaffected.)

Both filters run exactly once, each with non-zero `passed` and `0 failed` —
reproduces the implementer's reported result.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |

One item raised for lead judgment, not a defect in this task (see Verdict
rationale and the note below): `core/src/session/handle.rs:500-523`
(`gps_channel_values`, pre-existing, untouched by this commit) calls the
now-shared `nearest_at_t_us` through the still-clamping `nearest_by_t_us`
wrapper, and its own pre-existing test
(`gps_channel_values_clamps_to_nearest_past_channel_span`, line 2260) proves
a fix time past a channel's recorded span is deliberately clamped to that
channel's last sample rather than reading as absent. That is the same class
of silent-wrong-data failure R31 was written to prevent (a channel that
stops recording keeps reading as if live) — here it colours a GPS polyline
with a frozen stale value past where the target channel actually ended,
instead of the map trace going neutral/uncoloured past that point. This is
not a Task 12 defect: L3-R35 authorised editing only `nearest_by_t_us`/adding
`nearest_at_t_us`, explicitly scoped to "no v2 behaviour moves or changes,"
so the implementer correctly left `gps_channel_values` alone. It is a real
latent hazard in landed code, exposed (not created) by this task's naming of
"one nearest-sample rule, two out-of-span policies." Flagging per the
dispatch's item (b) as something that implies a lead ruling, not something
to fix here.

## Checks performed (all pass)

- **R31 clause-by-clause (item a).** `cursor_readout` (`cursor.rs:27-44`):
  `null` (`None`) when `t_us < ch_t_us[0] || t_us > ch_t_us[n-1]` for that
  channel — exact match to C3 §3.7 amended text's `t_us < first || t_us >
  last`. Inside the span, delegates to `nearest_at_t_us` unchanged (nearest
  rule copied verbatim from the old `nearest_by_t_us` body, `partition_point`
  + `<=` tie test, unmodified logic). Tie resolves to the earlier sample —
  verified by `cursor_readout_t_us_between_samples_ties_to_earlier` and by
  reading the `<=` in `nearest_at_t_us` (picks `lo`, the earlier index, on
  equality). `null` for a channel with no samples and for one with no
  recorded time axis are both covered by the single `n ==
  samples.len().min(ch_t_us.len()) == 0` branch, per C3 §3.7's third `null`
  case ("no samples at all, or … no recorded time axis").
- **Two-policy split (item b).** Confirmed real: `nearest_at_t_us` itself
  always clamps (doc comment at `handle.rs:995-1006` states this
  explicitly and directs callers wanting R31's `null` semantics to check the
  span themselves first); `cursor_readout` is the only caller that does that
  check. `gps_channel_values` (`handle.rs:500-523`, sole other caller, via
  the `nearest_by_t_us` wrapper at line 519) does not, and per its own
  existing test can be asked for a fix time past a channel's span — analysed
  above, real hazard, out of this task's authorised scope, forwarded as a
  lead item rather than a finding against this commit.
- **"Three landed call sites" claim (item c).** Grepped `nearest_by_t_us` in
  `core/src`: exactly one call site, `handle.rs:519` inside
  `gps_channel_values`, plus the definition and a comment reference. The
  brief's "three landed call sites" is wrong; the implementer's
  correction to one is accurate. `nearest_by_t_us`'s "no v2 behaviour
  moves" contract (only caller, unchanged signature/semantics) is intact
  regardless of the count being wrong in the brief.
- **"No existing tests to duplicate" claim (item c).** Diffed
  `core/src/session/handle.rs` at parent commit `812f761`: no `#[test]`
  function named against `nearest_by_t_us` existed before this commit (only
  an indirect comment reference inside a `gps_channel_values` test). The
  implementer's claim that there was no existing test table for
  `nearest_by_t_us` to avoid duplicating is correct; the new
  `nearest_at_t_us_*` tests in `handle.rs` are the first direct unit tests
  of this algorithm.
- **G12.2 (NaN sample, item d).**
  `cursor_readout_nan_sample_at_nearest_index_is_some_nan` (`cursor.rs`)
  exercises a real path: a two-sample channel `[1.0, NaN]`, `t_us` request
  exactly matching the NaN sample's timestamp, asserts `Some(v) if
  v.is_nan()` — proves `is_nan()` is not used for the emptiness check
  (confirmed also by reading `cursor_readout`'s body: emptiness is
  `samples.len().min(ch_t_us.len()) == 0`, never `is_nan()`) and that a NaN
  sample survives as `Some`.
- **G12.3 (axis-less channel, item d).**
  `cursor_readout_axis_less_channel_is_none` — empty `t_us`, three non-empty
  `samples`, asserts `None`; matches the required test named in the brief
  and the L3-R12 axis-less-channel definition, and is a distinct code path
  from the plain-empty-channel test (`cursor_readout_empty_channel_is_none`,
  both empty).
- **`nearest_at_t_us` extraction is behaviour-preserving.** Diffed against
  the pre-commit body: identical `partition_point`/tie logic, only the
  `NaN`→`None` return-type change (per G12.2) and dropping the seconds
  conversion (now done once in the thin `nearest_by_t_us` wrapper). The
  wrapper's own doc comment and behaviour (`NaN` on empty, clamped ends) are
  unchanged, so its one call site (`gps_channel_values`) keeps compiling and
  behaving identically — verified both by reading the diff and by the
  passing `gps_channel_values_*` test suite in the `session::handle` run
  above (unchanged, not touched by this diff, still green).
- **Do-not list.** No `is_nan()`-based emptiness check anywhere in
  `cursor_readout`. No proximity/gap tolerance added — clamp/null logic is
  exactly the two comparisons C3 §3.7 specifies. `handle.rs` edits are
  confined to extracting `nearest_at_t_us` and having `nearest_by_t_us`
  delegate — no other change to that file (diff confirms only lines
  988-1070 touched, plus new tests appended after the existing test module
  opens).
- **Style/hygiene.** Doc comments present on `cursor_readout` (module-level
  and function-level, states request-order/duplicate-id/existence-checking
  are the caller's job, and the design §3 heavy-array note is superseded by
  signed C3 §3.7 — G12.6) and on `nearest_at_t_us` (states the `None`-vs-`NaN`
  distinction and the µs unit on `target_us`). Tests are A/A/A with blank
  lines between sections, named `thing — condition — result` pattern
  (underscore-joined, as CLAUDE.md §4 expects for Rust identifiers). No
  `Err(String)`, no unexplained `.unwrap()` — the function is infallible by
  construction and returns `Option`. `core/src/lib.rs`'s new `pub mod
  cursor;` line is inserted in alphabetical order among the existing module
  list, single line, no unrelated churn.
- **Commit hygiene.** Single-line commit message, no AI attribution trailer.
  `git show --stat` file list (`cursor.rs`, `lib.rs`,
  `session/handle.rs`) matches the brief's explicit `git add` path list
  exactly — no stray files, no `git add -A`.
- **Cross-checked scope.** Nothing under `docs/` touched by this commit;
  shared checkout `idl1-app\rust` confirmed untouched, still on `main`.

## Verdict rationale

The implementation matches C3 §3.7's amended R31 text clause by clause:
unconditional `null` outside a channel's recorded span, unchanged
nearest-with-earlier-tie inside it, and `null` for the two other specified
cases (no samples, no time axis), all via one shared `nearest_at_t_us`
extracted from the landed `nearest_by_t_us` with no behaviour change to that
function's sole existing caller. Both required edge-case tests (G12.2 NaN
sample, G12.3 axis-less channel) exist, are correctly named, and exercise
real distinct code paths, confirmed by reading the assertions rather than
taking the report at face value. The implementer's two corrections to the
brief (one call site, not three; no existing test table to avoid
duplicating) both check out against the actual code. The one substantive
issue surfaced — `gps_channel_values` still silently clamps past a
channel's span, the same failure class R31 exists to prevent — is real but
is pre-existing landed behaviour outside this task's authorised edit scope
(R25/L3-R35 permit touching `nearest_by_t_us` only to extract and delegate),
correctly left alone here, and forwarded as a lead item rather than scored
against this commit. Both mandated test filters were run once each and
reproduced the implementer's reported non-zero, all-passing results. No
Critical or Important findings.

VERDICT: CLEAN
