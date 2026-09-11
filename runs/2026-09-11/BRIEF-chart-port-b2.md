# Brief: chart tier B, second half -- make the four kinds draw (R217)

Lean owner, TypeScript + small Rust where a fetch path is missing. Worktrees: Rust
`idl-rs-worktrees/chart-port-b2`, app `../idl1-app-worktrees/chart-port-b2`. Read CLAUDE.md
(§8: two cargo slots, ≥ 6 GB free; tauri gate is `cargo test -p idl-rs-tauri --lib`), rulings
R211, R215, R217, and the digest entry "R217 tier B, first half"; `runs/2026-09-11/
REVIEW-chart-port-b.md`; C2 §4/§5.3 and C3 §3.4–3.6 as lifted by the first half; the tier A
lane's binding pattern for `fetch_histogram`/`fetch_scatter` (host var → protocol → sandbox);
`Notebook/model/jsCellBinding.ts`, `host/protocol.ts`, `sandbox/main.ts`, the table cell
evaluator and the C2 §4 table model.

## Do (one commit each; commit after every task)
1. **`gps(...)` and `trackGeometry`** bind end to end: host-var request → C3 command (already
   exists) → IDLG v1 decode in the host → transferable payload to the sandbox → the map chart
   draws the trace coloured by its channel over the reference polyline and gates; per window
   per R127; point budget honoured.
2. **`spectrogram(...)`** as a chart cell binds through the raster path (existing `fetch_raster`
   + the windowed variant if the first half added one) and draws with axis labels, legend
   (R177) and the R203 budget; the R210/R216 status glyph shows decode progress if nb-feedback
   has merged (read main).
3. **Lap progression** draws (per-lap scalar vs lap number) from the engine command the first
   half added.
4. **Lap table**: the evaluator honours `rowSource: "windowLaps"` and `mainRowId`; an app-side
   `TableModel` renders rows = laps of the selected windows with `lap_time()`/`sector_time()`
   columns and the Main-row highlight; C2 §6 migration entry verified against a real idl0
   lap table (read one `.idl0wb` under `C:\Users\isaac\Documents\Saucy\IDL0\app\dev` read-only).
5. Fix any "decorative" claim left in docs/CHANGELOG (the reviewer's class of finding).
Escalate with a proposal if a fetch path needs a C3 change beyond what the first half wrote.

## Gates
Rust: targeted filters, `cargo test -p idl-rs-tauri --lib -- --test-threads=4`, `-p idl-rs -p
idl-rs-cli`, `cargo check -p idl-rs-cli --tests`, `cargo check -p app`. App: tsc, vitest, vite
build. One reviewer (sonnet). Merge both repos (main into branch first, --no-ff), submodule
bump, CHANGELOG `[docs]`, retire in the R171 order. Contract text in the app worktree. Lanes
never create branches or edit files in the main checkout. If you add npm packages, run the same
`npm install` in the main checkout's `app/` at merge time. Never push. Report 12 lines.
