# L3 — core workbook v3

**Scope:** `.idl1wb` Markdown/front-matter parse (`pulldown-cmark`) and
cell-id assignment; math-cell definition grammar, flat cross-cell constants,
structural validator (reusing the 69-function builtin catalog and
`MathEvalErrorKind` unmodified); table-cell wiring onto existing
`table::model::TableModel`; Rust-side data for every C2 §5.1 JS host variable
(`channel()`, one binding per math definition, `laps`, `session`,
`constants`) — the sandboxed-iframe/Runtime wiring itself is L6's (wave 2);
tile (C3 §3.5), raster (C3 §3.6, including a new 2-D histogram — none
existed) and cursor (C3 §3.7) endpoints as plain, Tauri-free Rust functions;
`idl-rs migrate-workbook` Stage 1 (v2 JSON → v3 Markdown; Stage 2, chart-slot
→ `plotForm` code, is L6's/TypeScript's). Resolves the C1 §8 item 5 `t`
naming collision (µs storage axis vs. seconds host-variable field).

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md` (16 tasks).

**Dependency gate (L1 → L3):** Task 5 (time model) needs L1's landed
`Channel.t_us: Vec<i64>` (C1 §2). Intended mode: L1↔L3 live agent team,
one worktree (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set; design §12,
decisions ledger R3). Fallback gate: `grep -n "pub t_us: Vec<i64>" rust/core/src/session/mod.rs` — a match means proceed, no match means block Task 5 onward.

**Branch:** `wave1-l3-workbook` (idl-rs submodule repo, working dir `…/idl1-app/rust`).

**Done when:** (1) a migrated idl0 workbook evaluates byte-for-byte against
the existing v2 evaluator on every math output (Task 15 Step 1); (2) tile
sample-region stats verify against `decimate_channel` directly, both at the
unit level (Task 10 Step 4) and against a real evaluated math-cell result
(Task 15 Step 2).

**SPEC sections touched:** `docs/IDL0_SPEC.md` §17a rewritten in place (same
section number — decision and reasoning in Task 14) for workbook v3,
pointing to C2 as the authoritative grammar. No other SPEC section changes.

**Functions L5 needs for tiles/rasters/cursor** (all plain Rust, no `tauri`
dependency — L5 wraps each in a `#[tauri::command]` in `rust/tauri/src/commands.rs`):
- Tiles (C3 §3.5): `idl_rs::tile::build_tile_bytes(samples, tier, tile_index, column_count) -> Vec<u8>`
- Rasters (C3 §3.6): `idl_rs::raster::build_spectrogram_raster_bytes(samples, sample_rate_hz, width, height, window, nperseg, noverlap) -> Vec<u8>` and `idl_rs::raster::build_histogram2d_raster_bytes(xs, ys, width, height) -> Vec<u8>`
- Cursor (C3 §3.7): `idl_rs::cursor::cursor_readout(channels: &[(&str, &[i64], &[f64])], t_us: i64) -> Vec<(String, Option<f64>)>`

**Open questions logged (8, none blocking — each has a stated default, see plan's "Open questions"):** stray math-line error kind; malformed table-JSON error kind; one `CellOutput` per math definition vs. per cell; tile column-stats sample-range mapping; C3 §3.5 worked-example `sample_count` vs. `TILE_SIZE_BUCKETS` discrepancy; cursor interpolation method (nearest-sample chosen); `fetch_raster`'s single-channel arg vs. histogram2d's two channels (C3's own open question 6.4, flagged not re-raised); the YAML/`pulldown-cmark` crate pins (not in the M0 ecosystem report). All assigned to the lead (or, for the last, to L3's own implementer at Task 1).

## Delivered

The header above (Scope and Done-when, lines 1–41) predates rulings R30 and R25
and is left as written per L3-R42's append-only rule — this section is the
lead's record of what actually landed and where the header's text is now
superseded. Task 16, 2026-09-04.

**Landed, task by task** (worktree `wave1-l3-workbook`, `git log --oneline`):
- Task 1 — `e018db9` workbook: v3 front matter, fence scanning, cell-id assignment (C2 §1-2); pins pulldown-cmark 0.13.4, serde_yaml_ng 0.10.0; review minors in `0215d59`.
- Task 2 — `abe6a75` workbook: v3 structural error kinds and exact C2 §3.5.A messages; review minor in `38fce89`.
- Task 3 — `58c3ef9` workbook: v3 math-cell definition/const-line grammar (C2 §3.1); review minors (R24, leading-minus const lines) in `668a483`.
- Task 4 — `2d8e4b6` workbook: v3 constants merge, universal-constant guard, `math::parse::parse_with_constants` (C2 §3.1-3.2); review fix in `d0fc17b`.
- Task 5 — `fd9b30d` math: per-sample `t_us` on `LookupChannel`/`ChannelValue`/`EvalOutput` (C1 §8 item 5); derived channels keep their source axis. Its review Minor became R33 (`if()` folds the time axis across all three operands), folded into Task 6 Step 0.
- Task 6 — `34291d5` workbook: v3 flat-namespace resolver, deps-first, per-definition results never swallowed (C2 §2.4); carries R33's `if()` fix.
- Task 7 — `2936118` workbook: v3 table-cell fence body wired to `table::model::TableModel` (C2 §4).
- Task 8 — `f7c757b` workbook: v3 host-variable data (channel/laps/session/constants) and `${...}` span extraction (C2 §5); its review became R34 (cross-session lookup exclusive; lap error names the recorded lap count) and R35 (the id/lookup pairing check R34(a) implied has no wave-1 caller — deferred to L6, documented not enforced).
- Task 9 — `79214d1` workbook: v3 per-cell evaluation orchestrator (Tauri-free; shape matches C3 §3.4); carries R33/R34's fixes. A pre-existing fixture failure surfaced at this task's end-of-batch gate became R37 (C2 §2.5's worked example drops the reserved constant `g`); fixed in `f1f5ce7`.
- Task 10 — `b1a33d4` tile: C3 §3.5 v2 binary encoder (sample/column/column-time regions); `MAX_TIER` overflow guard (R25); fix in `1f04286` (true all-NaN tile at every `tile_index`; saturating `column_sample_range`).
- Task 11 — `caf4d06` raster: 2-D histogram, colormap, C3 §3.6 binary encoder + `raster_meta` (spectrogram + histogram2d); `50accd3` TODO(idl0) pointer for deferred log/percentile colour scaling (G11.8); `e5d9a4e`/`812f761` R38 fix (colour bounds scan the full matrix pre-rebin) and its regression test.
- Task 12 — `489247e` cursor: nearest-sample readout, clamped inside span / `null` outside (R31), one algorithm shared with `SessionHandle` (C3 §3.7); `039df03` R39 (`gps_channel_values` — landed by L1 — amended to also go `null` past a channel's span, matching `cursor_readout`).
- Task 13 — cut from wave 1 by ruling R30 (`brief-task13.md`); not implemented.
- Task 14 — `f29bf74` (idl1-app repo, this branch) docs: SPEC 17a rewritten for workbook v3 (C2); import policy kept as 17a.5, migration moved to 17a.6 (specified, not implemented per R30).
- Task 15 — `60a6c98` test: v3 pipeline parity against the direct evaluator, and tile bytes from an evaluated math cell (L3 done-criteria).
- Task 16 — this task (docs only, no code).

**Full-run result (Step 0, 2026-09-04):** `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`
in the idl-rs worktree, run once, foreground: `idl_rs` lib 846 passed, 0 failed,
1 ignored; `real_session_odr_validation` 1 passed, 0 failed; `idl-rs-cli` bin
51 passed, 0 failed; doc-tests 0 passed, 0 failed. Total **898 passed, 0
failed** across the lane's full run.

**Done when, as met:**
1. *(superseded by R36, replacing the migration-parity wording that R30 made
   unprovable)* Every v3 math-cell value equals a direct `math::evaluate` on
   the same expression against the same session, bit-for-bit — proved by
   Task 15 Step 1 (`workbook::v3::tests_pipeline::
   workbook_v3_pipeline_values_match_a_direct_evaluate_bit_for_bit`, part of
   `60a6c98`). This is not a weakening: the original criterion bundled two
   guarantees, (i) the evaluator produces idl0's numbers — already proven
   independently of migration by `core/src/math/tests_parity.rs`'s Dart-ported
   output vectors — and (ii) the v3 cell pipeline routes to that evaluator
   without altering values, which is what Task 15 Step 1 now proves directly.
   Migration was only ever the transport that would have carried (ii)'s test
   data; with no v2 workbooks worth migrating (R30), hand-written v3 cells
   carry it just as well. See Q5 in `questions.md` and ledger R36
   (2026-09-04) for the lead's confirmation.
2. Tile sample-region stats verified against `decimate_channel` at the unit
   level (Task 10 Step 4) and against a real evaluated math-cell result
   (Task 15 Step 2, `tile_built_from_an_evaluated_math_cell_matches_
   decimate_channel_directly`, also part of `60a6c98`) — met.

**Functions L5 needs** (re-read from the landed source; the header's list at
lines 37–39 above is stale under R25/R31/R33–R35 and is superseded by this):
- `tile::build_tile_bytes(samples: &[f64], t_us: &[i64], tier: u32, tile_index: u32, column_count: u32) -> Vec<u8>` — `core/src/tile.rs:28`
- `chart_decimation::column_stats(samples: &[f64], tier: u32, tile_index: u32, column_count: u32) -> Vec<(f32, f32, f32)>` — `core/src/chart_decimation.rs:123`
- `chart_decimation::column_times_us(t_us: &[i64], tier: u32, tile_index: u32, column_count: u32) -> Vec<i64>` — `core/src/chart_decimation.rs:169`
- `chart_decimation::MAX_TIER: u32 = 10` — `core/src/chart_decimation.rs:19` (L5 validates a requested `tier` against this before returning tile bytes)
- `raster::build_spectrogram_raster_bytes(samples: &[f64], sample_rate_hz: f64, width: u16, height: u16, window: FftWindow, nperseg: usize, noverlap: usize, detrend: Detrend, scaling: Scaling) -> Vec<u8>` — `core/src/raster.rs:93`
- `raster::build_histogram2d_raster_bytes(xs: &[f64], ys: &[f64], width: u16, height: u16, range_x: Option<(f64, f64)>, range_y: Option<(f64, f64)>) -> Vec<u8>` — `core/src/raster.rs:144`
- `raster::spectrogram_raster_meta(samples: &[f64], sample_rate_hz: f64, window: FftWindow, nperseg: usize, noverlap: usize, detrend: Detrend, scaling: Scaling) -> RasterMeta` — `core/src/raster.rs:192`
- `raster::histogram2d_raster_meta(xs: &[f64], ys: &[f64], nx: usize, ny: usize, range_x: Option<(f64, f64)>, range_y: Option<(f64, f64)>) -> RasterMeta` — `core/src/raster.rs:217`
- `raster::RasterMeta { x_domain: (f64, f64), y_domain: (f64, f64), vmin: f64, vmax: f64, transparent_zero: bool }` — `core/src/raster.rs:30` (no `x_label`/`y_label`/scale kind — L5 fills those)
- `cursor::cursor_readout(channels: &[(&str, &[i64], &[f64])], t_us: i64) -> Vec<(String, Option<f64>)>` — `core/src/cursor.rs:26` (per channel: `None` if the channel has no samples/axis, or `t_us` falls outside its recorded span, R31; L5 owns unknown-channel existence checks and the C3 §3.7 JSON fold)

**Deferrals, recorded not delivered:**
- Tier cache (design §4, L3 row, line 187) — not built.
- Stage 2 chart-slot → `plotForm` conversion — L6's, wave 2.
- v2 workbook migration (`migrate-workbook`, C2 §6) — cut by R30; C2 §6 stays written, unimplemented.
- R34(a)'s cross-session `other_session` id/lookup pairing validation — no wave-1 caller exists to own it (R35); `host::channel()`'s doc comment and a `// TODO(idl0):` name L6 as the owner.

**Open questions parked on defaults:** the lane's `questions.md` entries —
Q1 (DSP nominal rate) still open; Q3 (migration report policy) now moot under
R30; Q5 (the substituted Done-when (1) criterion) answered by R36, recorded
above.
