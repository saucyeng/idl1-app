# Review: R27 GPS decimal-degrees — round-trip test fix (scoped re-review)

**Commits:** `ed66516` "R27 review fix: strengthen .idl0t wire round-trip
test to catch a /1e7-vs-*1e-7 regression", diffed against `132504c` (the
already-reviewed R27 commit — see `review-r27.md`).

**Files touched:** `core/src/track_artifact/model.rs` only — 95 lines
added, 0 removed, 0 modified. Purely a new `#[cfg(test)] mod tests` block
appended after the existing `impl From<&Track> for TrackArtifact` block.

**Test commands run** (one at a time, per dispatch, no `-j`, no
`--workspace`):

- `cargo test -p idl-rs track_artifact -- --test-threads=4` → **11 passed;
  0 failed** (includes both new tests:
  `gate_wire_round_trip_is_bit_exact_across_a_spread_of_coordinates`,
  `gps_fix_wire_round_trip_is_bit_exact_across_a_spread_of_coordinates`)
- `cargo test -p idl-rs tracks -- --test-threads=4` → **18 passed; 0
  failed**

## (a) Is the lead's original write→read→write/compare-`i32` design genuinely non-discriminating?

Verified independently, not taken on the implementer's word. For a value
`deg`, let `raw = round(deg * 1e7)` (the wire `i32` grid point, same on
either operator since encoding is unchanged). Under a regression to `raw *
1e-7` on decode:

| deg | raw | decoded (`raw*1e-7`) | re-encoded (`round(decoded*1e7)`) | == raw? |
|---|---|---|---|---|
| 50.1163 | 501163000 | 50.116299999999995 | 501163000 | **True** |
| -122.9574 | -1229574000 | -122.95739999999999 | -1229574000 | **True** |
| 89.9999999 | 899999999 | 89.99999989999999 | 899999999 | **True** |
| -89.9999999 | -899999999 | -89.99999989999999 | -899999999 | **True** |

The re-encode's `.round()` snaps the sub-ULP error from the wrong operator
straight back onto the same integer grid point in every case checked. The
lead's original design (write→read→write, compare `i32`) is confirmed
genuinely non-discriminating for this bug class — it was correct to reject
it.

The replacement (Assert 2 in the new tests: `assert_eq!(gate2.lat1,
wire1_lat / 1e7, ...)`) compares the *production decode path's output*
(`gate2.lat1`, computed by `LapGateDto::into_gate` calling whatever
operator is live in `model.rs:149-152`) against a *test-local, hardcoded*
`/ 1e7` computed independently in the test body from the same wire value.
This is not circular: if `into_gate`/`GpsFixDto::into_core` regressed to
`* 1e-7`, `gate2.lat1` would take the `* 1e-7` value while the test's RHS
stays pinned at `/ 1e7`, so the two diverge exactly on the value set where
the operators disagree. This is the correct level to assert at — it tests
where the two operators actually diverge (the decoded `f64`), not where a
downstream `.round()` erases the difference.

## (b) Are the four named catch values genuinely discriminating, and is the rest of the table honest?

Recomputed all 17 `CASES` values independently (Python `round()`/IEEE-754
double arithmetic, not trusting the report):

| deg | raw | `raw/1e7` | `raw*1e-7` | equal? |
|---|---|---|---|---|
| 50.1163 | 501163000 | 50.1163 | 50.116299999999995 | **False** |
| -122.9574 | -1229574000 | -122.9574 | -122.95739999999999 | **False** |
| 89.9999999 | 899999999 | 89.9999999 | 89.99999989999999 | **False** |
| -89.9999999 | -899999999 | -89.9999999 | -89.99999989999999 | **False** |
| 179.9999999 / -179.9999999 | ±1799999999 | equal | equal | True |
| 45.1234567 / -45.1234567 | ±451234567 | equal | equal | True |
| 0.0000001 / -0.0000001 | ±1 | equal | equal | True |
| 1.0 / -1.0, 90.0/-90.0, 180.0/-180.0, 0.0 | trivial | equal | equal | True |

All four named catch values (`50.1163`, `-122.9574`, `89.9999999`,
`-89.9999999`) genuinely diverge between the two operators — confirmed,
not taken on faith. All 13 remaining values genuinely round-trip
identically under either operator, so the doc comment's claim that "the
rest... round-trip under either operator and are included for coverage,
not as regression bait" is accurate and not overstated. Injecting the
`*1e-7` regression manually (mentally, via the table above) would fail the
test at the first `CASES` entry with a real fractional component
(`50.1163`), matching the report's account.

## (c) Structure of the new tests

- Table-driven: both new tests iterate a shared `const CASES: &[f64]`
  array rather than duplicating asserts per value.
- Bit-exact: uses `assert_eq!` throughout, no epsilon/`assert_relative_eq!`
  — appropriate since the whole point is to catch a sub-ULP divergence
  that an epsilon comparison could paper over.
- Covers both signs: every non-zero magnitude in `CASES` appears as a
  ±pair (`50.1163`/`-50.1163` is the only one *not* mirrored — actually
  `50.1163` has no negative counterpart in the array, but `-122.9574` and
  the `89.9999999`/`-89.9999999`, `179.9999999`/`-179.9999999`,
  `45.1234567`/`-45.1234567` pairs are all present; each test additionally
  negates `deg` for `lon`/one coordinate of the `Gate`/`GpsFix`, so every
  iteration exercises one positive and one negated value regardless).
  Overall: signed coverage is present and adequate; not a finding.
- Names follow `thing — condition — result` in spirit
  (`gate_wire_round_trip_is_bit_exact_across_a_spread_of_coordinates`,
  `..._gps_fix_...`) and both have Arrange/Act/Assert comments with blank
  lines between, per CLAUDE.md §4.

## (d) Nothing else changed in this commit?

Confirmed via `git diff 132504c..ed66516`: the only file touched is
`core/src/track_artifact/model.rs`, and the diff is 95 insertions / 0
deletions — purely the two new `#[test]` fns and their doc comment, no
edits to any existing line, no other file in the tree touched.

## (e) The Minor: `estimate/run.rs` "genuine bug fix" framing

This commit makes no code change to `core/src/estimate/run.rs` (confirmed:
absent from the diff). The doc comment currently on
`gps_samples_from_lookup` (`core/src/estimate/run.rs:89-93`) already
correctly frames `GPS_Heading` as "physical degrees clockwise from north,
ruling R27" with no "genuine bug fix" language present in-repo — there was
never a misleading comment *in the source* to correct; my prior finding
was about the implementer's PR-description/report framing, not a code
comment, so there is nothing to check in the diff for this item. Taking
the implementer's word that the out-of-repo wording was corrected is
reasonable here since there is no artifact in this repo to independently
verify it against; this does not affect the diff's correctness and was
filed as Minor/no-action-required originally.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. The new tests close the exact gap identified in `review-r27.md`'s one Important finding, using the correct discriminating assertion (decoded domain value vs. independently-hardcoded `/1e7`, not a round-tripped wire value), with honestly-labeled catch values and coverage values verified independently. | — |

## Verdict rationale

The implementer's core technical claim — that a write→read→write/compare-`i32`
design cannot catch a `/1e7`-vs-`*1e-7` regression because the write side's
`.round()` re-quantises the error away — is verified true by independent
arithmetic on all four claimed values, so the redesign was necessary, not
an evasion. The replacement assertion is structurally sound: it compares
production's decoded output against a test-local hardcoded ground-truth
expression using the same operator claimed correct, at the exact point
(the decoded `f64`, before any re-encoding) where the two candidate
operators diverge. All four named regression-catching values were
independently confirmed to diverge between `/1e7` and `*1e-7`; all
remaining table values were independently confirmed to be operator-
invariant, matching the "coverage not regression bait" labeling. The test
is table-driven, bit-exact, and covers positive/negative values across the
full latitude/longitude range including boundaries. The commit touches
only the test file, nothing else. Both targeted test commands pass with
non-zero counts. The prior Important finding is closed; the prior Minor
was about out-of-repo wording with no in-repo artifact to check further.

VERDICT: CLEAN
