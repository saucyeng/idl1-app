# Brief: spectrogram colour-bar legend from engine ramp stops (R177, part 2)

Rust worktree `../idl-rs-worktrees/legend` (idl-rs) AND app worktree
`../idl1-app-worktrees/legend`. Spec is written: C3 §3.6 `RasterMeta.ramp_stops`
(spec-first, 2026-09-10). Ruling R177 in `runs/2026-09-03/decisions.md`. CLAUDE.md §7:
the Rust DTO, `app/src/ipc/rasters.ts` and the spec move together; the spec already moved.

## Rust (cargo slot: you are the only cargo process)
1. `core::colormap`: `pub fn turbo_stops(n: usize) -> Vec<[u8; 4]>` sampling
   `turbo_rgba8(i as f64 / (n - 1) as f64)`; doc comment with units; `n < 2` returns the two
   endpoints (document it). Tests: length, endpoints equal `turbo_rgba8(0.0)`/`(1.0)`, all
   alpha 255, monotone `t` sampling matches direct calls.
2. `rust/tauri` `RasterMeta` DTO gains `ramp_stops` = `turbo_stops(16)` for every raster kind
   the meta command serves today (both kinds encode with Turbo; assert that in a test by
   comparing a known pixel to a stop). Serde as an array of 4-tuples.
3. Gate: `cargo test -p idl-rs colormap`, `cargo test -p idl-rs-tauri raster` (non-zero
   passed counts), then `cargo test -p idl-rs-tauri -- --test-threads=4`.

## App
4. `app/src/ipc/rasters.ts`: `ramp_stops: [number, number, number, number][]` with the
   spec's doc comment.
5. A pure `rasterLegend.ts` beside `rasterLayer.ts`: `buildLegendGradient(stops)` returns a
   CSS `linear-gradient(to right, rgba(...) p%, ...)` string with stops at `i/(n-1)*100`;
   tests for 2 and 16 stops and that the string never contains a literal colour not in the
   input. `RasterUnderlay.tsx` (or the existing scale-range text's component from the
   raster-labels lane) draws a thin bar with `vmin` left / `vmax` right, keeping the
   existing text range and `magnitude_unit` beside it (the text stays: it prints).
   Print (`report-print.css`): the bar prints as-is; no palette swap, it is data.
6. Test fixtures that build a `RasterMeta` gain `ramp_stops: []` or a 2-stop sample.
7. Gate: `npx tsc --noEmit`, `npx vitest run` (baseline 179/1812, report counts).
   CHANGELOG line. Commit each repo on its branch, no merge, no push, plain messages.
