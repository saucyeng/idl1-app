# L3 R39 review — `gps_channel_values` stops at a channel's span too

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `039df03` (`gps_channel_values:
null past a channel's span, matching cursor_readout (R39)`), diffed against
parent `489247e` (Task 12, already reviewed CLEAN). In scope: `core/src/session/handle.rs`
only — doc comment on `gps_channel_values`, its body, and its test module.
Worktree otherwise clean.

## Test command and result

```
cargo test -p idl-rs session::handle
```
```
test result: ok. 65 passed; 0 failed; 0 ignored; 0 measured; 780 filtered out; finished in 0.30s
```
(One more than Task 12's review recorded — the new
`gps_channel_values_at_span_boundary_returns_value` test — plus the renamed
`gps_channel_values_nan_past_channel_span` in place of the old
`_clamps_to_nearest_past_channel_span`.)

```
cargo test -p idl-rs cursor
```
```
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 836 filtered out; finished in 0.00s
```
(Unchanged from Task 12's run — this commit doesn't touch `cursor.rs`.)

Both filters run exactly once, each non-zero `passed`, `0 failed`.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical, Important, or Minor findings. | — |

## Checks performed

**(a) Scope: only the span check moved, the shared primitives didn't.**
`git diff 489247e..039df03 -- core/src/session/handle.rs` touches exactly two
regions: the `gps_channel_values` doc comment + body (lines 488–545) and its
test module (lines 2257 on). `nearest_by_t_us` (`handle.rs:1012-1015`) and
`nearest_at_t_us` (`handle.rs:1030-1044`) sit outside both diff hunks and are
byte-identical to Task 12's landed versions: `nearest_by_t_us` still rounds to
`target_us` and delegates to `nearest_at_t_us`, unwrapping to `NaN`;
`nearest_at_t_us` still clamps (`hi = pos.min(n-1)`, `lo = pos.saturating_sub(1)`,
no span check) and its doc comment still tells callers wanting `null`-past-span
semantics to check the span themselves first. The new `gps_channel_values` body
does exactly that: computes `target_us` itself, tests
`target_us < c.t_us[0] || target_us > c.t_us[n-1]` before ever calling
`nearest_by_t_us`, matching `cursor_readout`'s own check
(`cursor.rs`, `t_us < first || t_us > last`) clause for clause. Confirmed by
reading, not by trusting the doc comment's own claim.

**(b) The boundary.** `gps_channel_values_at_span_boundary_returns_value`
constructs `"Fork"` at 1 Hz with 3 samples (`t_us = [0, 1_000_000, 2_000_000]`)
and GPS fixes at recording-secs exactly 0, 1, 2 (`GPS_EpochMs = [0, 1000, 2000]`,
`timestamp_utc_ms = 0`, so `epoch_ms_to_time_secs` maps them to exactly those
three `t_us` values after the `× 1e6` round-trip). The assertion is
`v == vec![7.0, 8.0, 9.0]` plus `v.iter().all(|x| !x.is_nan())` — a real value
at both `t_us[0]` and `t_us[n-1]`, not a weaker "not all NaN" check. The `<`/`>`
(not `<=`/`>=`) comparisons in the new code make both ends inclusive, matching
this test and matching R31's own `<`/`>` wording. Ran green above.

**(c) The NaN decision — right, not just consistent.** Before this commit,
`gps_channel_values`'s own doc comment already said `NaN` where "the channel is
absent" — i.e. this exact function, for this exact `Vec<f64>` return type, was
already using `NaN` as its no-value marker prior to R39; R39 only adds one more
case (outside-span) to an existing convention, not a new one. The convention
also exists elsewhere in the crate for the same class of problem:
`chart_decimation.rs:119`'s doc comment states "an all-NaN or past-end column
emits" NaN pairs for `decimate_tile_pure`, the tile-building sibling of this
function. Both are IPC-crossing `Vec<f64>` producers for chart/map rendering,
where an `Option<f64>` per element (or a parallel bitmap) isn't the shape any
other function in the module uses. So `NaN` is the established convention for
*this return type* in *this module*, not merely "consistent because everything
here already conflates the two" — it's the right type-level choice given the
signature is fixed at `Vec<f64>` (changing it to `Vec<Option<f64>>` would be a
real signature change, out of this fix's scope and unneeded by any caller).

Can a caller distinguish "outside span" from "recorded NaN"? No — and it
doesn't matter here: both cases exist so the GPS-polyline colouring can skip
the point (an uncoloured segment), which is the same rendering action for a
genuinely-missing reading and for a sensor that recorded `NaN` at a live
timestamp. Nothing in the function's use (colouring a map trace) needs the
distinction. The new doc comment states the ambiguity explicitly rather than
leaving it implicit, which is the honest way to land a known, harmless
overload of the sentinel.

**(d) The inverted test genuinely proves the new behaviour.**
`gps_channel_values_nan_past_channel_span` builds a channel `"Short"` at 1 Hz,
length 1 (`t_us = [0]`), against GPS fixes at secs 0, 1, 2. Asserts `v[0] ==
42.0`, `v[1].is_nan()`, `v[2].is_nan()`. Traced against the pre-R39 code
(`nearest_by_t_us` alone, no span check): `nearest_at_t_us` would clamp
`target_us = 1_000_000` and `2_000_000` to the single sample at index 0,
returning `42.0` for all three — so `v[1]`/`v[2]` would be `42.0`, not NaN, and
`v[1].is_nan()`/`v[2].is_nan()` would fail. The test would fail against the old
clamping code and passes against the new span-checked code — a real
discriminating test, not a renamed tautology.

**(e) Nothing else in `handle.rs` changed.** `git diff --stat` reports one file,
75 insertions / (the tool's own diff shows) matching inserts/deletes confined to
the two regions in (a); no other function's body, doc comment, or test module
is touched.

**Commit hygiene.** Single-line commit message
(`gps_channel_values: null past a channel's span, matching cursor_readout
(R39)`), no AI attribution trailer. `git show --stat` shows one file
(`core/src/session/handle.rs`).

## Verdict rationale

The fix does exactly what R39 rules and no more: `gps_channel_values` now
returns `NaN` for any fix time outside its target channel's own recorded
`[first, last]` span, computed at the call site exactly as `cursor_readout`
does; `nearest_by_t_us`/`nearest_at_t_us` are provably untouched and still
clamp, staying the shared primitive per L3-R35's original scope fence. The new
boundary test proves both span edges still resolve to a value (not a weaker
assertion), and the inverted test provably discriminates old clamping
behaviour from new span-checked behaviour by hand-tracing what the old code
would have returned. The `NaN`-as-sentinel choice is not just internally
consistent but the right call for this signature: it was already this
function's own pre-existing convention for the absent-channel case, mirrors an
identical convention in the crate's other IPC-crossing chart-data function
(`decimate_tile_pure`), and the ambiguity it accepts (missing vs.
legitimately-recorded NaN) has no caller that needs to tell the two apart —
both render as "don't colour this point." Both mandated test filters ran once
each, non-zero passed, zero failed. No findings at any severity.

VERDICT: CLEAN
