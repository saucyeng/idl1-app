# Brief: chart port, tier B -- gpsMap, lapTable, lapProgression, spectrogram cell (R217)

Lean owner, Rust core + tauri + TypeScript, spec-first: the draft
`docs/superpowers/specs/2026-09-11-idl1-c2-chart-tier-b-DRAFT.md` (R217 adopted all six of its
recommendations) is lifted into C2 §4/§5 and C3 §3.4–3.6 proper as the FIRST commit, then
code follows it. Worktrees: Rust `idl-rs-worktrees/chart-port-b`, app `../idl1-app-worktrees/
chart-port-b`. Read CLAUDE.md (§8: two cargo slots, ≥ 6 GB free), rulings R125, R127, R136,
R158, R211, R215, R217; the draft; `runs/2026-09-11/CHART-TYPES-SURVEY.md`; core
`track_projection.rs`, `gps.rs`, `spectrogram.rs`, `raster.rs`; the tier A lane's patterns
(`fetch_histogram`/`fetch_scatter`, catalog entries, Properties sections, plotForm generator).

## Rulings (R217, restated; do not ask)
1. **gpsMap**: `gps(...)` is a **host var** served by a C3 command that projects in Rust via
   `track_projection` (lat/lon → track-frame or plain lat/lon when no track), per window,
   point-budgeted like tiles; the chart draws the trace coloured by a channel with the
   track's reference polyline and gates as an underlay when a track exists.
2. **lapTable**: no new chart kind. C2 §4 table cells gain `rowSource: "windowLaps"` (rows
   derived from the selected windows), a Main-row field, `lap_time()`/`sector_time()`
   builtins (shape-polymorphic per R217.3), and the lap-number base fix; R125's per-session
   cache is a precondition (verify it exists; if not, escalate with the cost).
3. **lapProgression**: a per-lap scalar vs lap number from a definition's per-lap aggregate
   or `lap_time()`, across the selected windows' session(s); cross-session waits for M5.
4. **Spectrogram cell**: a chart kind over the existing raster path (`fetch_raster` with a
   windowed variant if the draft requires it); does not wait on R158's eval binding.
5. **IDLH version 2** with `axis_kind` for the host-channel payload where the draft needs
   it; chart kind stays in `PlotProps.chart`.
6. Migration entries in C2 §6 for the four idl0 types. Rust = numbers, JS = pictures.

## Gates
Rust: targeted filters, then `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `-p
idl-rs-tauri`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app` from the app
worktree's `app/src-tauri`. C3/C2 text and `app/src/ipc` mirrors move with the commands.
App: tsc + vitest (baseline from main), vite build. One reviewer (sonnet). Merge both repos
(main into branch first, --no-ff), submodule bump, CHANGELOG `[docs]`, retire in the R171
order (`rmdir node_modules` from cmd inside the app worktree's `app/`, confirm gone, remove,
delete branches; node_modules non-empty and unchanged). Contract text is written in the app
worktree. Lanes never create branches or edit files in the main checkout. Never push.
Report 12 lines or fewer.
