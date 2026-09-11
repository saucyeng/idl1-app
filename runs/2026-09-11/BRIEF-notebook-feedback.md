# Brief: notebook feedback -- decode progress, timeline sliders, chart width (R221)

Lean owner, Rust `idl-rs-tauri` + TypeScript. Worktrees: Rust `idl-rs-worktrees/nb-feedback`,
app `../idl1-app-worktrees/nb-feedback`. Read CLAUDE.md (§8: two cargo slots, ≥ 6 GB free),
rulings R201, R203, R209, R210, R211, R216, R221; `rust/tauri/src/session_cache.rs`,
`commands/{tiles,cursor,rasters,hostChannel}.rs` (whatever serves samples), the app's
`Notebook/interaction/TimelineStrip.tsx` and its pointer handlers, `components/ChartCell.tsx`,
`JsCellFrame.tsx`, the sandbox iframe host sizing, and `model/cellStatus.ts`. Isaac, after the
memory lanes: "the 3-hour session loaded in 2 minutes and didn't crash; short sessions load in
a snap; it went silent for 2 minutes though — a notebook-wide progress bar or per-chart progress
would be nice"; "charts aren't resizing to the width of the notebook tab"; "the windowing
tool's sliders aren't actually draggable".

## Rulings (R221; do not ask)
1. **Decode progress.** Every `SessionCache` decode that takes more than ~200 ms reports
   progress: a C3 §3.2 event `decode_progress { session_id, channel, done_rows, total_rows,
   finished }` emitted per row group (spec-during, DTO byte-exact, `app/src/ipc` mirror).
   The app: (a) each cell's R210/R216 status glyph shows a determinate ring (fraction of its
   pending channels' rows) instead of an indeterminate spinner while any of its channels is
   decoding; (b) the status bar chip (or AppShell chip if the vscode-shell lane has not
   merged yet; coordinate by reading main) shows "Loading session · 3 of 9 channels · 41 %".
   Pure module `model/decodeProgress.ts` (events → per-cell and notebook aggregates), tested.
2. **Measure the 2 minutes.** Time the decode of the largest session's channels through the
   release CLI or a targeted test on a copy (never the library): report ms per channel and
   whether the cost is parquet decompression, the union time axis, or repeated decodes
   (cache misses). Do not optimise beyond an obvious repeated-decode bug; report the numbers
   for a ruling.
3. **Timeline sliders not draggable.** Find the cause with evidence: candidates are the
   R216 title-bar `data-tauri-drag-region` attribute inherited by a container that includes
   the strip (Tauri starts a window drag on mousedown there), a pointer-events rule from the
   density/shell lanes, or the R209 viewport-commit change. Fix the cause; add a pure test on
   the strip's gesture model if one exists, otherwise a documented invariant.
4. **Chart width.** Charts must size to their column: the chart host measures its container
   with a (rAF-deferred) ResizeObserver and passes width to the sandbox on settle; a fixed
   or stale width from first mount is the bug class. Verify at three window widths and after
   toggling a column.
5. Charts painting over the timeline strip is being fixed by the vscode-shell lane's single
   stacking layer (R221.1); do not add z-index patches here.

## Gates
Rust: targeted filters, `cargo test -p idl-rs-tauri -- --test-threads=4`, `cargo check -p app`
from the app worktree's `app/src-tauri`. App: tsc + vitest (baseline: read from main), vite
build. One reviewer (sonnet). Merge both repos (main into branch first, --no-ff), submodule
bump, CHANGELOG, retire in the R171 order (`rmdir node_modules` from cmd inside the app
worktree's `app/`, confirm gone, remove, delete branches; node_modules non-empty and
unchanged). Contract text is written in the app worktree (specs live in the superproject).
Lanes never create branches or edit files in the main checkout. Never push. Report 10 lines.
