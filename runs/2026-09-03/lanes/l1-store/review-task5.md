# Review: Task 5 — Burst-seam correction (C1 §3.3)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`, branch
`wave1-l1-store`, commit `d7b2d94` on top of `5a79de0`.
File under review: `core/src/session/seam_correction.rs` (new), `core/src/session/mod.rs` (+1 line).

## Test commands and results (reproduced)

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo test -p idl-rs seam_correction
```
→ `test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 583 filtered out` — matches claim exactly.

```
cargo test -p idl-rs
```
→ `test result: ok. 587 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out` (unit) + 0 doc-tests — matches claim exactly.

## Worktree hygiene

- `git status --porcelain` in the worktree: clean, nothing to commit.
- No `REVERT_HEAD`, `MERGE_HEAD`, or `CHERRY_PICK_HEAD` in the real gitdir
  (`…/idl1-app/.git/modules/rust/worktrees/wave1-l1-store`) — the reported stray revert-in-progress
  is fully cleared, no residue.
- `git log --oneline -5`: `d7b2d94` sits directly on `5a79de0` (GPS fix) as expected, no stray merge/revert commits.
- Commit `d7b2d94` message: no AI attribution trailer.
- `cargo fmt -p idl-rs --check` shows diffs throughout the crate (expected — the crate is not
  rustfmt-formatted per CLAUDE.md §7) **including** 9 hunks inside `seam_correction.rs` itself,
  confirming the new file was hand-styled, not machine-formatted by `cargo fmt`.
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: clean, on `main`, no
  uncommitted changes.
- `git show --stat d7b2d94`: touches only `core/src/session/seam_correction.rs` (new) and
  `core/src/session/mod.rs` (+1 line, `pub mod seam_correction;`) — matches the plan's declared
  file list exactly, no scope creep.

## 1. Burst detection — hand-reproduced against the worked example

`nominal_period_us=1250`, stamps = 4 bursts of N=4 (96250…114400). Walking
`|stamps[i]-stamps[i-1]-1250| > 1`:
- within-burst deltas are exactly 1250 → no split.
- seam deltas (101050-100000=1050, 105850-104800=1050, 110650-109600=1050): `|1050-1250|=200 > 1` →
  split at each.

Result: bursts `[0-3],[4-7],[8-11],[12-15]`, `T_k = 100000/104800/109600/114400`, `N_k=4` for
all — exactly what the code's `detect_bursts` produces and exactly the contract's own worked
table. Confirmed by hand, independent of the test assertion.

## 2. Effective-period estimation — median, not mean, hand-verified exact

Estimates (k=1..3): `(104800-100000)/4=1200`, `(109600-104800)/4=1200`, `(114400-109600)/4=1200`.
Median of three identical values = 1200 — reproduces `effective_period_us=1200` exactly.

Also independently re-derived the even-count median test
(`even_number_of_burst_estimates_averages_the_two_middle_values`): bursts `[0,1],[2,3],[4,5]`,
`T_0=10000, T_1=12950, T_2=16000`; estimates `(12950-10000)/2=1475`, `(16000-12950)/2=1525`;
mean-of-two-middle = 1500 — matches the code's `median()` (sorts, averages the two middle values
for even `n`), confirming the "median not mean" requirement is genuinely exercised, not just
asserted.

Full worked-example re-space also hand-checked burst-by-burst
(`corrected[i] = T_k − offset_from_end × period`): every one of the 16 output values
(96400…114400) matches the contract's table exactly, including the monotonicity check at every
seam (100000→101200, 104800→106000, 109600→110800 all pass the `> T_{k-1}` guard so no fallback
fires anywhere in this fixture, correctly).

## 3. Monotonicity-guarantee fallback — fixture and trigger condition independently verified

Re-derived `a_burst_faster_than_the_session_median_falls_back_to_its_own_local_period` from the raw
stamps, not from the implementer's stated numbers:

- `detect_bursts` on `[0,2000, 6000,8000, 6300,8300]`, nominal 2000: seam deltas
  `6000-2000=4000` (Δ=2000>1) and `6300-8000=-1700` (Δ=3700>1) both split → 3 bursts of N=2,
  `T_0=2000, T_1=8000, T_2=8300`.
- Estimates: `(8000-2000)/2=3000`, `(8300-8000)/2=150`; median of `{150,3000}` (even) =
  `(150+3000)/2=1575` = `effective_period_us`. Matches.
- Burst 1 check: `T_1-(N_1-1)*1575 = 8000-1575 = 6425 > T_0=2000` → guard passes, no fallback,
  burst 1 uses 1575 → `corrected = [6425, 8000]`. Matches.
- Burst 2 check (the one that must fail to prove the fallback fires):
  `T_2-(N_2-1)*1575 = 8300-1575 = 6725`. Compare to `T_1=8000`: **6725 ≤ 8000**, so the guard fails
  and the fallback must trigger — verified by hand, not asserted on faith.
  - **Without the fallback**, burst 2's first corrected sample would be 6725, which is *less than*
    burst 1's last corrected sample (8000) — a decreasing step, i.e. a genuine monotonicity
    violation at that seam. This confirms the fixture actually exercises the branch, not a
    coincidence of the check alone.
  - Local period: `round((8300-8000)/2) = round(150) = 150` → burst 2 = `[8300-150, 8300] =
    [8150, 8300]`.
- Final `corrected_us = [425, 2000, 6425, 8000, 8150, 8300]` (burst 0 also hand-checked:
  `T_0-1*1575=2000-1575=425`) — matches the code's output and the task brief's stated numbers
  exactly. `effective_period_us=1575`, no warnings (both 1575 and 150 are positive) — also
  confirmed by hand.
- The code's actual trigger condition, read from source (`seam_correction.rs:176`):
  `if t_k - (n_k - 1) * period <= t_km1` — this is the literal negation of C1 §3.3's stated guard
  (`T_k − (N_k−1)×effective_period_us > T_{k−1}`), i.e. fires exactly when the guard fails. Matches
  spec text verbatim, and is the condition actually evaluated in this fixture (confirmed above).

This is a well-constructed fixture: it is the only test exercising the fallback branch, and the
implementer's in-line derivation comment (lines 298-316) is itself correct and independently
reproducible — checked line by line above.

## 4. `ImportWarning` / `ParseResult` extension

The plan explicitly scopes `ParseResult`'s `Vec<ImportWarning>` extension (Open Question 7,
plan line 6005) to **Task 6 Step 3**, not Task 5 — Task 5's own Step 3 code block
(plan lines 1609-1634) contains the exact in-line comment: "ImportWarning surfacing: attach to
ParseResult in a future pass... implementers must thread seam.warnings into `truncation` or a new
ParseResult field **before this task is done**" referring to Task 6, not Task 5. Task 5's own
Interfaces section only promises `correct_burst_seams(...) -> SeamCorrection { ..., warnings }` —
which is exactly what shipped. `git show --stat d7b2d94` confirms no `ParseResult`/parser files were
touched in this commit, consistent with the plan's scoping.

**Not a Task 5 defect** — warnings are correctly generated and returned by the function (never
dropped inside this module); wiring them into `ParseResult` is legitimately out of this task's
scope and is tracked as a named, assigned open item for Task 6. Flagging here only so the Task 6
review checks it lands.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/session/seam_correction.rs:12-13` | `pub const SEAM_CORRECTION_VERSION` has no `///` doc comment directly on the item — only the module-level `//!` doc above it mentions the version informally (CLAUDE.md §5: "doc comment on every public symbol"). | Add a one-line `/// Algorithm version tag for §3.3's correction, stored in data.parquet metadata (§4.3).` directly above the const. |

No Critical or Important findings. Arithmetic in the worked example, the median estimator, and the
fallback fixture was independently reproduced by hand and matches both the contract text (C1 §3.3)
and the code's actual output; the code was read line-by-line against the spec's stated formulas
(burst detection, median-of-estimates, re-spacing formula, monotonicity guard) and matches exactly,
including the sign convention (`<=` in code vs. `>` in spec's "guard holds" framing — verified to be
the correct negation, not an off-by-something).

## Verdict

CLEAN — this task's algorithm is spec-correct (verified by hand, not by trusting the implementer's
numbers), tests are well-constructed AAA with a genuinely exercised fallback branch, the worktree
hygiene issue was fully resolved with no residue, and the ParseResult/ImportWarning wiring is
correctly deferred to Task 6 per the plan's own scoping, not a silent omission. One Minor doc-comment
nit only.
