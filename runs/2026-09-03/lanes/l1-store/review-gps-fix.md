# Review: GPS-truncation ordering bugfix (l1-store, commit 5a79de0 on wave1-l1-store, atop 48c978a)

**Test command:** `cargo build -p idl-rs` then `cargo test -p idl-rs`
(run from `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`)

**Result:** build clean; `582 passed; 0 failed; 1 ignored` (up from 581 passed
at Task 4, +1 new test: `parse::records::tests::parse_gps_record_truncated_mid_record_keeps_gps_ts_in_sync_with_columns`).

**Regression-claim spot-check:** copied the worktree to a scratch dir, reverted
5a79de0 (restoring the old push-before-reads order), then re-applied only the
new test on top of the reverted code (keeping the fix's doc-comment reverted
too). Re-ran the single test: it fails exactly as the implementer claims —
`assertion 'left == right' failed / left: 2 / right: 1` at the
`assert_eq!(gps_ts.len(), 1)` line. This confirms the test genuinely exercises
the push-ordering bug and is not passing trivially.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Detail

1. **Spec compliance.** The diff does exactly what Task 4's review asked and
   nothing more: `gps_ts.push(device_ts_us)` (`core/src/parse/records.rs`) is
   moved from immediately after `device_ts_us` is read (before the seven
   fallible reads: `latitude`, `longitude`, `altitude`, `speed`, `heading`,
   `fix_quality`, `satellites`) to immediately after `satellites` is read and
   immediately before the eight `out.push`/`push_i32_at` calls — matching
   `parse_channel`'s (`core/src/parse/v3.rs`) established ordering (push the
   shared timestamp only once every fallible read for the record has
   succeeded). Doc comment on `parse_gps_record` updated to describe the new
   ordering and cites C1 §2's invariant; a second comment added at the push
   site. No unrelated lines touched (diff is 48 insertions / 3 deletions, all
   within `parse_gps_record` and its test module; `git show -w --stat` shows
   no whitespace-only churn elsewhere).

2. **Tests.** New test
   `parse_gps_record_truncated_mid_record_keeps_gps_ts_in_sync_with_columns`
   in `core/src/parse/records.rs`'s `#[cfg(test)] mod tests`:
   - Named as `thing — condition — result` per CLAUDE.md §4 (verbose but
     compliant: describes the record type, the truncation condition, and the
     invariant being held).
   - Arrange/Act/Assert with blank-line separation, matching repo convention.
   - Builds a real 32-byte GPS payload via the existing `test_buffers::gps_payload`
     helper for a first, complete fix, then a second payload truncated to 18
     bytes (`gps_epoch_ms`(8) + `device_ts_us`(8) + 2 of `latitude`'s 4 bytes) —
     genuinely mid-record, landing inside the first fallible field after the
     timestamp, which is the scenario the bug required.
   - Calls `parse_gps_record` twice against a single reader over the
     concatenated buffer: first call succeeds (`unwrap()`), second call is
     asserted to return `Err(ParseError::TruncatedRecord(_))`.
   - Confirmed via `ByteReader::i32` (`core/src/parse/reader.rs`) that reading
     4 bytes from a 2-byte remainder does bounds-check and return
     `TruncatedRecord` before any subsequent field or the `gps_ts`/column push
     is reached — so the second call's failure point is exactly where the old
     code's bug would show a mismatch.
   - Asserts `gps_ts.len() == 1` and, for every one of the 8 `GPS_*` columns
     via `acc.into_entries()`, `col.materialize().len() == gps_ts.len()`,
     which is the actual C1 §2 invariant under test, not just an incidental
     property.
   - Verified live (see above) that removing the fix (reverting to
     push-before-reads while keeping the new test) makes the test fail with
     `gps_ts.len() == 2`, i.e. the test is not vacuously true — it required
     the fix to pass. This corroborates the implementer's stated
     revert/rerun/restore verification.
   - Tests logic the repo owns (parser field/push ordering under truncation),
     not any dependency's internals.

3. **CLAUDE.md standing orders.**
   - Layer: change is entirely within `core/src/parse/records.rs`
     (`idl-rs` / `core` layer) — correct for parsing logic, no leakage into
     other layers.
   - Doc comments: `parse_gps_record`'s doc comment is a public symbol and is
     kept up to date with the new ordering; inline comment at the push site
     explains the invariant being protected, consistent with repo style
     elsewhere (`v3.rs`'s `channel_ts_us` comment referenced directly).
   - Typed exceptions: no new error paths introduced; existing
     `Result<(), ParseError>` / `ParseError::TruncatedRecord` typed error used
     throughout, no `Err(String)`.
   - No numeric-units concerns (no new numeric fields introduced).
   - No `TODO` comments added.

4. **Repo hygiene.** No AI attribution trailer in the commit message. No
   `cargo fmt` reformatting (diff is minimal and surgical). The shared
   `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` checkout remains
   clean and on `main` (unaffected, as expected — the change lives entirely
   in the worktree).

5. **Code quality.** No concerns. The fix is a minimal, correctly-scoped
   reordering; the new test is appropriately targeted and would not have
   passed under the pre-fix code (verified above).

## Verdict

CLEAN — the fix correctly reorders `gps_ts.push` to occur only after all
seven fallible GPS field reads succeed, matching `parse_channel`'s ordering
and restoring C1 §2's `t_us.len() == column.len()` invariant under mid-record
truncation; the new test genuinely exercises the truncation path (confirmed
to fail against the pre-fix ordering with the exact `2` vs `1` mismatch the
implementer described) and all 582 tests pass with a clean build; no scope
creep, no attribution trailer, no formatting churn, and the shared checkout
is untouched.
