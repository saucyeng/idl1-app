# Review — L1 Task 6 (burst correction wired into ImuGridPlan; C1 §3.3, ruled; time_map C1 §3.4)

Worktree: `idl-rs-worktrees\wave1-l1-store`, branch `wave1-l1-store`, commit `df80120`
(on top of Task 5's `d7b2d94`).

**Test command and result (reproduced):**

```
cd idl-rs-worktrees/wave1-l1-store
cargo build -p idl-rs        → Finished, no warnings/errors
cargo test -p idl-rs         → test result: ok. 593 passed; 0 failed; 1 ignored; 0 measured
```

Matches the number cited in the task brief exactly.

Shared checkout `idl1-app\rust`: `git status` clean, `On branch main`. Confirmed.

Commit message `df80120`: no `Co-Authored-By` / AI attribution trailer. Confirmed.

`cargo fmt` was not run: diff hunks preserve the repo's existing hand-formatted
style (long argument lists kept on one line where the surrounding code already
did that, no wholesale re-wrapping). Confirmed by inspection of the full diff.

## Priority 1 — R12 fixture-widening arithmetic, independently reproduced

Recomputed `detect_bursts`/estimate arithmetic by hand from the actual raw
timestamp literals in each widened test (not just trusting the comments):

**`single_imu_drop_is_linearly_filled_and_recorded`** — 13 raw stamps split
into 11 bursts by `detect_bursts` (±1 µs tolerance around nominal 1000 µs
means every ±2 µs jitter sample becomes its own single-sample burst, as
intended). 10 burst-to-burst estimates: `[1500, 998,998,998,998,998,
1002,1002,1002,1002]`. Sorted, the middle two (index 4,5 of 10) are `998` and
`1002` → median `(998+1002)/2 = 1000` exactly nominal, clear of the drop's own
`1500`. Verified independently — matches the implementer's claimed arithmetic.
`effective_period_us` therefore resolves to 1000 (no fallback/warning path
triggered — checked the per-burst monotonicity guard, never trips here).
Re-derived the gap-detection loop by hand: only one `(k=2, missing=1)` gap is
produced, at the drop's own position — same `GapSpan { start: 2, len: 1 }`
the test asserts, verified as a consequence of the correct median (not a
coincidence of the added samples happening not to interfere).

**`two_imus_with_different_drops_align_a_shared_spike_to_the_same_slot`** —
IMU0's 14 raw stamps split into 11 bursts; estimates
`[1333.33, 998×5, 1002×4]`; median = `(998+1002)/2 = 1000`. Verified by hand,
matches. IMU1 (no drops) forms one burst end-to-end → zero estimates → falls
back to nominal (1000), exactly matching IMU0's corrected period, so the
shared-spike-same-slot assertion is meaningful and not accidentally true.

**`all_imu_channels_report_the_single_nominal_rate_despite_different_drops`**
— structurally identical IMU0/IMU1 streams to the test above (same
timestamps, zero-valued payload) — same arithmetic applies; not re-derived
digit-by-digit given the structural identity, but spot-checked the raw stamp
literals against the shared-spike test's IMU0/IMU1 sequences and found them
byte-for-byte the same (minus the spike payload), so the median result
carries over.

All three tests' *original* assertions — the drop is still detected as a
`GapSpan` and linearly filled, not silently absorbed into a re-spaced grid —
are unchanged in the diff (only fixture data was appended, plus updated
`.len()`/`.materialize()` expectations for the added samples) and pass for
the reason the ruling intends: the median genuinely lands on nominal with the
drop's skewed estimate as a clear outlier, not because of some other
coincidental cancellation. R12's fix is verified correct, not just
test-green.

## Priority 2 — Task 6 deliverables, verified end to end

1. **Gap detection runs on the corrected axis.** `parse_v3` (`v3.rs`) now
   calls `seam_correction::correct_burst_seams` per IMU (≥2 samples) before
   constructing the plan, then `ImuGridPlan::build_from_corrected(corrected,
   effective_period_us, period_us)` — confirmed at the call site, and
   confirmed no remaining callers of the old `ImuGridPlan::build`/
   `imu_gaps`/`last_abs_slot` machinery anywhere in the worktree (grepped).
   The hot loop (`parse_imu`) is reduced to the monotonic-guard-only shape
   Step 1 specifies; gap/slot computation happens once, after the full
   stream is read, exactly per C1 §3.3's ruled ordering.

2. **`ParseResult.import_warnings` threads end to end**, not just declared.
   Traced the full chain: `correct_burst_seams` → `SeamCorrection.warnings`
   → `parse_v3` tags each with its source IMU and collects into
   `import_warnings: Vec<ImportWarning>` → `ParseResult.import_warnings` (new
   field, `session/mod.rs`) → `SessionHandle::from_bytes` maps
   `.message` into `SessionHandle.import_warnings: Vec<String>` → exposed via
   `SessionHandle.meta()` into `SessionMeta.import_warnings`. The GPX path
   (`SessionHandle::from_channels`) explicitly sets `Vec::new()` with a
   comment explaining why (no burst structure). All call sites that
   construct `ParseResult`/`SessionMeta` literals were updated (build
   succeeded, no missing-field compile errors) including the test fixture in
   `export/mod.rs`. Confirmed genuinely threaded, not just a field that
   exists and is dropped somewhere in the chain.

3. **Open Question 5 (0-sentinel) resolved as reported.**
   `rebuild_i64_grid_or_real` was rewritten to track `is_real: Vec<bool>` in
   parallel with the output array rather than using `0` as a placeholder
   sentinel — exactly the "cleaner parallel-array walk" the plan's Open
   Questions text suggested as the preferred fix. The regression test
   `rebuild_i64_grid_or_real_fills_a_gap_even_when_the_first_real_stamp_is_
   exactly_zero` was checked against the *old* sentinel logic by hand: the
   old code's global guard `corrected.first() != Some(&0)` disables the
   entire overwrite pass whenever the first corrected stamp is exactly `0`
   — with `corrected = [0, 1000, 3000]` the old code would leave the gap-fill
   slot at the raw placeholder `0` instead of the grid's `2000`, producing
   `[0, 1000, 0, 3000]` against the test's asserted `[0, 1000, 2000, 3000]`.
   The new `is_real`-tracking code passes. This is a real regression test
   that would have caught the described bug, not a test that happens to
   pass under both implementations.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/parse/records.rs:203` (`reconcile`'s `other => (other, t_us, t_recorded_us, self.spans[i].clone())`) | Silent deviation from the plan's own draft code, which specified `Vec::new()` for this arm (a reconciled IMU whose column is somehow not `RawColumn::I16`) — the implementer instead returns `self.spans[i].clone()`. Currently dead in practice (comment confirms IMU axes are always `I16` on the parse path) so no observed behavioural difference, but it is an unflagged departure from the plan text in a place CLAUDE.md's ambiguity policy says should have been called out rather than silently changed. | Either match the plan's literal `Vec::new()` or add a one-line comment noting the deliberate improvement and why it's safe (dead-arm today, but correct if the invariant ever changes). |
| Minor | `core/src/session/time_map.rs:8-13` (`utc_ms_to_t_us` doc comment) | Doc comment says `round((utc_ms - first_utc_ms) * 1000)`, but the implementation is pure integer arithmetic with no rounding step (`(utc_ms - first_utc_ms) * 1000`) — harmless today (integer × integer is always exact, so "round" is a no-op), but the doc text implies a floating-point rounding operation that doesn't exist in the code, which could mislead a future reader who changes the signature to take a float. | Drop "round(...)" from the doc comment, or note explicitly that the multiplication is exact for integer inputs so no rounding is needed. |

No Critical or Important findings. Priority 1's arithmetic checks out exactly
as claimed; Priority 2's three deliverables are genuinely wired end to end,
not just present as unused fields; build is clean; tests reproduce at
593/0/1; no repo-hygiene violations found.

## Verdict

CLEAN — Task 6 is implemented as specified, the R12 fixture fix demonstrably
fixes the root cause (verified by hand-reproducing the median arithmetic, not
just trusting the commit message), and all three of the task's flagged
deliverables (corrected-grid gap detection, `import_warnings` threading, the
0-sentinel fix with a regression test that would have caught the original
bug) are real. Only two Minor, non-blocking documentation/consistency notes.
