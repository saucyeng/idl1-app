# Review: L1 Task 16 — Task-15 review fixes (Step 0), real-session ODR validation (Step 1), CHANGELOG/TASKS (Step 4)

**idl-rs worktree:** `idl-rs-worktrees\wave1-l1-store`, HEAD `57e4d6e`.
Commits reviewed: `2bf7a9f` (Step 0, parent `13363d6`) and `57e4d6e` (Step 1, parent `2bf7a9f`).

Files touched, `13363d6..57e4d6e`:
- `cli/src/main.rs`                           +11/−14 (`cmd_import` matches `ImportOutcome` instead of `ImportPlan`, `unreachable!()` gone)
- `core/src/store/import.rs`                  +62/−22 (parse-before-blob-write reorder; new `ImportOutcome` enum; `ImportReport.outcome` replaces `.plan`; new orphan-blob regression test; three existing tests updated to the new field)
- `core/src/store/parquet.rs`                 +32/−14 (new private `metadata_from_builder`; `read_session_metadata` and `read_session_parquet` both delegate to it — one footer parse per read)
- `core/tests/real_session_odr_validation.rs` +125 (new, Step 1)

**idl1-app worktree:** `idl1-app-worktrees\wave1-l1-store`, HEAD `ccd4127`.
Commit reviewed: `ccd4127` (parent `4e2643e`, the pre-existing `main`-merge commit).

Files touched, `4e2643e..ccd4127`:
- `CHANGELOG.md` +13
- `TASKS.md` +1/−1

`git status` in the idl1-app worktree shows ` M rust` (submodule pointer lag) — expected, not part of `ccd4127`, confirmed via `git show --stat ccd4127` (only `CHANGELOG.md`/`TASKS.md`).

## Test commands and results

```
cargo test -p idl-rs -- store::import store::parquet
```
→ `test result: ok. 19 passed; 0 failed; 0 ignored` (matches implementer's report exactly)

```powershell
$env:IDL_RS_REAL_SESSION_IDL0 = 'C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\d365a19ae7ef2dc2d087a5887371281f.idl0'
cargo test -p idl-rs --test real_session_odr_validation -- --nocapture
```
→ `test result: ok. 1 passed; 0 failed; 0 ignored`. Printed line:
```
real-session ODR validation: corrected=812.348 Hz, nominal=812.348 Hz, independent=814.017 Hz, relative_error=0.2051%, imu0 n=97927, count_in_window=96054, gps_span_s=118.000
```
Matches the implementer's reported 0.2051% exactly.

Both run exactly once, no `-j`, no reruns. Merge-gate command (`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`) **not** re-run per the compute rules; its scope verified against the implementer's reported counts by inspection (clip_reconstruct check below) plus the implementer's verbatim output, which it sent directly to me mid-review — quoted in full under Finding 6.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/tests/real_session_odr_validation.rs:33-39` vs `:49-50` | The GPS+IMU precondition check (`has_imu`) accepts *any* enabled IMU index (`idl_rs::parse::records::imu_index_of` matches `IMU0_`/`IMU1_`/`IMU2_` prefixes — the registry supports up to 3 IMUs, plausible for a multi-sensor-position device), but the code that follows unconditionally looks for `source_kind == "imu0"` and `.expect()`s it. A real session with, say, only `IMU1_*` channels enabled and no `IMU0_*` would pass the `has_imu` gate, fall through the SKIP branch, and then panic on the `.expect()` instead of cleanly skipping — technically satisfying the letter of "must not panic on a file lacking GPS/IMU" (IMU is present, just not index 0) but not the spirit. Not a new bug introduced by this task: the plan's own Step 1 draft code has the identical gap, and the actual supplied real file does have `IMU0_*` channels (as the passing run confirms), so this has zero practical effect on the file this test is gated to today. | Either narrow `has_imu`'s check to `c.source_kind == "imu0" && !c.is_empty()` so the precondition matches what the rest of the test actually requires, or pick whichever IMU index is actually present instead of hard-coding `imu0`. Low priority — only matters if a future real-session file swapped into this env var lacks IMU0 specifically. |

No Important or Critical findings.

## Verification against R19 / the review brief

1. **Blob-before-parse ordering (Step 0, Important fix from Task 15's review):** `import_idl0` now calls `crate::parse::parse(bytes)?` before `blob::write_blob(data_root, bytes)?` (`core/src/store/import.rs:178-183`), with a comment explaining why the reorder is free (the hash is computed from `bytes` directly). New test `import_idl0_bad_magic_bytes_fails_and_leaves_no_orphan_blob`: feeds `[0xDE, 0xAD, 0xBE, 0xEF]` (4 bytes — passes the `len < 4` check, fails the magic-byte check, so it correctly exercises `ParseError::InvalidMagicBytes`, not `TruncatedRecord`, verified by reading `parse::parse`'s magic-byte branch), asserts `Err(ImportError { kind: ImportErrorKind::ParseInvalidMagicBytes, .. })`, and independently derives the would-be blob path via `crate::store::atomic::sha256_hex(&bytes)` + `crate::store::blob::blob_exists` — confirmed this is the same hash function `blob::write_blob` itself calls (`blob.rs:66`), so the assertion is a real regression check (if the ordering bug were reintroduced, the blob would exist at exactly this path and the assertion would fail), not a vacuous "empty dir" check. `temp_root()` creates a fresh UUID-named temp directory per test, so there's no cross-test contamination that could make the assertion pass for the wrong reason. Verified correct.
2. **Minor (a) — single footer parse:** new private `metadata_from_builder(&ParquetRecordBatchReaderBuilder<File>)` extracts the nine C1 §4.3 keys from an already-open builder with no additional I/O. `read_session_metadata` opens the file, builds the reader, and delegates. `read_session_parquet` opens the file, builds the reader, calls `metadata_from_builder(&builder)`, then reuses the same `builder` for `.schema()`/`.build()`. Traced both call sites — each `read_session_parquet` call now parses the footer exactly once. Verified.
3. **Minor (b) — `ImportOutcome` replaces `unreachable!()`:** new `ImportOutcome { Written, Skipped, Regenerated }` (3 variants, `Copy`, each documented), `ImportReport.outcome: ImportOutcome` replaces `.plan: ImportPlan`. `ImportPlan` itself (4 variants, used only for planning) is unchanged — grepped, still has `Collision { existing_blob_sha256 }` and is used in `plan_import`'s signature and its own tests untouched. The CLI's `unreachable!()` arm for `ImportPlan::Collision` is gone; `cmd_import` now exhaustively matches `ImportOutcome`'s 3 variants — the impossible state is unrepresentable, matching the ruling's stated goal exactly. All three tests that referenced `report.plan` (`import_idl0_fresh_root_writes_parquet_and_session_json`, `import_idl0_same_bytes_twice_skips_and_leaves_session_json_untouched`, `import_idl0_stale_importer_version_regenerates`) updated to `report.outcome` with the equivalent `ImportOutcome` variant — same assertions, not weakened. Verified. Grepped `cli/src/main.rs` and `core/src/store/import.rs` for any lingering `.plan` or `ImportPlan::` in the CLI: none.
4. **Real-session ODR validation test (Step 1) against R19 items 1-3:**
   - Item 1 (env var, not a hard-coded path): path read from `IDL_RS_REAL_SESSION_IDL0` via `std::env::var`, both the "unset" and "set but not a file" cases print a skip notice that names the variable and return cleanly. Verified — matches the ruling exactly, and is a clean improvement over the plan's stale `CARGO_MANIFEST_DIR/../<file>` draft (which R19 item 1 states would silently resolve to nothing).
   - GPS+IMU precondition: `has_gps`/`has_imu` computed as in the plan's draft, missing either triggers the `SKIP + OPEN QUESTION` eprintln naming both booleans and returns — matches the plan's Step 1 text and R19's "no second copy of real session data" intent (does not fail the build). One gap in this precondition noted above (Minor).
   - Item 2 (corrected ODR from `t_us` span, not `nominal_rate_hz`): `corrected_hz = (imu0_n - 1) as f64 / ((imu0.t_us[imu0_n-1] - imu0.t_us[0]) as f64 / 1e6)`, computed directly from `imu0.t_us`, with `nominal_hz = imu0.nominal_rate_hz` printed alongside for reference only and never asserted on. Matches R19 item 2's text verbatim ("printed alongside for reference" / "the test should not depend on it"). In the actual run the two values are numerically identical to 3 decimals (812.348 both) — expected, since Task 6's wiring is documented to have already rewritten `nominal_rate_hz` to the corrected value; the test correctly does not rely on that being true.
   - Item 3 (independent estimate = IMU samples inside the GPS window, divided by `GPS_EpochMs` span): `count_in_window` filters `imu0.t_us` to `[gps.t_us[0], gps.t_us.last()]` (both in the shared session-wide `t0_us`-relative device-clock domain per C1 §3.1/§3.3 — confirmed `t_us` is defined relative to one session-wide `t0_us` shared by every channel, so this is a same-domain comparison, not a units mismatch), and `gps_span_s` is computed from `GPS_EpochMs` (the wall-clock channel, confirmed at `core/src/parse/records.rs:310` — `out.push("GPS_EpochMs", gps_epoch_ms as f64)`, the record's own wall-clock epoch-ms field) first/last, divided by 1000. `independent_hz = count_in_window / gps_span_s`. Matches R19 item 3 exactly.
   - 5% tolerance: `assert!(relative_error < 0.05, ...)` — unchanged from the plan, matches.
   - All outputs printed in one `println!`: corrected, nominal, independent, relative_error, imu0 n, count_in_window, gps_span_s. Verified, exceeds the brief's "all outputs printed" ask.
   - Compiles without the file present (no `#[cfg]` gate on file existence, purely a runtime `std::env::var`/`path.is_file()` check) and does not panic when the env var is unset — verified by reading the function; the standard `cargo test -p idl-rs -- store::import store::parquet` run above shows the `real_session_odr_validation` test binary compiles and links cleanly even though that filtered run doesn't execute the test itself.
   - **Arithmetic sanity check (my own numbers, from the printed line above):** `96054 / 118.000 = 814.017` Hz ✓ (matches printed `independent=814.017`). `(97927 − 1) / 812.348 = 97926 / 812.348 ≈ 120.55` s — plausible against a 118.000 s GPS window: `imu0 n=97927` total vs `count_in_window=96054` means 1,873 IMU samples fall outside the GPS fix window (before the first fix and/or after the last), i.e. IMU logging starts before / ends after GPS acquires its first/last fix, exactly the asymmetry R19 item 3 exists to correct for. The ~2.55 s implied by the span difference is consistent in order of magnitude with 1,873 samples at ~812 Hz (~2.3 s) — the numbers hang together, no red flags.
5. **CHANGELOG (Step 4):** the new bullet sits immediately after the L4 bullet under `## [Unreleased]` → `### Added` (`CHANGELOG.md:20-32`), matches the L4 bullet's bold-header-then-detail style, and covers everything R19 item 6 lists: unit-corrected lap-distance (explicitly calls out "the Dart fed ×1e7 coordinates into degree math"), the catalog overwrite swap, `verify` checks #1–5/#8/#10 with #6/#7/#9 named as deferred, import idempotency/regeneration/same-UUID-different-bytes collision refusal, both C4 amendments (`profiles/` and `settings.json` keys, each cited by section), and the ODR pass with its number (812.348 Hz vs. 814.017 Hz, 0.21% — matches the measured 0.2051%, correctly rounded). `TASKS.md` ticks exactly `- [x] L1 core \`store/\`` — verified nothing else in that file changed (`git diff` shows a single line flip). Nothing under `docs/` touched in either repo for this task's commits (checked via `git diff --stat -- docs` on both diff ranges: 0 files). The commit is `docs: L1 core store/ landed` — single line, no AI attribution trailer.
6. **Merge-gate scope:** not re-run per the compute rules. Verified two ways — (a) by inspection: the reported "1 ignored" is `core/src/clip_reconstruct.rs:986`, `#[ignore]` on `declip_tune_report` — read the surrounding doc comment ("Dev tuning loop. Not run in normal CI (ignored). Run with: `IDL0_DECLIP_EVENTS=...`"), confirmed pre-existing and untouched: `git log --oneline -1 -- core/src/clip_reconstruct.rs` shows its last change (`19548ba`, a docs-comment strip) predates every commit in this lane, and `git diff 8d6cb00..57e4d6e --stat -- core/src/clip_reconstruct.rs` (spanning this task plus the prior two) is empty — not something this lane ignored; (b) the implementer (`l1-task16`) sent me the run's verbatim output directly mid-review (it isn't written anywhere in either repo, by design — scratch smoke-test artifacts aren't committed):
   ```
        Running unittests src\lib.rs (target\debug\deps\idl_rs-9bdff8622d3d16fe.exe)
   test result: ok. 691 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 1.32s

        Running tests\real_session_odr_validation.rs (target\debug\deps\real_session_odr_validation-3542a53f7011d024.exe)
   running 1 test
   test real_session_burst_seam_correction_matches_an_independent_odr_estimate ... ok
   test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

        Running unittests src\main.rs (target\debug\deps\idl_rs-9bdff8622d3d16fe.exe)
   running 51 tests
   test result: ok. 51 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

      Doc-tests idl_rs
   running 0 tests
   test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   ```
   691 + 1 + 51 + 0 = 743, 0 failed, 1 ignored — matches the counts given in the review brief exactly, no FAILED/error lines, neither known-flaky test appears (so no rerun was needed, consistent with R19 item 4's "rerun that test alone by name once" never being triggered).
7. **Hygiene:** no reformatting of untouched lines in any of the three diffs (all changes are additive or directly load-bearing for the reorder/refactor being made); doc comments present on every new `pub` symbol (`ImportOutcome` and its three variants, `ImportReport.outcome`); no bare `unwrap()`/`expect()` on non-test production-path data (the integration test's `.expect()`/`.unwrap()` calls are all in test code, consistent with "integration test may `expect`"); errors stay typed (`ImportError`/`ImportErrorKind`, no `Err(String)` introduced); the new `import.rs` test is Arrange/Act/Assert with blank lines, named `thing — condition — result`; both idl-rs commit messages and the idl1-app commit message are single-line with no AI attribution trailers; idl1-app diff touches only `CHANGELOG.md`/`TASKS.md` (submodule `rust` pointer bump is a separate, unstaged working-tree change per Task 1's convention, not part of `ccd4127`).
8. **Beyond-brief changes:** nothing found in either repo beyond what Step 0/Step 1/Step 4 ask for. R19 item 5's CLI smoke test with the real file was in fact run — not in this review's assigned checklist, and correctly not committed anywhere (a temp-directory scratch run, `%TEMP%\idl-rs-task16-smoke`, deleted afterward), but the implementer supplied its verbatim output on request: fresh `import` writes and prints `imported ... -> .../data.parquet` plus a `catalog: 1 sessions, 1 blobs, 0 laps (0 skipped)` line; the identical second `import` correctly prints `already imported (skip): ...`; `sessions` lists the one session with `laps=0` and `0 catalog issue(s)`; `verify` reports `0 finding(s)`; `prune` (dry run) reports `0 candidate(s)`. All five exit 0. This closes the open question in my initial pass and is fully consistent with the round-trip/idempotency behaviour already verified in the unit tests above — no discrepancy.

## Verdict rationale

Both Task-15 fixes are correct and verified against the exact regression each was meant to close: the blob-before-parse reorder now has a test that would actually catch it coming back (independently re-derives the blob path rather than checking an empty directory), and the `ImportOutcome` split removes the panic-shaped `unreachable!()` entirely rather than just documenting it. The footer-parse dedup is a clean, minimal refactor with no behaviour change. The real-session ODR test implements all three of R19's corrections precisely (env-var location, span-derived corrected ODR, GPS-window-bounded independent estimate) and its printed numbers check out under independent recomputation — 0.2051% relative error, comfortably inside the 5% tolerance, on the actual session file. The merge-gate's verbatim output (743 passed, 0 failed, 1 pre-existing ignored) and the CLI smoke test's output (idempotent import, clean verify, correct sessions/prune) both check out. The CHANGELOG bullet is accurate to what landed and correctly placed; TASKS.md and commit hygiene are clean. The one finding (Minor) is a latent precondition/implementation mismatch in the ODR test's IMU-index handling that predates this task (present verbatim in the plan's own draft) and has no effect on the file this test is gated to today — worth a follow-up, not worth withholding a clean verdict. L1 is fit to merge.

VERDICT: CLEAN
