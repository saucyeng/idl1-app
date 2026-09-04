# Review — Task 3: `Session`/`Channel` canonical model (C1 §2)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
Commit reviewed: `7b5da22` ("store: Session/Channel mandatory-time model (C1 §2)")
Parent: `9d4cd6a` (log shows `9d4cd6a`, not the `8f9c958` cited in the task brief — branch history
confirmed via `git log --oneline`; flagged as a naming/reference discrepancy only, not a content
defect — the diff reviewed is the single-file `core/src/session/mod.rs` change either way).
File touched: `core/src/session/mod.rs` only (confirmed via `git show --stat`).

## Test commands run

```
cargo build -p idl-rs 2>&1 | grep -c "^error"          → 56   (nonzero, as Task 3 Step 3 predicts —
                                                                  expected state, Task 4's job)
cargo test -p idl-rs session::mod::tests 2>&1           → "could not compile `idl-rs` (lib test)
                                                            due to 80 previous errors" (expected;
                                                            crate-wide ripple not yet fixed)
```
Per the task brief, a non-compiling crate after this commit is expected and is not a Task 3 defect.
No way exists to actually execute the new `duration_ms_uses_first_and_last_t_us_span` test in
isolation before Task 4 lands, so its arithmetic was verified by hand (below) instead.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/session/mod.rs:201-219` (`Channel::from_f64`) | This is a real code path that derives `t_us` from `nominal_rate_hz` (`t_us[i] = round(i * 1e6 / rate)`), which is the literal thing C1 §3.5 invariant 4 ("`nominal_rate_hz` never derives a sample's time, anywhere, on any code path") forbids. It is not a silent deviation, though: Task 3's own plan text (plan lines 505-522) writes this exact code and documents it in-line as a "scoped, documented exception... justified by these channels never reaching `data.parquet`", and it is tracked as Open Question #3 (plan line 5990), assigned to lead/L3, not yet ruled. Implementation matches the plan verbatim. | No fix needed from the implementer — flag for the lead to actually rule on Open Question #3 before wave-1 is called done, since as written the crate now contains one call site that is a byte-for-byte violation of a signed contract invariant, gated only by a plan-level comment. |
| Minor | Plan line 365 vs. Step 1 code (lines 372-502) | The plan's own "Interfaces → Produces" line for Task 3 lists `Channel { channel_id, t_us, nominal_rate_hz, column, source_kind, gaps }` — omitting `t_recorded_us` and `unit`, both of which Step 1's code block (and the committed diff) correctly include per C1 §2 post-R5. This is an inconsistency in the plan document itself, not in the implementation — the implementer correctly followed Step 1's code, not the abbreviated interface line. | Plan hygiene only; no action against this commit. Lead should tighten the interface line to match Step 1 next time the plan is touched. |

No Critical or Important findings.

## Spec-compliance detail (C1 §2, post-R5)

- `Channel.t_recorded_us: Option<Vec<i64>>` — present, correct type, doc comment present and
  explains the `None`-means-identical-to-`t_us` convention per C1 §2's R5 addition text. ✅.
- `Channel.unit: String` — present, correct type, doc comment present, matches C1 §2's R5 addition
  text (registry `units` field is the only existing source). ✅.
- `t_us: Vec<i64>` fully replaces the old `sample_times_secs: Option<Vec<f64>>`; no residual
  `sample_times_secs` field or reference left in this file. ✅.
- `sample_rate_hz` renamed to `nominal_rate_hz: f64`, doc comment states "metadata only, never
  used to derive a sample's time" per §3.5 invariant 4. ✅ (see Minor finding above re: the one
  `from_f64` exception).
- `Session.device_id`/`config_checksum` correctly changed to `Option<String>`; `source_format:
  SourceFormat` and `blob_sha256: String` correctly added; field types and doc comments match C1
  §2 verbatim. ✅.
- No code path in this file computes a sample's time from `i / nominal_rate_hz` used as an
  *imported/persisted* channel's time — the one exception (`from_f64`) is scoped to ephemeral,
  never-persisted derived channels and is explicitly flagged (see Minor finding above), matching
  Task 3's own plan text exactly.
- `GapSpan` unchanged in shape (only its doc comment updated to reference C1 §3.3's corrected-grid
  ordering) — correct per plan ("`GapSpan` stays").

## Test arithmetic check

`duration_ms_uses_first_and_last_t_us_span`: `Channel::from_f64("IMU0_AccelX", 800.0, vec![0.0; 800])`.
`from_f64`'s synthetic `t_us[i] = round(i * 1_000_000.0 / 800.0)`.
`t_us[0] = 0`. `t_us[799] = round(799 * 1_000_000 / 800) = round(998_750.0) = 998750` (exact
integer division, no rounding ambiguity). `duration_ms = round((998750 - 0) / 1000.0) =
round(998.75) = 999` (half-away-from-zero rounds up). Matches the asserted `assert_eq!(ms, 999)`
present in the diff at `core/src/session/mod.rs:387-396`. Arithmetic and code both confirmed
correct.

`duration_ms_event_driven_channel_uses_t_us_span`: `t_us = [500_000, 1_000_000, 1_300_000]`,
`(1_300_000 - 500_000) / 1000.0 = 800.0 → 800`. Matches `assert_eq!(ms, 800)`. Correct.

## Other checks

- **No AI attribution trailer** in the commit message (`git show -s --format=%B 7b5da22`
  confirmed: two lines, no `Co-Authored-By` or similar). ✅.
- **No `cargo fmt` reformatting**: only `core/src/session/mod.rs` touched (`git show --stat`);
  `git diff -w` line count (294) is within noise of the raw diff line count (292), i.e. no bulk
  whitespace-only churn consistent with a formatter pass. ✅.
- **Tests**: Arrange/Act/Assert with blank lines between, present in all 5 rewritten tests exactly
  as Step 2 specifies, verbatim match against the plan's code block. Test names follow this
  codebase's existing `snake_case_condition_result` convention (consistent with pre-existing tests
  elsewhere in the crate, e.g. `estimate/state.rs`, `workbook/read.rs`) — not a new deviation.
- **Doc comments / units**: every new/changed public field and function carries a doc comment;
  every numeric field's doc states its unit (µs, Hz, ms, UTC ms, hex chars). CLAUDE.md §5 satisfied
  for this file.
- **Typed exceptions**: no new fallible code introduced in this diff (struct/constructor-only
  change); N/A.
- Step 3's expected-failure check reproduced: `cargo build -p idl-rs` → 56 errors (nonzero, as
  predicted). Step 4's commit message matches the plan's specified text exactly.

## Verdict rationale

Task 3, as committed, is a field-for-field, verbatim implementation of its own plan Step 1/Step 2,
and that plan text is itself a correct rendering of C1 §2 (including the two R5-added fields). The
one place it technically brushes against a signed contract invariant (§3.5 invariant 4, via
`Channel::from_f64`) is pre-flagged by the plan as a scoped, documented, open question awaiting
lead sign-off — not a silent deviation introduced by the implementer. Nothing here blocks Task 4.
