# Chart types: idl0 vs idl1 — survey (2026-09-11)

## 1. idl0 chart types (`idl0-app/app/lib`)

`ChartType` enum: `data/worksheet.dart:20-66`. Render dispatch: `ui/tabs/analyze/chart_workspace.dart:517-667`. Picker catalog: `ui/tabs/analyze/chart_type_catalog.dart:42-97,102-110`.

1. **timeSeries** (`chart_workspace.dart:616`) — multi-channel line chart; X = time/wheel-distance/gps-distance (`XAxisMode`, `worksheet.dart:110-123`); Y auto or manual min/max, linear/log/sqrtSigned/squareSigned scale; per-channel colour, zero-line toggle; lap-pair mode swaps to sliced main+overlay traces on lap-relative X (`chart_workspace.dart:509-514`).
2. **fft** (`worksheet.dart:24-26`, `chart_workspace.dart:518-599`) — magnitude spectrum, one line/channel; session-mode = one window over zoom span, lap-mode = one window per selected lap (`fft_window_resolver.dart`); manual Y range; skips event-driven/empty channels.
3. **spectrogram** (`worksheet.dart:28-31`, `chart_workspace.dart:639-645`) — time×frequency heatmap, STFT, shares `SpectralParams` with fft but keeps every frame.
4. **histogram** (`worksheet.dart:33-37`, `chart_workspace.dart:600-606`) — value-distribution bars over whole session, one channel typical, extra channels overlay translucently; engine `channel_histogram`.
5. **gpsMap** (`worksheet.dart:40-41`, `chart_workspace.dart:607-615`) — GPS track polyline on a map; optional colour-by-channel with min/max.
6. **lapTable** (`worksheet.dart:43-46`, `chart_workspace.dart:632-633`) — per-session lap×sector time table; pinned slot 1 of a Session Sheet.
7. **lapProgression** (`worksheet.dart:48-50`, `chart_workspace.dart:634-638`) — lap-time-per-lap line, one line/session, X = lap index; pinned slot 2 of a Session Sheet.
8. **varianceTrace** (`worksheet.dart:53-57`, `chart_workspace.dart:646-652`) — N-lap variance: per-sample delta of each overlay lap vs. Main (fastest, overridable), up to 9 laps, aligned by lap-relative time or track distance (`VarianceMode`, `worksheet.dart:79-87`); engine `variance_traces`. Widget itself is a TODO stub in idl0 (never finished — `chart_workspace.dart:647-651`).
9. **scatter** (`worksheet.dart:60-65`, `chart_workspace.dart:653-667`, `scatter_chart.dart`) — XY channel-vs-channel (G-G circle default); two modes: decimated point cloud w/ optional colour-by-third-channel, or 2D density heatmap; equal-aspect + reference g-circles; engine `scatter_points`/`scatter_density`.

Session Sheet (`WorksheetKind.sessionSheet`, `worksheet.dart:95-107`) auto-pins gpsMap+lapTable+lapProgression as slots 0-2, not user-addable.

## 2. idl1 today

Picker catalog (`chartTypeCatalog.ts:38-44`) exposes exactly Plot's 5 marks — line/dot/area/bar/rule — all on a single-node `js`-cell time chart (`graphToChart.ts`). Own doc comment (`chartTypeCatalog.ts:1-19`) already states this is deliberately narrower than idl0's whole-chart-kind picker. `plotForm` grammar (C2 §5.3, `app/src/routes/pages/Notebook/plotForm/{types,generate,parse}.ts`) additionally expresses an **FFT chart** (`chart: "time"|"fft"`, spec lines 1637-1715) not yet in the picker.

Mapping vs. §1:

| idl0 type | idl1 status | note |
|---|---|---|
| timeSeries | **ported** (mark picker + tile path) | no wheel/gps-distance X mode, no lap-pair overlay, no zero-line/sqrtSigned scale — spec's own migration table drops these (lines 2079-2082) |
| fft | **expressible, no picker entry** | grammar exists (§5.3 `chart:"fft"`, `fetch_fft`), `chartTypeCatalog.ts` doesn't list it |
| spectrogram | missing-needs-engine (grammar) | `spectrogram(...)` math fn is `NotImplemented` in eval (R158, spec line 17); `fetch_raster(kind:"spectrogram")` exists (rasters.rs) once the math fn lands |
| histogram | missing-cheap | `rust/core/src/histogram.rs`+`histogram2d.rs` exist; no `plotForm` production, no catalog entry, no math-fn wrapper |
| gpsMap | missing — unknown | no track/polyline geometry module found under `rust/core/src` in this pass; needs confirmation |
| lapTable | missing, out of grammar | spec explicitly: no v3 chart type covers it (migration table, "not convertible" row) |
| lapProgression | missing, out of grammar | same as lapTable |
| varianceTrace | missing-cheap (core), needs-engine (command) | `rust/core/src/variance.rs::variance_traces` ported; no tauri command, no grammar, no catalog entry |
| scatter | missing-cheap (core), needs-engine (command) | `rust/core/src/scatter.rs::scatter_points`/`scatter_density` ported; no tauri command, no grammar, no catalog entry |

## 3. Port order by value/effort

1. **FFT catalog entry** — grammar + `fetch_fft` already work; add one `chartTypeCatalog.ts` row + picker wiring. Cheapest possible.
2. **Histogram** — core math (`histogram.rs`/`histogram2d.rs`) done; needs a `plotForm` grammar addition (mark or new production) + catalog entry.
3. **Scatter (G-G)** — core done (`scatter.rs`); needs a tauri `fetch_scatter`-style command + grammar production + catalog entry.
4. **Lap variance** — core done (`variance.rs`); same shape of work as scatter, plus lap-selection UI (never finished in idl0 either).
5. **Spectrogram** — blocked behind `spectrogram(...)` eval implementation (R158) before `fetch_raster(kind:"spectrogram")` is reachable from a cell.
6. **GPS map / lap table / lap progression** — largest gap: no v3 grammar concept for any of the three (spec says so explicitly), and gpsMap's track-geometry engine facility is unconfirmed in this pass. Needs a design decision (new engine command + new non-`plotForm` cell/widget kind), not just a grammar addition.

Unknowns: whether any track/polyline geometry exists in `rust/core` for gpsMap (not found by name in this pass — worth a targeted search); whether lapTable/lapProgression are intended to become a workbook-native (non-chart) concept.
