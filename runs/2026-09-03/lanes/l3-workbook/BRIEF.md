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
