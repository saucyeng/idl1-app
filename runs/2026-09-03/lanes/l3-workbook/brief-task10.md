# L3 Task 10 — implementer brief (tile endpoint, v2 layout; C3 §3.5)

You are the implementer for L3 Task 10 of the idl1 rewrite — the tenth task
of the core workbook-v3 lane, and the first of this batch (Tasks 10–16).
TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 9 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 10` (649–743, **superseded where it conflicts with
  the v2 layout below**); contract C3
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c3-ipc-surface.md`
  §3.5 (565–653 — this is the **amended, landed v2 text**: three regions, header `version:
  u16 = 2`, `MAX_TIER`, the column-time region's byte formula and worked example); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 10 section (G10.1–G10.7,
  L3-R28/R30 — **L3-R29 is superseded**, ignore its "index-space v1" text); ledger `R25` in
  `runs\2026-09-03\decisions.md` ("tile layout v2 decided now, not deferred" — this is the
  authority, not the pre-read's provisional v1 fallback); landed `chart_decimation.rs`
  (`TIER_BASE: u32 = 8` line 7, `TILE_SIZE_BUCKETS: u32 = 1024` line 10, `decimate_tile_pure`
  line 22, `decimate_channel` line 66 with the unguarded `TIER_BASE.pow(tier)` at line 67 —
  this is one of G10.2's two overflow sites); landed `session/handle.rs` (`decimate_tile`
  586–615, the unguarded `TIER_BASE.pow(tier)` at line 595 — the other overflow site; the
  existing precedent test `decimate_tile_matches_pure_fold_over_materialized_samples`,
  1272–1312, which already proves `SessionHandle::decimate_tile` agrees with
  `chart_decimation::decimate_channel` for the sample region — the pattern Step 4 below extends).

## COMPUTE RULES — non-negotiable
Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not override). The plan's own
gate (`cargo test -p idl-rs "tile|column_stats"`) matches **zero** tests — libtest filters are
substrings, not regexes (G10.1, L3-R8: a filter matching nothing is a failed gate, not a pass).
Run these three instead, each asserting non-zero `passed`: `cargo test -p idl-rs
chart_decimation`, `cargo test -p idl-rs tile::`, `cargo test -p idl-rs session::handle`
(the last because `decimate_tile` gets the overflow guard plus a new cross-check test). No
`cargo check -p idl-rs-cli --tests` required — `column_stats`, `column_times_us`, `MAX_TIER`,
`build_tile_bytes` are additive `pub` symbols and `SessionHandle::decimate_tile`'s signature is
unchanged. No tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One cargo process at a
time, foreground.

## The task (plan Task 10, Steps 1–5) with these rulings

**Ruling — L3-R28 (ledger R25, cross-lane authorisation).** `chart_decimation.rs` gains
`pub const MAX_TIER: u32 = 10;` (largest `k` with `TIER_BASE.pow(k) <= u32::MAX`), doc-commented
as C3 §3.5's "engine's configured range." `decimate_channel` (`chart_decimation.rs:67`) and
`SessionHandle::decimate_tile` (`handle.rs:595`) both switch `TIER_BASE.pow(tier)` to
`TIER_BASE.checked_pow(tier).unwrap_or(u32::MAX)` — a too-large tier becomes an all-NaN tile,
never a panic. `handle.rs` is landed L1 code; **this edit is authorised for L3 under R25**, same
form as R23 gave L2 for `parquet.rs`/`synthesis.rs` — edit only the `TIER_BASE.pow` call sites
named above, nothing else in that file. Tests: `chart_decimation::decimate_channel — tier above
MAX_TIER — all-NaN tile, no panic`; `MAX_TIER is the largest tier TIER_BASE.pow does not
overflow` (assert `TIER_BASE.checked_pow(MAX_TIER).is_some()` and
`TIER_BASE.checked_pow(MAX_TIER + 1).is_none()`); one `session::handle` test, `decimate_tile —
tier above MAX_TIER — all-NaN tile, no panic`.

**Ruling — L3-R30.** Open Question 4 (column span) is closed as the plan states it: a tile's own
sample range (`tile_index * TILE_SIZE_BUCKETS * bucket_size(tier) .. + TILE_SIZE_BUCKETS *
bucket_size(tier)`), subdivided into `column_count` equal-width slices. Open Question 5 (the
worked-example "512 samples" vs. the fixed-1024 `decimate_channel`) is closed as **not a real
inconsistency** — delete the plan's "real inconsistency… do not silently paper over it"
paragraph and the hypothetical-512 narrative entirely. Keep only the cheap pure-arithmetic test
of the offset formula (parameterised on a hypothetical `sample_count = 512`, never calling
`build_tile_bytes`) plus the real-output-length test against the actual fixed `sample_count =
1024`. `column_count == 0` is legal: `column_stats` and the new `column_times_us` (below) both
return an empty `Vec`, tested; the tile's column region and column-time region are then
zero-length, and the format stays self-describing.

### The v2 layout — supersedes the plan's Interfaces/Step 2/3 where they conflict
C3 §3.5 (amended) adds a **third region**, a per-column `t_us: i64` array, after the column
region — `column_count * 8` bytes, value = the recorded `t_us` of the **first sample** in that
column's bucket range (exact, no interpolation, no `nominal_rate_hz`); sentinel `i64::MIN` when
that bucket range contains no sample at all (short channel, or a column past the tile's real
data). A NaN-valued sample still carries its own real `t_us` — the sentinel is only for "no
sample here," never for "sample present but NaN." Header `version: u16` is **2**, not 1 (byte
layout otherwise unchanged: `magic`/`version`/`tier`/`tile_index`/`sample_count`/`column_count`/
`flags`/`reserved`, still 32 bytes, `tier` still narrowed to `u16` via `tier.min(u16::MAX as u32)
as u16` — safe under `MAX_TIER = 10`). Total tile length: `32 + sample_count*8 + column_count*12
+ column_count*8`.

This means the interfaces are corrected from the plan:
```
// chart_decimation.rs
pub fn column_stats(samples: &[f64], tier: u32, tile_index: u32, column_count: u32) -> Vec<(f32, f32, f32)>; // unchanged
pub fn column_times_us(t_us: &[i64], tier: u32, tile_index: u32, column_count: u32) -> Vec<i64>; // new — mirrors column_stats' bucket-range math, no NaN handling needed (t_us has no NaN concept): returns t_us[range.start] per column, or i64::MIN when range.start is past t_us.len() or the range is empty.

// tile.rs
pub fn build_tile_bytes(samples: &[f64], t_us: &[i64], tier: u32, tile_index: u32, column_count: u32) -> Vec<u8>; // gains the t_us parameter; samples.len() == t_us.len() is the caller's invariant, doc-commented
```
This is not a numbered ruling — the pre-read predates R25's v2 decision, so no gap/ruling states
the exact Rust signature. It is the literal shape needed to satisfy C3 §3.5 as amended, built the
same way `column_stats` already walks the tile's bucket ranges. If it does not compile cleanly
against a convention Tasks 5–9 landed differently (e.g. `Arc<[i64]>` vs. `&[i64]`), match that
convention and note the deviation in your report — do not silently improvise past it (CLAUDE.md
§1).

**`build_tile_bytes`'s doc comment must state which source feeds it (G10.6):** it takes an
already-materialised `(samples, t_us)` window — the reference encoder, used by tests and any
caller that already has one materialised. It does **not** replace `SessionHandle::decimate_tile`,
which remains the non-materialising production path for a channel's sample region (design's "no
f64 window is ever materialized" principle, `handle.rs:588`). Extending that non-materialising
approach to the column and column-time regions is out of scope this task — record it as a
deferral alongside the tier cache (G10.7, below), not silently.

- [ ] **Step 1: `column_stats` and `column_times_us`, failing tests first.** `column_stats`:
  unchanged from the plan (same NaN handling as `decimate_tile_pure` — all-NaN column →
  `(NaN,NaN,NaN)`; mixed → stats over finite samples only; past-end column → `(NaN,NaN,NaN)`; a
  running mean, `sum/count` over finite samples, not `(min+max)/2`). Tests per the plan's table,
  one column-stats analogue per existing bucket test. `column_times_us`: tests — `column fully
  within data — returns t_us of the first sample in that column's bucket range`; `past-end column
  — i64::MIN sentinel`; `column_count == 0 — empty Vec`; `NaN-valued sample at the start of a
  bucket range — still returns that sample's real t_us` (per C3 §3.5's explicit statement — this
  is the test that pins the sentinel-vs-NaN distinction).

- [ ] **Step 2: `build_tile_bytes` — header.** 32-byte header exactly per C3 §3.5's amended
  table: `magic = b"IDLT"`, `version: u16 = 2`, `tier: u16` (narrowed, `min(u16::MAX as u32)`),
  `tile_index: u32`, `sample_count: u32 = TILE_SIZE_BUCKETS`, `column_count: u32`, `flags: u32 =
  0`, `reserved: [u8; 8] = [0; 8]`. Little-endian throughout, explicit `_le` calls. Test:
  `build_tile_bytes header — first 32 bytes match C3 §3.5's field table exactly, version == 2`
  (byte-sliced assertions, not just total length).

- [ ] **Step 3: Sample region, column region, column time region.** Sample region: cast
  `decimate_channel(samples, tier, tile_index)`'s interleaved output to `f32`, encode —
  `sample_count * 8` bytes. Column region: `column_stats(...)`, cast to `f32`, `min, max, mean`
  per column — `column_count * 12` bytes. Column time region: `column_times_us(...)`, encode as
  `i64` LE — `column_count * 8` bytes. Test: the pure-arithmetic offset test (L3-R30, above) and
  the real fixed-1024 length test — both against the amended three-region formula, not the
  plan's two-region one.

- [ ] **Step 4: Total-length, round-trip decode, and the decimate_tile cross-check (G10.6).**
  Total length test per the amended formula. Round-trip decode test: an in-test decoder reads the
  header and all three regions back out and asserts every value matches what
  `decimate_channel`/`column_stats`/`column_times_us` independently computed. **New, closing
  G10.6:** build a `SessionHandle::from_channels` fixture with a real `Channel` (`t_us`,
  `RawColumn`), take `h.channel_samples(id)` as the `&[f64]` fed to `build_tile_bytes` alongside
  the channel's real `t_us`, and assert the decoded sample region matches
  `h.decimate_tile(id, tier, tile_index)`'s output for the same `(tier, tile_index)` — extending
  the existing `decimate_tile_matches_pure_fold_over_materialized_samples` precedent
  (`handle.rs:1272`) to prove `tile::build_tile_bytes` itself, not just `decimate_channel`, agrees
  with the non-materialising path. Also: **short-channel degenerate test** (G10.4) — a 3-sample
  channel at tier 0, `column_count` large enough that most columns are past-end: column region is
  mostly `(NaN,NaN,NaN)`, column-time region is mostly `i64::MIN`, tile length is still exactly
  the formula's value (no truncation).

- [ ] **Step 5: Test and commit.** Run the three filters (COMPUTE RULES), each non-zero `passed`,
  `0 failed`. Commit with explicit paths (NOT `git add -A`):
  `git add core/src/chart_decimation.rs core/src/tile.rs core/src/session/handle.rs
  core/src/lib.rs` — message `tile: C3 §3.5 v2 binary encoder (sample/column/column-time
  regions); MAX_TIER overflow guard (R25)`. Single line, no AI attribution trailer.

## Do not
- Do not run the plan's `cargo test -p idl-rs "tile|column_stats"` — matches zero tests (G10.1,
  L3-R8). Use the three named filters instead.
- Do not ship tile layout v1 (index-space only, no column-time region) — L3-R29 is superseded;
  code v2 directly, per ledger R25.
- Do not synthesise a column's `t_us` as `index / nominal_rate_hz` — it is the recorded `t_us` of
  the actual first sample in that column's bucket range, or the `i64::MIN` sentinel when there is
  none.
- Do not keep the plan's "real inconsistency"/hypothetical-512 framing around Open Question 5
  (L3-R30 closes it) — one pure-arithmetic test of the offset formula, not a mandated test of a
  hypothetical `sample_count`.
- Do not let `tier` overflow silently anywhere — `checked_pow`/`MAX_TIER` in both
  `decimate_channel` and `decimate_tile`.
- Do not build a tier cache (G10.7) — design §4's L3 row lists one, no task in this plan builds
  it; name the deferral in your report, do not build it and do not claim it in the commit message.
- Do not touch anything in `session/handle.rs` beyond the two named `TIER_BASE.pow` call sites —
  R25's authorisation is scoped to exactly that edit.

## Style / hygiene
Doc comment on every public symbol, including a loud one on `build_tile_bytes` stating which
source feeds it (above) and one on `column_times_us` stating the sentinel rule; units on every
numeric value (`t_us` in µs — state it); typed errors only (none new here — this module is
infallible by construction); A/A/A tests named `thing — condition — result`; match surrounding
hand-formatted style.

## Spec discipline (say it out loud in your report)
"spec-first" — C3 §3.5's v2 layout is already landed (contract batch 3, ledger R25) before this
task starts; you are coding against signed text, not proposing it. No further spec change needed
from this task.

## Report back (concise)
Commit hash + `git show --stat`; all three test commands and result lines (`passed`/`failed`
counts); per-step done/deviated; confirmation the header's `version` field is `2`; confirmation
the `column_times_us` sentinel/NaN-sample distinction test passes; confirmation the new
`decimate_tile` cross-check test (Step 4) passes and what it proves; confirmation `build_tile_bytes`'s
signature deviation (if any) from the one proposed above, and why; confirmation `MAX_TIER`
overflow guards are in both call sites; confirmation the tier-cache deferral is recorded, not
built; anything ambiguous you resolved (say how) or that needs a lead ruling (stop and report
instead of guessing — CLAUDE.md §1).
