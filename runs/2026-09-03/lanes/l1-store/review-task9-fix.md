# Task 9 fix-up review — `store/parquet.rs` (t_recorded_us collapse + deprecation cleanup)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Branch `wave1-l1-store`, commit `9f5f62fda75def2a4b513351145707efd7f50359`, on top of `bc72b3e`
(the commit reviewed in `review-task9.md`). Single-commit diff, one file touched
(`core/src/store/parquet.rs`, +38/-6), scoped exactly to the Important finding and the
recommended deprecation cleanup — no scope creep.

## Test commands and results (reproduced)

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo build -p idl-rs (forced rebuild via touch)   -> Finished, zero warnings (grep -i deprecat -> no match)
cargo test -p idl-rs store::parquet                -> 9 passed; 0 failed; 0 ignored
cargo test -p idl-rs                               -> 615 passed; 0 failed; 1 ignored; 0 measured
```

Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: clean, on `main`,
unaffected by this worktree's work.
No AI attribution trailer on the commit (verified `git show --format=fuller -s`).
No `cargo fmt` reformatting — diff matches surrounding hand-formatted style.

## Verified independently

- **C1 §2 convention re-checked against spec text** (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md:105-117`,
  `Channel.t_recorded_us` doc comment): *"`None` when `t_recorded_us` would be identical to
  `t_us` (every non-burst source, §3.3 — no correction ever applies), so the common case costs
  nothing; `Some` only for a burst source whose correction actually diverged the two."* The fix's
  new guard — `recorded_col.is_some() && t_recorded_us.len() == t_us.len() && t_recorded_us != t_us`
  — implements exactly this: collapses to `None` whenever the reconstructed recorded-stamp vector
  is element-wise identical to `t_us`, keeps `Some` only when they diverge. Matches the spec text
  verbatim, no more, no less.
- **Claimed pre-fix failure message spot-checked by tracing the write path**, not just taken on
  faith. `sample_session()`'s GPS channel: `t_us: vec![0, 2500]`, `t_recorded_us: None`. The
  writer (`parquet.rs:134`, `scatter` helper) calls `c.t_recorded_us_or_t_us()` to populate the
  `gps_t_recorded_us` column — this falls back to `t_us` when the field is `None`, so the written
  column holds `[0, 2500]`, identical to `t`, per §4.1's "column present for every enabled source
  regardless of correction" rule. Pre-fix, `read_column`'s old guard was
  `if recorded_col.is_some() && t_recorded_us.len() == t_us.len() { Some(t_recorded_us) } else { None }`
  — with `recorded_col` always present and lengths always matching for GPS, this necessarily
  produces `Some([0, 2500])`. The new test's assertion is `assert_eq!(gps.t_recorded_us, None)`,
  so a failure would report actual-as-left: `left: Some([0, 2500]) right: None`. This is exactly
  the implementer's claimed failure and is mechanically forced by the fixture and the pre-fix
  code, not a coincidence — confirmed by static trace, and additionally by green re-run of the
  full suite with the fix in place (9/9, including the new test).
- **`read_column`'s `gather!` macro logic re-read end to end** (`parquet.rs:467-494`): the
  per-index loop only pushes into `t_recorded_us` when both the channel value and the recorded
  column are valid at that row, and the final guard only fires when the reconstructed vector's
  length still matches `t_us`'s length (guards against partial-null misalignment, unchanged
  behaviour from before this fix) *and* the values differ. No new alignment bug introduced by
  adding the `!=` clause — it only narrows an existing `Some` branch to `None` in one additional
  case, doesn't touch the push loop or the length guard.
- **`set_max_row_group_row_count` deprecation status confirmed directly against the pinned
  `parquet-59.3.0` source** (`~/.cargo/registry/.../parquet-59.3.0/src/file/properties.rs:755-759`):
  `pub fn set_max_row_group_row_count(mut self, value: Option<usize>) -> Self { ...; self.max_row_group_row_count = value; self }`
  — no `#[deprecated]` attribute, signature (`Option<usize>`) matches the call site's
  `Some(ROW_GROUP_SIZE)` exactly. The old `set_max_row_group_size` at line 741-746 is confirmed
  still carrying `#[deprecated(since = "58.0.0", ...)]` and forwards to the same field — the swap
  is a pure rename, zero functional difference, as claimed.
  Forced a rebuild (`touch` + `cargo build -p idl-rs`) rather than trusting a cached build; output
  was `Finished` with **no warnings at all** — `grep -i deprecat` on the full build log returned
  no match (previously reproduced exactly one warning at this call site pre-fix, per
  `review-task9.md`). No other deprecation warnings snuck in.
- **Test structure**: `round_trip_recorded_stamps_none_stays_none` follows Arrange/Act/Assert with
  blank lines between sections, matches the file's existing naming convention
  (`round_trip_<condition>`, snake_case standing in for the `thing — condition — result` shape
  since Rust test names can't use em dashes/spaces — consistent with every other test in this
  file, e.g. `round_trip_scale_offset_metadata_bit_exact`). It genuinely exercises the read path
  end-to-end (`write_session_parquet` → `read_session_parquet`, real Parquet file on disk), not a
  unit test of `read_column` in isolation — appropriately proves the fix at the public-API level
  the review's finding was stated at.

## Findings

None. No Critical, Important, or Minor findings against this fix.

## Notes for the record (not findings — informational)

- One very minor style observation, not worth a finding: the new test's Arrange block contains an
  `assert_eq!` on the fixture's *input* precondition (`session.channels...t_recorded_us, None`)
  before the Act step. This documents the fixture's starting state rather than testing the system
  under test, and is a harmless, common pattern (fixture self-check) — does not violate
  Arrange/Act/Assert in any way that would change a maintainer's decision, and is a defensible
  choice given the test's whole point is that `None` survives the round trip.
- The two Minor findings from `review-task9.md` (IMU fixture doesn't test a *divergent*
  `t_recorded_us` case; regeneration/delete-before-rewrite untested at this layer) are **not**
  addressed by this commit and were not in scope for this fix-up — the task asked only for the
  Important finding and the deprecation cleanup. Both Minors remain open, correctly deferred (one
  to a future strengthening of this file's tests, one explicitly flagged for Task 12/16). Neither
  blocks closing Task 9's Important finding.

## Verdict

**CLEAN.** The Important finding from `review-task9.md` is fixed correctly: the read path now
collapses `t_recorded_us` to `None` exactly when C1 §2 says it should, verified against the spec
text, traced against the write path to confirm the claimed pre-fix failure is real, and proven by
a genuine, correctly-structured round-trip test that fails without the fix and passes with it.
The `set_max_row_group_row_count` swap is a verified zero-risk rename, confirmed by a from-scratch
rebuild showing zero warnings. Full suite reproduces at 615 passed / 0 failed / 1 ignored, up from
614/0/1 pre-fix (net +1 test, the new one). Repo hygiene (no AI trailer, no `cargo fmt`, shared
checkout untouched) confirmed.

**Task 9 is fully closed.** All three findings from `review-task9.md` are resolved or correctly
deferred: the Important finding is fixed and independently re-verified here; the recommended
`set_max_row_group_size` deprecation cleanup (raised as a recommendation ahead of Task 10 reusing
this pattern, not itself a blocking finding) is done; the two Minor findings were never blocking
and remain correctly tracked as follow-ups (one a test-coverage strengthening, one explicitly
addressed to Task 12/16's regeneration-rule work, not Task 9). Every one of the C1 §7 seven
round-trip guarantees now has a passing, meaningfully-discriminating test for the case reviewed
here. No further action needed on Task 9 before Task 10 begins.
