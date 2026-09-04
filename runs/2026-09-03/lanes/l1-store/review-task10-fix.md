# Review — Task 10 fix-up: `store/derived.rs` metadata-loop + inputs-order fix

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`,
branch `wave1-l1-store`, commit `dae798d` (on top of `e001565`, Task 11 already
landed, no worktree conflict). File touched: `core/src/store/derived.rs` only.

## Test commands and results

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo test -p idl-rs store::derived
```
```
running 6 tests
test store::derived::tests::canonical_config_json_sorts_nested_object_keys ... ok
test store::derived::tests::derived_file_hash_is_order_independent_in_input_list_but_sorted_internally ... ok
test store::derived::tests::derived_input_hash_is_deterministic_and_sensitive_to_every_component ... ok
test store::derived::tests::write_derived_parquet_inputs_metadata_is_sorted_by_channel_id_regardless_of_call_order ... ok
test store::derived::tests::write_derived_parquet_writes_all_five_file_metadata_keys ... ok
test store::derived::tests::write_derived_parquet_same_hash_content_second_write_is_a_no_op ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 621 filtered out; finished in 0.56s
```
Reproduced, 6/6 pass (up from 4/4 at the original review — 2 new tests as claimed).

```
cargo test -p idl-rs -- --test-threads=1
```
First run: **1 failed** —
`store::atomic::tests::write_atomic_exhausts_rename_retries_and_surfaces_io_error_when_the_sharing_violation_outlasts_the_retry_window`
(625 passed; 1 failed; 1 ignored). Three subsequent re-runs (single-threaded):
626 passed; 0 failed; 1 ignored, each time. Re-running only that one test in
isolation also passes. This is the tracked flake (see below) — its failure
rate is lower single-threaded but evidently not zero; noting the recurrence
per instructions, not re-litigating it.

## 1. Spec compliance

Both findings from `review-task10.md` are fixed as described, matching the
already-fixed pattern in `store/parquet.rs` exactly (`rg -n
"set_key_value_metadata"` across `core/` shows exactly two call sites, one per
file, both building a single `Vec<KeyValue>` before one call — confirmed
myself, no `set_key_value_metadata`-in-a-loop pattern remains anywhere in the
crate).

- **Critical (metadata replace) — fixed.** `all_kv: Vec<KeyValue>` (lines
  208–217) collects all five entries — `derived_kind`, `inputs`, `config_json`,
  `engine_version`, `computed_at_utc_ms` — then `set_key_value_metadata` is
  called once (line 218). Verified genuinely, not just by reading the diff: ran
  `write_derived_parquet_writes_all_five_file_metadata_keys`, which opens the
  written file with a real `ParquetRecordBatchReaderBuilder`
  (`parquet::arrow::arrow_reader`), reads `builder.metadata().file_metadata()
  .key_value_metadata()`, and asserts all five key/value pairs individually
  against expected values (not just that the write call returned `Ok`). This
  is a genuine round-trip read, not a rubber-stamp test.
- **Important (inputs ordering) — fixed.** `inputs_json` (lines 187–195) now
  sorts a local copy of `inputs` by `channel_id` (`a.0.as_bytes().cmp(...)`) —
  the same comparator `derived_file_hash` uses internally — before building
  the JSON array, matching C1 §5's "same canonical order used to compute the
  file hash" requirement. Verified genuinely: the new test
  `write_derived_parquet_inputs_metadata_is_sorted_by_channel_id_regardless_of_call_order`
  passes `inputs` as `[("IMU0_GyroY", hb), ("IMU0_AccelX", ha)]` (deliberately
  out of order) and asserts the written `inputs` metadata string lists
  `IMU0_AccelX` before `IMU0_GyroY` — i.e. it reads back the actual written
  bytes and checks order, not just that write succeeded.

No scope creep: the diff touches only `write_derived_parquet`'s metadata
construction and adds two tests; the pure hash functions
(`derived_input_hash`, `derived_file_hash`, `canonical_config_json`), already
independently verified correct in the prior review, are untouched.

## 2. Tests

Both new tests are Arrange/Act/Assert with blank lines between sections,
named in the repo's existing `thing_condition_result`-style snake_case
convention (matching sibling tests like
`derived_input_hash_is_deterministic_and_sensitive_to_every_component`). Both
test logic this module owns (its own metadata-writing and ordering
invariants), not the `parquet`/`arrow` crates themselves. Both genuinely read
back file bytes via a real reader rather than trusting `Result::is_ok()`, as
verified above by reading the test bodies myself.

## 3. Flaky test — `store::atomic` — confirmed unrelated, already tracked

`git show dae798d --stat` shows only `core/src/store/derived.rs` changed;
`store/atomic.rs` is untouched by this diff, so the flake cannot originate
here. `runs/2026-09-03/decisions.md` (2026-09-03, "Tracked, non-blocking:
second flaky Windows timing test", lines 618–638) already documents this
exact test as a pre-existing Windows file-lock timing race in Task 7's work,
not introduced by Task 10, with an owner assigned ("whoever next touches
`store/atomic.rs`"). I saw the same flake recur once across four
single-threaded full-suite runs in this review session — noting it per
instructions, not reopening it since it is out of this diff's scope.

## 4. CLAUDE.md standing orders

- Layer: `core/src/store/`, pure, no Tauri/async/network — correct, unchanged
  from original review.
- Doc comments: the new/modified block (lines 182–186, 201–207) carries
  explanatory comments citing C1 §5 and the pinned `parquet` 59.3.0 source,
  consistent with the rest of the file's style; no new public symbols were
  added that lack doc comments.
- Typed errors: unchanged, still `DerivedStoreError`, no `Err(String)`.
- No AI attribution trailer: confirmed, `git log -1 --format="%(trailers)"
  dae798d` is empty.
- No `cargo fmt`: confirmed, diff is scoped to `core/src/store/derived.rs`
  only (124 lines changed in one file), no reflow elsewhere.
- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`:
  confirmed clean, on `main`.

## 5. Code quality (minor, non-blocking)

`inputs.to_vec()` is now sorted twice independently — once inside
`derived_file_hash` (line 90) and once in the local closure building
`inputs_json` (line 188) — both correct and consistent with each other, just
mildly redundant. Not worth blocking on; a future refactor could have
`derived_file_hash` return or accept the sorted order to share the work.

## Findings table

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/store/derived.rs:90` and `:188` | `inputs` is sorted independently twice (once inside `derived_file_hash`, once in `write_derived_parquet`'s `inputs_json` closure) — both correct but redundant | Optional: have `derived_file_hash` expose/reuse its sorted copy so both call sites share one sort |

No Critical or Important findings remain.

## Verdict

**CLEAN.** Both the Critical (metadata-replace) and Important (inputs
ordering) findings from `review-task10.md` are genuinely fixed, verified by
reading back real file bytes rather than trusting test names or the
implementer's description. `cargo test -p idl-rs store::derived` reproduces
6/6 pass. The full single-threaded suite is green except for the
already-tracked, pre-existing, out-of-scope `store::atomic` timing flake,
confirmed unrelated to this diff. No `set_key_value_metadata`-in-a-loop
pattern remains anywhere else in the crate (grepped myself). Repo hygiene
(no AI trailer, no `cargo fmt`, shared checkout clean on `main`) confirmed.

**Task 10 is now fully closed** — no outstanding Critical/Important findings
from either review round.
