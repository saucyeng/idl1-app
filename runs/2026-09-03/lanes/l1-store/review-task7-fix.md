# Review: Task 7 fix-up — `store/atomic.rs` (C4 §4), wave1-l1-store

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`,
branch `wave1-l1-store`, commit `40de92e` on top of `7c7d1b7`. Addresses the two
Important findings in `runs/2026-09-03/lanes/l1-store/review-task7.md`.

**Test commands run (this review, independently):**
```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store
cargo build -p idl-rs
cargo test -p idl-rs store::atomic -- --test-threads=1     (x6)
cargo test -p idl-rs store::atomic                          (x4, default parallel threads)
```
**Result:** `cargo build -p idl-rs` clean, 0 warnings. All 10 test invocations
(6 serial + 4 parallel) reported `test result: ok. 8 passed; 0 failed; 0
ignored`. Test count is 8 (up from 4), confirming the implementer's claimed
count and, independently, no flakiness across 10 runs including the two new
Windows-only timing-based tests.

---

## Finding 1 (3-attempt retry bound) — FIXED, confirmed correct

`write_atomic_with_retry` (atomic.rs:147-174) wraps `write_atomic` in a
`for attempt in 1..=3` loop. Traced every branch by hand:

- `attempt=1` conflict → `attempt < 3` true → re-read target, `rederive`,
  loop to `attempt=2`.
- `attempt=2` conflict → re-read, `rederive`, loop to `attempt=3`.
- `attempt=3` conflict → `attempt < 3` is false → falls through to the
  catch-all `Err(e) => return Err(e)` arm.
- Any non-`RenameConflict` error, at any attempt, also falls to the same
  catch-all and returns immediately (matches the doc comment's "returned
  immediately, without consuming a retry").

Every arm of every iteration returns, so the loop can never fall through —
the `unreachable!()` after it is genuinely unreachable, and its rationale
comment for why is accurate. Total: **3 calls to `write_atomic`, 2
`rederive` calls** on sustained conflict. The two new non-Windows tests
assert exactly this (`rederive_calls == 1` for a single-conflict scenario,
`rederive_calls == 2` for a never-settling one) and both pass.

**Off-by-one check (the specific thing I was asked to re-verify):** C4 §4
step 4 says "Bound retries at 3 attempts before surfacing an error." Read in
isolation this is ambiguous between "3 total attempts" and "3 retries after
the first (4 total)." I resolved this against the sibling clause in the same
step-4/step-5 pair, already-implemented and already reviewed clean in
`review-task7.md`: step 5 says "retry the rename itself ... up to 5 times,"
and `rename_with_retry` implements that as `for attempt in 0..5` — 5 total
rename attempts, not 5 retries after an initial try (6 total). That
established convention, from the same author in the same file for
structurally identical wording ("retry ... N times" / "bound retries at N
attempts"), makes "3 total attempts" the consistent reading, and that is
what the code does. Not a new ambiguity worth blocking on; noting it below
as a documentation-only nice-to-have.

**Zero-existing-callers claim** — verified myself:
```
grep -rn "write_atomic\b" core/src --include=*.rs   (excluding atomic.rs itself) → no hits
grep -rn "write_atomic_with_retry\b" core/src --include=*.rs → only atomic.rs (doc comments + its own 2 tests)
```
`core/src/store/` contains only `atomic.rs` and `mod.rs` in this worktree —
`write_session_json`/`write_derived_parquet`/`write_track` (Tasks 8–13 in the
plan) don't exist as code yet, only as plan pseudocode. So the implementer's
claim is true, and there is no migration debt silently left behind: nothing
in the tree currently calls either function outside its own tests. The
retry-bound primitive now genuinely exists and is ready for Tasks 8–13 to
adopt; whether they do is those tasks' responsibility, not this one's — this
review's brief scoped the fix to `core/src/store/atomic.rs` only, and that's
what was touched (`git diff --stat` shows exactly one file).

## Finding 2 (untested Windows sharing-violation retry path) — FIXED, confirmed genuine

Both new `#[cfg(windows)]` tests (atomic.rs ~349-451) use
`std::fs::OpenOptions::share_mode(FILE_SHARE_READ)` (0x1, excluding
`FILE_SHARE_DELETE`) via `std::os::windows::fs::OpenOptionsExt` to open the
rename target — this is a real Win32 API call, not a mock/seam/stub. Holding
a handle without `FILE_SHARE_DELETE` on the destination is exactly the
condition that makes `MoveFileExW` (which `std::fs::rename` uses to replace
an existing file) fail with `ERROR_SHARING_VIOLATION`, matching C4 §4 step
5's own description of the failure mode. I confirmed this is a genuine OS
contention, not simulated: the second thread genuinely holds an open file
handle for a real duration (`std::thread::sleep` + `drop(lock)`), and the
main thread's `write_atomic` call genuinely goes through `rename_with_retry`
with no test-only branching or seam.

- **Retry-then-succeed test**: releases the lock at 120 ms, well inside the
  ~200-250 ms window `rename_with_retry`'s 5 attempts × ~50 ms backoff
  produces, and asserts `write_atomic` succeeds and the lock was released
  before it returned (ruling out a false pass from returning too early).
- **Retry-then-exhaust test**: holds the lock 500 ms, comfortably longer
  than the ~250 ms retry window, and asserts an `Io` error with `target`
  left unchanged at its pre-write content — matches C4 §4's "surfacing an
  error" and the no-silent-clobber guarantee.

Timing margins are generous in both directions (≥80 ms buffer on the
succeed case, ≥250 ms buffer on the exhaust case), which is consistent with
the observed 10/10 clean runs across serial and parallel test execution and
gives no reason to expect flakiness under normal CI load.

## Non-findings / other checks

- **`cargo build -p idl-rs`**: clean, no warnings.
- **Test count**: 8/8, up from 4/4 — matches the claim.
- **No AI attribution trailer** in commit `40de92e` — confirmed via
  `git show -s --format=%B`.
- **No `cargo fmt`**: `git diff --stat` shows only `core/src/store/atomic.rs`
  touched (212 insertions / 5 deletions), no unrelated file or formatting
  churn.
- **Shared checkout** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`:
  confirmed clean, on `main`, untouched by this review.
- **Doc-comment quotation of C4 §4 step 4** in `write_atomic_with_retry`'s
  doc comment is an accurate (ellipsis-elided) quote of the spec text I
  independently re-read.
- Original review's Minor finding (undocumented `kind`/`message` struct
  fields) was not addressed — expected, since only the two Important
  findings were in scope for this fix-up, and that finding was explicitly
  marked low-priority/follow-up in the original review.

## Findings table

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/store/atomic.rs:122-129`, `:187-206` | C4 §4's "bound retries/retry ... at/up to N" phrasing is inherently ambiguous between N total attempts and N retries-after-first; the fix's reading (N total) is correct by consistency with the already-accepted sibling rename-retry clause, but nothing in the spec or code says so explicitly. | Optional: add one clause to the doc comment noting "3 total calls to `write_atomic`, matching `rename_with_retry`'s N-total-attempts convention" so a future reader doesn't have to re-derive this by cross-referencing the sibling function. Not blocking. |

## Verdict

Both Important findings from `review-task7.md` are genuinely and correctly
fixed. The 3-attempt bound is implemented correctly (3 total attempts, not
4, verified by hand-tracing every loop branch and cross-checking against the
sibling rename-retry convention already accepted in this file). The
"zero existing callers" claim is true, independently verified by grep — no
migration debt was silently left behind, since Tasks 8-13 that would call
this don't exist as code yet in this worktree. The two new Windows tests are
genuine OS-level sharing-violation tests, not simulated, and were run 10
times (6 serial, 4 parallel) with zero failures, addressing the flakiness
concern the review brief specifically raised.

**VERDICT: CLEAN**

**Task 7 (with this fix) is fully closed** — no outstanding Important or
Critical findings remain against `core/src/store/atomic.rs`. The one
remaining item (Minor, doc-comment nice-to-have on the attempt-count
convention) does not block closure and can be picked up in a later sweep,
consistent with how the original review's Minor finding on struct-field doc
comments was already deferred.
