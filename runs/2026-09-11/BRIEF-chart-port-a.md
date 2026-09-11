# Brief: chart port, tier A -- the types the engine already serves (R215)

Lean owner, Rust `idl-rs-tauri` + TypeScript + C2 §5.3 / C3 text (spec-during). Worktrees: Rust
`idl-rs-worktrees/chart-port-a`, app `../idl1-app-worktrees/chart-port-a`. Holds the cargo slot. Read CLAUDE.md, `runs/2026-09-11/CHART-TYPES-SURVEY.md`
(file:line for every claim; do not re-survey), rulings R136, R158, R167/R168, R212, R215; C2
§5.3 (`plotForm` grammar, spectrum marks), `Notebook/graph/chartTypeCatalog.ts`,
`Notebook/model/plotForm*`, `components/ChartTypePicker.tsx`, the Properties form, and the
sandbox host vars (`channel`, `spectrum`, `laps`, `session`).

## Rulings (R215; do not ask)
Port in this order, one commit each, each with a catalog entry, a Properties form section,
a `plotForm` grammar production (C2 §5.3 text in the same commit), generated Plot code, and
pure-module tests for the generator:
1. **FFT** — already expressible via the spectrum mark; add the catalog/picker entry and
   Properties (window size, hop, window fn, averaging, scaling per R167/R168 names).
2. **Histogram** — one channel, bin count or width, per selected window, normalised or
   counts. **Rust = numbers:** `rust/core/src/histogram.rs` already has the maths; add a C3
   §3.6 command `fetch_histogram(session_id, channel, window, params)` returning bins as
   JSON (small) through the `SessionCache` (R211), never binning in the sandbox.
3. **Scatter (g-g)** — two channels x/y, per window, dot mark; `rust/core/src/scatter.rs`
   exists: add `fetch_scatter(session_id, x, y, window, budget)` (C3 §3.5, binary like tiles)
   that decimates to the point budget in Rust; the sandbox draws only.
4. **Lap variance trace** — `variance_time`/`variance_dist` (R73, `core/src/variance.rs`)
   already evaluate as definitions; the chart type binds a definition and overlay laps
   through the existing host-channel path; distance-on-X stays **disabled with its reason**
   (R136) until lap-distance alignment lands.
5. **Time-series options** the port dropped: lap-pair overlay (main + overlay windows, R127
   windows descriptor), zero line, and signed-sqrt / signed-square y scales; wheel/GPS
   distance on X stays disabled (R136) with the reason shown in the form.
Out of scope, tier B (needs design): spectrogram-as-chart beyond the raster underlay (R158),
gpsMap, lapTable, lapProgression.

## Gates
Rust: targeted filters, then `cargo test -p idl-rs-tauri -- --test-threads=4`, `-p idl-rs -p
idl-rs-cli`, `cargo check -p app` from the app worktree's `app/src-tauri`; C3 text and
`app/src/ipc/` mirrors move with the commands (CLAUDE.md §7). App: `npx tsc --noEmit`, `npx
vitest run` (baseline: read from main at start), `npx vite build`. One reviewer (sonnet) over
the whole diff. Merge both repos (main into branch first, --no-ff), submodule bump, CHANGELOG
lines, retire in the R171 order (`rmdir node_modules` from cmd
inside the worktree's `app/`, confirm gone, remove worktree, delete branch, verify 136). Lanes
never create branches in the main checkout. Never push. Report 10 lines or fewer.
