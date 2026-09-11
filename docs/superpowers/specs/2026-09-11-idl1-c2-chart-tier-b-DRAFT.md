# C2/C3 chart tier B — map, lap table, lap progression, spectrogram (DRAFT)

**Status:** draft for the lead · **Date:** 2026-09-11 · No code, no edits elsewhere.

Scope: the smallest C2/C3 additions that let a v3 workbook *express* the four chart
types §5.3 cannot. Projection, decimation, aggregation and rasterisation are numbers
(`core`); marks, axes and colour scales are pictures. No parameter of the picture lives
outside the document. **Two survey corrections, verified this pass:**
`rust/core/src/track_projection.rs` (`Projector` — heading-disambiguated projection onto
a reference path with cumulative arc length) and `rust/core/src/gps.rs`
(`build_gps_track`) both exist, so "no polyline geometry found" is wrong; and
`core::spectrogram::spectrogram` exists with `raster.rs` already calling it, so R158 is
a missing *math-eval binding*, not missing DSP.

## 1. gpsMap

Not a tile layer: a projected 2-D path per window over the track's polyline and gates,
in one local ENU frame. Projection is `core`. **Host var** — a third recognisable form
beside `channel(...)`/`spectrum(...)`, added to the grammar below as
`gps_call ::= "gps(" (js_string | "null") ")"`, its argument the colour-by channel or
`null`. Returns `{ length, x, y, c, t, w }` plus a `windows` descriptor — the R127 shape
with `x`/`y` for `t`/`v`. `x`,`y` are metres east/north of the ENU origin (`f64`);
`c` is the colour-by channel resampled onto the fix times, `NaN` where absent; `t` is
seconds, session-relative; `.unit`/`.unitState` describe `c`, geometry is always `m`.
**Second host var** for the underlay, resolved per selection, never per frame, in the
same frame and origin as every `gps(...)` payload in that cell: `trackGeometry` →
`{ origin: {lat, lon}, polyline: {x,y}[], gates: {name, kind, x1, y1, x2, y2}[] }`.

```
marks_array ::= time_marks | fft_marks | map_marks
map_marks   ::= "[" map_mark ("," map_mark)* "]"
map_mark    ::= "Plot." ("line"|"dot") "(" gps_call "," map_options ")"
              | "Plot.line(trackGeometry.polyline, {x:\"x\", y:\"y\", stroke:" css_color "})"
              | "Plot.link(trackGeometry.gates, {x1:\"x1\", y1:\"y1\", x2:\"x2\", y2:\"y2\", stroke:" css_color "})"
map_options ::= "{" "x" ":" "\"x\"" "," "y" ":" "\"y\"" ("," "stroke" ":" (css_color |
                    "\"c\"" | "\"w\""))? ("," "strokeWidth" ":" js_number)? "}"
```

`PlotProps.chart: "map"`; plot options gain one required literal `aspectRatio: 1` —
equal aspect is a property of the projection, not a renderer preference, so the document
states it. `stroke: "c"` colours by channel (`color.domain` in the document);
`stroke: "w"` colours by window, as R127 already defines for channels.

**Wire.** `fetch_gps_trace_v2(workbook_id, window: Window, colour_by: string | null,
budget: number)` → `tauri::ipc::Response`, magic `"IDLG"`, version 1, header
`{magic, version:u16, flags:u16 (bit0 = has_c), point_count:u32, reserved:[u8;8]}`, then
`point_count` × `f64` for `x`, `y`, `t`, and `c` when bit 0 is set. Sibling JSON
`fetch_gps_trace_meta(session_id, track_id)` returns `trackGeometry` plus `x_domain`/
`y_domain`, projected from `TrackDetail` (C3 §3.2) so the app never sees a latitude.

**Budget.** Perpendicular-distance (Douglas–Peucker) decimation in `core`, not stride:
`budget` = 4 × the map's CSS pixel width, clamped to `[1024, 8000]` points per window.
A path is geometric, so §4's "2 points per pixel column" does not apply; the tolerance
rule is what keeps a hairpin a hairpin. Settle-bound exactly like `fetch_tile` (C3 §4).
**Per-window (R127):** one payload covers every selected window, `w` names each point's
window, one `NaN` break row between adjacent windows — so a cell ignoring `w` draws *n*
separate paths, never one jumping between laps. **Migration:** §6's `sessionSheet` row
changes, `gpsMap` no longer dropped — `ChartSlot(gpsMap)` → a `chart: "map"` js cell with
`gps("<colourChannel>")` or `gps(null)`, `color.domain` from the slot's colour min/max,
plus the two underlay marks.

## 2. lapTable — what §4 already covers, and the four things missing

**No new chart type and no new cell kind.** §4's `TableModel` is rows × columns of §3.2
expressions; `Row.context = {sessionId, lapIndex}` *is* "this row is a lap"; a column
`template` like `max([Fork travel])` *is* a per-lap aggregate in that row's window;
`main({col[]})` *is* idl0's compare-to-fastest column. Missing, precisely:

1. **Rows cannot follow the selection.** Rows are authored JSON, and §6 migrates
   `rowSource == "lapSelection"` to static rows with a warning. Add
   `TableModel.rowSource: "authored" | "windowLaps"` (default `"authored"`, so landed
   tables are unchanged). Under `"windowLaps"` rows are derived — one per lap of each
   selected `Window`, window order then lap order — authored `rows` ignored, cells
   addressed by column.
2. **No designated Main row.** `main()` reads `MathLapContext::baseline_row`, which no
   `TableModel` field populates. Add `TableModel.mainRowId: string | null`, `"fastest"`
   reserved under `rowSource: "windowLaps"` to match idl0's default.
3. **Lap time is not expressible.** No channel carries it; `lap_start_time(n)` needs an
   `n` the row cannot name. Add three row-context scalars to §3.3: `lap_number()`
   (dimensionless), `lap_time()` and `sector_time(i)` (both `Fixed(s)`), all `NaN`
   outside a row context, sourced from C3 `list_laps` (`LapSummary.lap_time_ms`).
4. **Base and name mismatch.** `RowContext.lapIndex` has no documented base while C3's
   `LapSummary.lap_number` is 1-based (renamed from a 0-based `lap_index`). Rename to
   `lapNumber`, 1-based, old key accepted on read.

**Budget.** No new wire — `eval_workbook_v2` already returns one `CellOutput[]` per
window. R125's per-session cache is a precondition, not a follow-up: `windowLaps` is the
exact O(laps × session) shape R125 names. **Migration:** §6's "no v3 chart type covers
`lapTable`" row is replaced — `ChartSlot(lapTable)` → a `table` cell with
`rowSource: "windowLaps"`, `mainRowId: "fastest"`, a `lap_time()` column and one
`sector_time(i)` column per sector gate.

## 3. lapProgression

§3.6 already types this — a rank-1 value on a `lap` axis — and §3.6.6 already gives the
mark (`Plot.barY`/`dot`, `{x:"lap", y:"v"}`). Three things are missing.

1. **A value on the `lap` axis.** §3.6.7 writes `mean([peak_freq], "t:lap")`; whether
   that regroup is implemented is an unknown this pass did not resolve. Plus
   `lap_time()` as a rank-1 `[lap]` value, unit s, when called with no row context — §2
   item 3's builtin, shape-dependent on context as `mean` already is.
2. **A grammar production**, so the picker can seed one. `PlotProps.chart: "lap"`:
   `lap_marks ::= "[" "Plot." ("barY"|"dot"|"lineY") "(" identifier "," "{" "x" ":" "\"lap\"" "," "y" ":" "\"v\"" ("," ("z"|"stroke") ":" "\"w\"")? "}" ")" "]"`.
   The first argument is a bare math-definition host variable, never `channel(...)` — a
   `[lap]` value is always a definition.
3. **An axis kind on the wire.** IDLH (C3 §3.4) carries only `flags` bit 0 = `has_t`,
   but a `[lap]` payload's axis is ordinal lap numbers and §5.1 binds the key `lap`. Add
   `axis_kind: u16` in the header's reserved bytes (`0 none, 1 time, 2 frequency, 3 lap`)
   as **IDLH version 2** — a layout bump, not a new command.

**Per-window and cross-session (M5).** No new wire: one evaluation per window already,
so `w` and the `windows` descriptor carry sessions as R127 defines, and `stroke: "w"`
gives one line per session in the descriptor's `--chart-N` token. Lap numbers repeating
across sessions is correct here — X is lap ordinal, `w` separates the series. Laps per
session are tens: no decimation, no cap. **Migration:** `ChartSlot(lapProgression)` → a
`chart: "lap"` js cell over `lap_time_s = lap_time()`, drawn with
`Plot.lineY(lap_time_s, {x:"lap", y:"v", stroke:"w"})`.

## 4. Spectrogram as a chart cell

**What R158 left** is only the binding: the DSP computes the matrix and `raster.rs`
already calls it, but `eval.rs` groups `spectrogram` with the unimplemented arm and
`catalog.rs` marks it `N`, so no math cell can produce §3.6.3's value. **The raster
underlay is the right foundation.** §3.6.6 already rules that a `[t,f]` definition whose
expression is exactly a `spectrogram(ch, …)` call is recognised by the host and drawn
through `fetch_raster(kind:"spectrogram")`/`fetch_raster_meta`, keyed by
`rasterKey(channelId, params)` — pixels in Rust, one rasteriser. Two additions:

1. **A grammar production** mirroring `spectrum_call`, so a spectrogram is
   picker-seedable rather than custom code. `PlotProps.chart: "spectrogram"`:
   `raster_marks ::= "[" "Plot.image(" spectrogram_call ", {x:\"x\", y:\"y\", width:\"w\", height:\"h\", src:\"src\"})" "]"`,
   `spectrogram_call ::= "spectrogram(" js_string "," fft_params ")"` — the same six
   required keys in the same fixed order as `spectrum_call`, one parameter table serving
   both. `y.type` is `"linear"` or `"log"`; the colour legend is built from
   `RasterMeta.ramp_stops` (R177), never reimplemented.
2. **A windowed raster command.** `fetch_raster`/`fetch_raster_meta` take `session_id`,
   so a spectrogram of one lap is unreachable today — the gap R117 closed for eval and
   FFT. Add `fetch_raster_v2(window: Window, channel, kind, width, height, params)` and
   `fetch_raster_meta_v2(…)`, deprecating the `session_id` forms per C3 §5.

**Per-window (R127).** A raster has no `w` column — pixels cannot interleave and a break
row is meaningless. Rule: **one raster per window**, fetched separately and faceted with
`fx: "w"`, a shared `y` (frequency) scale, per-window `x` domains from each window's own
`RasterMeta`, and a `color.domain` stated in the document as the `vmin`/`vmax` union
rather than chosen by the host. **Budget:** `width`/`height` = the cell's CSS pixel box
in device pixels, clamped to 2048 × 1024, rendering at the clamp rather than refusing
above it; settle-bound under C3 §4's density rule.

**Migration.** A new §6 row (`spectrogram` was not previously convertible):
`ChartSlot(spectrogram)` → a `chart: "spectrogram"` js cell with the six `fft_params`
read off the v2 slot's `SpectralParams`; `averaging` is dropped, since a spectrogram
keeps every frame.

## 5. Open questions for the lead

1. **Is `gps(...)` a host var, or should the map read `channel("GPS_Latitude")` and
   project in JS?** *Recommended:* a host var. Projecting in JS puts a number the
   comparison depends on in the renderer and duplicates `track_projection`.
2. **Does `rowSource: "windowLaps"` belong in §4, given a derived row set is not in the
   file?** *Recommended:* yes. The rule is in the file and the rows are its output, as a
   chart's data is. Authored-rows-only re-creates idl0's stale lap table.
3. **Should `lap_time()` be shape-polymorphic (scalar in a row context, `[lap]` in a
   math cell)?** *Recommended:* yes, stated on its §3.3 row. `mean` already is, and a
   second name for one quantity is worse.
4. **IDLH version 2 (`axis_kind`) or a `fetch_host_channel_v3`?** *Recommended:* the
   version bump. C3 §5 governs command signatures, the args are unchanged, and the tile
   header set the precedent.
5. **Does the spectrogram cell wait on R158's eval binding?** *Recommended:* no. The
   grammar recognises the call textually, as `spectrum_call` does, and never needs a
   math value; the binding unlocks §3.6.7's reductions, separate work.
6. **Four `PlotProps.chart` values beyond `time`/`fft` — is that axis growing correctly,
   or does chart kind want a cell attribute?** *Recommended:* keep it in `PlotProps`.
   §2.2's attribute namespace is for document structure; a chart kind is content.

**Named unknowns.** Whether §3.6.3's `"t:lap"` regroup and the axis-aware reductions are
implemented in `eval.rs` (not verified; R158 says trust the engine, not the status
column). Whether `MathLapContext::baseline_row` is populated by any current caller.
Whether Plot 0.6.17's `Plot.image` accepts a data-URL/ImageBitmap `src` column in the
shape §4 assumes — the unverified-Plot-shape risk C2 §8-3 carries for `{length, t, v}`.
