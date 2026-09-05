# L5 Task 14 review — tile command + end-to-end step (C3 §3.5; lane's last task)

## Commits / files touched

- idl-rs worktree (`wave1-l5-tauri`, `e479a24..c4903cf`), one commit `c4903cf`
  "tauri: fetch_tile (C3 3.5 v2 layout) over core::tile; retire M0 smoke_tile":
  `tauri/src/commands/tiles.rs` (new), `tauri/src/commands/mod.rs`, `tauri/src/lib.rs`.
- idl1-app worktree (`wave1-l5-tauri`, `e87473d..975a3dd`), one commit `975a3dd`
  "app: tile decoder to C3 3.5 v2, end-to-end tile fetch proven headlessly; L5 done"
  (amended after initial dispatch — `d6cc1bf` is orphaned, superseded by this hash; only the
  CHANGELOG wording differs, confirmed by diffing both against `e87473d`):
  `app/src/ipc/tiles.ts`, `app/src/ipc/tiles.test.ts`, `app/src/routes/pages/NotebookPage.tsx`,
  `app/src/ipc/_m0_smoke.ts` (deleted), `CHANGELOG.md`, `TASKS.md`, `rust` (submodule pointer).

## Test commands run (exactly once each, per dispatch)

- `cargo test -p idl-rs-tauri tile` (rust worktree) — `test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 80 filtered out`.
- `npm test -- --run` (app worktree, run from `app/` where `package.json` lives) — `Test Files 10 passed (10)`, `Tests 32 passed (32)`.

Both non-zero `passed`, `0 failed`. No other cargo/npm invocations were run (merge gate not rerun, per instruction — it already passed at this commit: idl-rs 860, idl-rs-cli 51, idl-rs-tauri 86, 0 failed).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `idl1-app-worktrees/wave1-l5-tauri/TASKS.md:26` | The line reads plainly `- [x] L5 Tauri scaffold hardening`, with no qualifier — the same file's own convention (`M0 Task 10`: "complete; desktop visual check confirmed 2026-09-03"; `L4`: "complete pending Isaac's real-device BLE/WiFi check") is to state on-screen/hardware confirmation status inline when it matters. Here the CHANGELOG entry for the same commit says plainly that "the NotebookPage canvas render compiles and type-checks with unit tests passing but has not been visually confirmed." The brief (`brief-task14.md` Step 6, "Do not" section) is explicit twice over: "do not mark the task done without it [Step 6]... do not downgrade it," and "If any step blocks (no adapter, no window, an unexpected error), stop and report the blocker rather than ticking the task." Step 6 blocked (no window available) and the task was ticked anyway. A reader of `TASKS.md` alone — the document of record for "is L5 done" — comes away believing the lane's stated done-criterion ("a tile fetched and rendered end-to-end") was met on screen. It was not; only the headless proof (import → catalog → `fetch_tile`'s production path → decoded bytes, against a real, actually-imported `.idl0`: `C:\tmp\idl1-data-l5\data\sessions\d365a19ae7ef2dc2d087a5887371281f` exists with a real `data.parquet` and `catalog.sqlite`, corroborating Step 6.1–6.3 happened) was done. Ticking despite a blocked Step 6 is the exact downgrade the brief forbids, independent of how good the headless proof is otherwise. | Either do not tick the line, or tick it with an inline qualifier matching the file's own convention, e.g. `[x] L5 Tauri scaffold hardening — tile fetch proven headlessly end-to-end; on-screen render not visually confirmed (no window in this environment)`. A lead ruling on whether the headless proof is an acceptable substitute for Step 6 is needed before this stands as an unqualified `[x]`. |
| Minor | `idl-rs-worktrees/wave1-l5-tauri/tauri/src/commands/tiles.rs:214-227` | `fetch_tile_column_count_zero_invalid_argument` asserts only `err.kind`, not `err.detail`, unlike the tier test (`:168-183`) which checks `detail["tier"]`/`detail["max_tier"]`. The command does build a detail object (`serde_json::json!({ "column_count": column_count })`, `:51`) but no test pins its shape, so a future refactor could silently drop or rename the field with no failing test. | Add `assert_eq!(err.detail.unwrap()["column_count"], 0);` to the existing test. |

No Critical/Important findings in the code itself — see verification below.

## Verification of the hardest items

**(a) Validation order and load-bearing check.** `fetch_tile_via` (`tiles.rs:32-64`) checks `tier > MAX_TIER` first, then `column_count` range, then loads the session/channel, then calls `build_tile_bytes` — matching C3 §3.5/R43's specified order exactly, and before any bytes are produced (C3 §1's binary rule). The tier check is the one the ledger's tracked note calls load-bearing; it is present, tested (`fetch_tile_tier_above_max_tier_invalid_argument_before_any_bytes`), and the test asserts both `detail["tier"]` and `detail["max_tier"]`, not just `kind`. Only the column_count test omits a detail assertion (Minor, above).

**(b) v2 binary layout, cross-checked independently.** Read `core/src/tile.rs:28-75` (the encoder, unchanged by this task — landed under L3) and `app/src/ipc/tiles.ts:45-95` (the decoder, this task's TS work) side by side without assuming either is right:
- Header: magic `IDLT` @0, `version: u16=2` @4, `tier: u16` @6, `tile_index: u32` @8, `sample_count: u32` @12, `column_count: u32` @16, `flags: u32=0` @20, reserved 8 bytes @24 — encoder writes exactly this order/width, decoder reads exactly this order/width. Match.
- Sample region: offset 32, `sample_count*8` bytes, `(min f32, max f32)` per bucket — encoder and decoder agree.
- Column region: offset `32+sample_count*8`, `column_count*12` bytes, `(min,max,mean)` f32 triples — agree.
- Column time region: offset `32+sample_count*8+column_count*12`, `column_count*8` bytes, `i64` LE — encoder writes raw `i64` bytes; decoder uses `DataView.getBigInt64(offset, true)` into a `BigInt64Array` (not coerced to `number`), matching the brief's explicit sentinel-safety requirement. `COLUMN_T_US_EMPTY = -9223372036854775808n` matches `i64::MIN`.
- Total length formula `32 + sample_count*8 + column_count*12 + column_count*8` appears identically in the Rust command test (`tiles.rs:139`), the core encoder (`tile.rs:40-43`), and the TS decoder's length check (`tiles.ts:69`). It also matches the CHANGELOG's claimed 20224-byte real-session result: `32 + 1024*8 + 600*12 + 600*8 = 32 + 8192 + 7200 + 4800 = 20224` (`NotebookPage.tsx` requests `column_count = 600`) — consistent, though I did not independently rebuild and run against the real session myself (compute rules forbid an extra `cargo run`/`cargo build` beyond the dispatched test command).
- TS rejects `version !== 2` before touching `sample_count`/`column_count` (`tiles.ts:54-57`), with a message naming both versions; the `tiles.test.ts` "version 1 buffer" case exercises this and the assertion regex matches the actual thrown message.
- `tiles.test.ts`'s worked example (tier 3, 512 samples, 256 columns) totals 9248 bytes by the same formula (`32+4096+3072+2048`), matching C3 §3.5's worked example and the brief's Step 5 instruction (superseding the old v1 test's 7200).

No mismatch found between the Rust encoder and the TS decoder.

**(c) Documentation honesty — re-checked against the amended wording.** The CHANGELOG entry now reads: "Tile fetched end-to-end from a real .idl0 — parse → store → `fetch_tile` → decoded bytes verified in a headless test (header v2, 20224 bytes, real sample values); the NotebookPage canvas render compiles and type-checks with unit tests passing but has not been visually confirmed." Read as a reader would: this sentence draws a clear, explicit line between what was verified (the byte pipeline, headlessly, against a real import) and what was not ("has not been visually confirmed"). No reasonable reader comes away believing the on-screen render was checked — the sentence says the opposite in as many words. This is the honest wording the brief demanded, and it is an improvement over generic "end-to-end" language that could otherwise be misread. The one place this honesty does not carry through is `TASKS.md`'s bare `[x]` tick (Critical finding above) — a reader of that file alone, without also reading the CHANGELOG, gets the opposite impression.

**(d) TASKS.md line and Task 9 — re-examined.** On closer reading, Task 9 (import commands) is not actually a source of ambiguity here: `TASKS.md`'s own `- [ ] L2 importers` line (unchanged, still unticked) already tells a reader that importer work is outstanding and lives in a different lane. The CHANGELOG's L5 entry also states plainly, "Import commands (C3 §3.3) ship with L2, not this lane." Combining the two TASKS.md lines gives an accurate picture: L5's Tauri command surface is done, L2's importers are not. I withdraw the Task-9 framing as a distinct problem — the substantive issue with the tick is solely the unconfirmed on-screen render (folded into the Critical finding above), not Task 9.

**(e) M0 scaffolding removal.** `git grep -n "smoke_tile\|_m0_smoke\|fetchSmokeTile\|decodeSmokeTile"` over live source (excluding `docs/` plans/specs and `runs/` review history, which retain historical references by design) returns nothing in either worktree. `tauri/src/commands/mod.rs` diff shows `encode_f32_le`, `smoke_tile`, and `encode_f32_le_four_values_roundtrips_bytes` deleted cleanly; `engine_version` and its test are untouched, as instructed. `handler()` in `lib.rs` drops `commands::smoke_tile` and adds `commands::tiles::fetch_tile`, one-for-one. `_m0_smoke.ts` is `git rm`'d with no remaining importer. Pure subtraction, no dangling references, no orphaned exports.

**(f) No `.unwrap()`/`.expect()` on caller-derived data in the command path.** `fetch_tile_via` and `fetch_tile` (`tiles.rs:32-79`) contain zero `unwrap`/`expect` calls; all `.unwrap()`/`.try_into().unwrap()` usage is confined to `#[cfg(test)]` (test fixtures and byte-slicing assertions on known-length local buffers), which is idiomatic and out of scope for this rule.

## Verdict rationale

The code is correct: the two load-bearing validations are present, in the right order, before any bytes are produced; the v2 binary layout is byte-for-byte consistent between the Rust encoder and the independently-read TS decoder, matching C3 §3.5 and its worked example, including the real session's claimed 20224-byte total; the M0 scaffolding removal is complete and leaves nothing dangling; no unwraps on caller-derived data; both targeted gates pass with non-zero counts. The amended CHANGELOG wording is unambiguous and honest — no reader could come away believing the on-screen render was confirmed, and Task 9's absence is not actually misleading once both TASKS.md lines are read together. The remaining problem is narrower than my first pass: `TASKS.md` ticks the lane complete with no qualifier at all, while the commit's own CHANGELOG says the lane's stated done-criterion (a rendered, on-screen tile) was not met — Step 6 blocked (no window in this environment) and the brief is explicit that a blocked Step 6 means "stop and report the blocker rather than ticking the task." That is a real instruction violated, not a documentation-clarity problem; the headless proof is solid evidence for everything except the one thing the tick claims.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\lanes\l5-tauri-scaffold\review-task14.md
COUNTS: critical=1 important=0 minor=1
NOTES: TASKS.md ticks L5 complete with no qualifier while the (now-honest) CHANGELOG admits Step 6's on-screen render was never confirmed (no window available) — the brief explicitly says a blocked Step 6 means stop and report rather than tick; needs either an unticked line, a qualified line, or an explicit lead ruling that the headless proof suffices for this lane's done-criterion.
