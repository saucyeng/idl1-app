# Brief: chart port, tier A -- the types the engine already serves (R215)

Lean owner, TypeScript + C2 §5.3 grammar text (spec-during), never cargo. Worktree
`../idl1-app-worktrees/chart-port-a`. Read CLAUDE.md, `runs/2026-09-11/CHART-TYPES-SURVEY.md`
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
   counts; engine math via the existing host-channel data (bins computed in the sandbox from
   the budgeted samples are acceptable for v1 only if the survey shows no engine histogram
   command; if `fetch_raster(kind: "histogram2d")` or a 1-D engine path exists, use it).
3. **Scatter (g-g)** — two channels x/y, per window, dot mark with the point budget; the
   canonical use is lateral vs longitudinal acceleration.
4. **Lap variance trace** — `variance_time`/`variance_dist` definitions already exist in the
   maths catalog (R73): the chart type binds a definition and overlay laps; distance-on-X
   stays **disabled with its reason** (R136) until lap-distance alignment lands.
5. **Time-series options** the port dropped: lap-pair overlay (main + overlay windows, R127
   windows descriptor), zero line, and signed-sqrt / signed-square y scales; wheel/GPS
   distance on X stays disabled (R136) with the reason shown in the form.
Out of scope, tier B (needs design): spectrogram-as-chart beyond the raster underlay (R158),
gpsMap, lapTable, lapProgression.

## Gates
From `app/`: `npx tsc --noEmit`, `npx vitest run` (baseline: read from main at start),
`npx vite build`. One reviewer (sonnet) over the whole diff. Merge `--no-ff` into main (main
into branch first), CHANGELOG lines, retire in the R171 order (`rmdir node_modules` from cmd
inside the worktree's `app/`, confirm gone, remove worktree, delete branch, verify 136). Lanes
never create branches in the main checkout. Never push. Report 10 lines or fewer.
