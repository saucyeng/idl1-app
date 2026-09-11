import type {
  ColorProps,
  FftParams,
  FftPlotProps,
  FftXAxisProps,
  HistogramMarkProps,
  HistogramParams,
  HistogramPlotProps,
  LapMarkProps,
  LapPlotProps,
  MapMarkProps,
  MapPlotProps,
  MarkProps,
  PlotProps,
  ScatterMarkProps,
  ScatterParams,
  ScatterPlotProps,
  SpectrogramMarkProps,
  SpectrogramPlotProps,
  SpectrumMarkProps,
  TimePlotProps,
  XAxisProps,
  YAxisProps,
} from "./types";

/** Serializes a JS string literal for embedding in generated code via
 *  `JSON.stringify`, never manual quote-wrapping, so a label containing a
 *  quote or backslash cannot produce invalid code. */
function jsString(s: string): string {
  return JSON.stringify(s);
}

/** Renders a time cell's `x_scale` object inline (C2 §5.3), e.g.
 *  `{ label: "Time (s)" }`. Field order is `label`, `domain` — the
 *  grammar's `x_field` order. `type` is never emitted for a time cell (see
 *  `types.ts`). Returns `null` (never `"{}"`) when every field is
 *  undefined — C2 §5.3's `x_scale` never produces an empty object, so the
 *  caller omits the `x` key entirely, the same "omit when undefined"
 *  pattern the individual fields already follow. */
function renderXAxis(x: XAxisProps): string | null {
  const fields: string[] = [];
  if (x.label !== undefined) fields.push(`label: ${jsString(x.label)}`);
  if (x.domain !== undefined) fields.push(`domain: [${String(x.domain[0])}, ${String(x.domain[1])}]`);
  return fields.length === 0 ? null : `{ ${fields.join(", ")} }`;
}

/** Renders an FFT cell's `x_scale` object inline (C2 §5.3): `label`,
 *  `domain`, then `type`, always present — "the generator does emit
 *  `x.type`, always, for the same reason the `fft_params` keys are
 *  required" (C2 §5.3, R80 Q1). Never returns `null`: `type` alone makes
 *  the object always non-empty. */
function renderFftXAxis(x: FftXAxisProps): string {
  const fields: string[] = [];
  if (x.label !== undefined) fields.push(`label: ${jsString(x.label)}`);
  if (x.domain !== undefined) fields.push(`domain: [${String(x.domain[0])}, ${String(x.domain[1])}]`);
  fields.push(`type: ${jsString(x.type)}`);
  return `{ ${fields.join(", ")} }`;
}

/** Renders a `y_scale` object inline (C2 §5.3). Field order is `label`,
 *  `domain`, `type` — the grammar's `y_field` order. Returns `null` (never
 *  `"{}"`) when every field is undefined, for the same reason as
 *  `renderXAxis`. */
function renderYAxis(y: YAxisProps): string | null {
  const fields: string[] = [];
  if (y.label !== undefined) fields.push(`label: ${jsString(y.label)}`);
  if (y.domain !== undefined) fields.push(`domain: [${String(y.domain[0])}, ${String(y.domain[1])}]`);
  if (y.type !== undefined) fields.push(`type: ${jsString(y.type)}`);
  // `exponent` follows `type` and is emitted only alongside `type: "pow"`,
  // which it qualifies (ruling R215 item 5). An `exponent` on any other
  // type is not a shorter valid form — the parser rejects it, so the
  // generator must never produce one.
  if (y.type === "pow" && y.exponent !== undefined) fields.push(`exponent: ${String(y.exponent)}`);
  return fields.length === 0 ? null : `{ ${fields.join(", ")} }`;
}

/** Renders a mark's `channel_call` (C2 §5.3): `channel("name")`, or
 *  `channel("name", { lap: n })` when `lap` is a lap number. A `lap` of
 *  `null` or `undefined` means session scope, so the `{lap: ...}` object
 *  is omitted entirely — the grammar marks it fully optional, not
 *  "present with a null value." */
function renderChannelCall(m: MarkProps): string {
  const lapArg = m.lap === null || m.lap === undefined ? "" : `, { lap: ${String(m.lap)} }`;
  return `channel(${jsString(m.channel)}${lapArg})`;
}

/** Renders a mark's `mark_options` (C2 §5.3): the `x`/`y` pair — `y`
 *  always `"v"`, `x` either `"t"` (session time, the default) or `"tr"`
 *  (lap-relative time, ruling R215 items 4-5) — then optionally `stroke`,
 *  then optionally `strokeWidth`. */
function renderMarkOptions(m: MarkProps): string {
  // `x` binds the lap-relative column only when the mark asks for it;
  // omitting `xField` emits `x: "t"` exactly as this generator always has,
  // so no landed document changes on disk (C2 §5.3).
  const fields: string[] = [`x: ${jsString(m.xField ?? "t")}`, `y: "v"`];
  if (m.stroke !== undefined) fields.push(`stroke: ${jsString(m.stroke)}`);
  if (m.strokeWidth !== undefined) fields.push(`strokeWidth: ${String(m.strokeWidth)}`);
  return `{ ${fields.join(", ")} }`;
}

/** C2 §5.3's `zero_rule` production, verbatim (ruling R215 item 5) — the
 *  zero line's whole text, with no parameters of its own. A `const` rather
 *  than a function because there is nothing to render: `generate` emits
 *  exactly this string and `parse` matches exactly this token sequence. */
const ZERO_RULE = "Plot.ruleY([0])";

/** Renders one `mark` production (C2 §5.3): `Plot.<name>(channel(...), {...})`. */
function renderMark(m: MarkProps): string {
  return `Plot.${m.mark}(${renderChannelCall(m)}, ${renderMarkOptions(m)})`;
}

/** Renders one `window_size`/`hop_size` value (C2 §5.3): the literal string
 *  `"all"` quoted, or a sample count as a bare integer — never the reverse,
 *  so a hand-edit that swaps the two forms is caught by `parse`, not
 *  silently accepted here. */
function renderWindowOrHop(v: number | "all"): string {
  return v === "all" ? jsString(v) : String(v);
}

/** Renders a `spectrum_call`'s `fft_params` object (C2 §5.3): all six keys,
 *  in the grammar's fixed order, on one line — like `mark_options` today. */
function renderFftParams(fft: FftParams): string {
  const fields = [
    `windowSize: ${renderWindowOrHop(fft.windowSize)}`,
    `hopSize: ${renderWindowOrHop(fft.hopSize)}`,
    `window: ${jsString(fft.window)}`,
    `detrend: ${jsString(fft.detrend)}`,
    `scaling: ${jsString(fft.scaling)}`,
    `averaging: ${jsString(fft.averaging)}`,
  ];
  return `{ ${fields.join(", ")} }`;
}

/** Renders a `spectrum_mark`'s `spectrum_options` (C2 §5.3): the fixed
 *  `x`/`y` pair bound to `"f"`/`"m"`, then optionally `stroke`, then
 *  optionally `strokeWidth` — the same shape as `renderMarkOptions`, over
 *  the frequency/magnitude literal pair instead of time/value. */
function renderSpectrumOptions(m: SpectrumMarkProps): string {
  const fields: string[] = [`x: "f"`, `y: "m"`];
  if (m.stroke !== undefined) fields.push(`stroke: ${jsString(m.stroke)}`);
  if (m.strokeWidth !== undefined) fields.push(`strokeWidth: ${String(m.strokeWidth)}`);
  return `{ ${fields.join(", ")} }`;
}

/** Renders C2 §5.3's `spectrum_mark` production:
 *  `Plot.<mark>(spectrum("<channel>", {fft_params}), {spectrum_options})`. */
function renderSpectrumMark(m: SpectrumMarkProps): string {
  return `Plot.${m.mark}(spectrum(${jsString(m.channel)}, ${renderFftParams(m.fft)}), ${renderSpectrumOptions(m)})`;
}

/** Joins `topLines` into `Plot.plot({...})`'s body, per the generator's
 *  fixed formatting policy (two-space indent, comma between lines, no
 *  trailing newline) — shared by both chart-type branches. */
function renderPlotBody(topLines: string[]): string {
  const body = topLines.map((line, i) => `  ${line}${i < topLines.length - 1 ? "," : ""}`).join("\n");
  return `Plot.plot({\n${body}\n})`;
}

/** Emits a time cell's Plot code — byte-identical to what this generator
 *  emitted before the FFT chart-type discriminant existed (C2 §5.3: "no
 *  landed document changes on disk").
 *
 *  Emission order is fixed at the top level (`x`, `y`, `color`, `marks`)
 *  and within each mark's options (`x`, `y`, then optional `stroke`, then
 *  optional `strokeWidth`) because C2 §5.3 makes that order the condition
 *  for `generate(parse(code)) === code` to byte-round-trip (Task 3).
 *
 *  Formatting policy (this generator's choice, since C2 §5.3 does not
 *  stipulate one): two-space indent per nesting level, `Plot.plot({` at
 *  column 0, each top-level option at column 2, each `marks` entry at
 *  column 4 on its own line, and no trailing newline at the end of the
 *  returned string.
 *
 *  Never throws on a well-formed `TimePlotProps` — an empty `marks` array
 *  is legal per the grammar ("a plot with no marks is legal but
 *  pointless") and generates `marks: []` rather than a multi-line empty
 *  block. */
function generateTime(props: TimePlotProps): string {
  const topLines: string[] = [];
  // `title` first, so the generated code reads the way the picture does
  // — the chart's name above its axes. C2 §5.3 fixes this position, and
  // `parse` requires it for a byte-identical round trip.
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);

  // The zero line is a real mark, first in the array so it draws *under*
  // every data trace (Plot draws marks in order) rather than over them
  // (ruling R215 item 5).
  const markLines = props.marks.map((m) => `    ${renderMark(m)}`);
  if (props.zeroLine === true) markLines.unshift(`    ${ZERO_RULE}`);
  const marksLine = markLines.length === 0 ? "marks: []" : `marks: [\n${markLines.join(",\n")}\n  ]`;
  topLines.push(marksLine);

  return renderPlotBody(topLines);
}

/** Emits an FFT cell's Plot code (C2 §5.3's Example 5): top-level order
 *  `x`, `y`, `color`, `marks`; `x` always carries `type`; the single
 *  spectrum mark rendered at column 4, its `fft_params` object on one
 *  line. Same formatting policy as {@link generateTime}. */
function generateFft(props: FftPlotProps): string {
  const topLines: string[] = [];
  // `title` first, so the generated code reads the way the picture does
  // — the chart's name above its axes. C2 §5.3 fixes this position, and
  // `parse` requires it for a byte-identical round trip.
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  topLines.push(`x: ${renderFftXAxis(props.x)}`);
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);
  topLines.push(`marks: [\n    ${renderSpectrumMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Renders a `histogram_call`'s `histogram_params` object (C2 §5.3, ruling
 *  R215 item 2): all four keys, in the grammar's fixed order, on one line —
 *  like `fft_params` today. `symmetric` is emitted as the bare identifier
 *  `true`/`false`, the one place this grammar admits a boolean literal
 *  outside `color: { legend: true }`. */
function renderHistogramParams(h: HistogramParams): string {
  const fields = [
    `binMode: ${jsString(h.binMode)}`,
    `binValue: ${String(h.binValue)}`,
    `symmetric: ${String(h.symmetric)}`,
    `normalise: ${jsString(h.normalise)}`,
  ];
  return `{ ${fields.join(", ")} }`;
}

/** Renders a `histogram_mark`'s `histogram_options` (C2 §5.3, ruling R215
 *  item 2): the fixed triple `x1: "v0"`, `x2: "v1"`, `y: "n"` binding the
 *  bin's own two edges and its plotted value, then optionally `fill`, then
 *  optionally `fillOpacity`. A bar has an extent, not a position, which is
 *  why this triple is `x1`/`x2`/`y` rather than `mark_options`' `x`/`y`
 *  pair. */
function renderHistogramOptions(m: HistogramMarkProps): string {
  const fields: string[] = [`x1: "v0"`, `x2: "v1"`, `y: "n"`];
  if (m.fill !== undefined) fields.push(`fill: ${jsString(m.fill)}`);
  if (m.fillOpacity !== undefined) fields.push(`fillOpacity: ${String(m.fillOpacity)}`);
  return `{ ${fields.join(", ")} }`;
}

/** Renders C2 §5.3's `histogram_mark` production (ruling R215 item 2):
 *  `Plot.rectY(histogram("<channel>", {histogram_params}), {histogram_options})`.
 *  The mark name is fixed — see {@link HistogramMarkProps}' doc comment. */
function renderHistogramMark(m: HistogramMarkProps): string {
  return `Plot.rectY(histogram(${jsString(m.channel)}, ${renderHistogramParams(m.histogram)}), ${renderHistogramOptions(m)})`;
}

/** Emits a histogram cell's Plot code (C2 §5.3, ruling R215 item 2): the
 *  same top-level order and formatting policy as {@link generateFft}, over
 *  the single bar mark. Unlike the FFT arm, `x` is optional and carries no
 *  `type` — a histogram's x axis is the linear bin axis the engine's own
 *  `bin_edges` describe, so there is nothing for the document to choose. */
function generateHistogram(props: HistogramPlotProps): string {
  const topLines: string[] = [];
  // `title` first, so the generated code reads the way the picture does
  // — the chart's name above its axes. C2 §5.3 fixes this position, and
  // `parse` requires it for a byte-identical round trip.
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);
  topLines.push(`marks: [\n    ${renderHistogramMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Renders a `scatter_call`'s `scatter_params` object (C2 §5.3, ruling
 *  R215 item 3): both keys, in the grammar's fixed order, on one line. */
function renderScatterParams(s: ScatterParams): string {
  return `{ pointBudget: ${String(s.pointBudget)}, equalAspect: ${String(s.equalAspect)} }`;
}

/** Renders a `scatter_mark`'s `scatter_options` (C2 §5.3, ruling R215 item
 *  3): the fixed pair `x: "x"`, `y: "y"` binding the cloud's own two
 *  columns, then optionally `fill`, then optionally `r`. The literal names
 *  are `"x"`/`"y"` rather than `"t"`/`"v"` because neither axis is time —
 *  the same rule that makes a spectrum bind `"f"`/`"m"`. */
function renderScatterOptions(m: ScatterMarkProps): string {
  const fields: string[] = [`x: "x"`, `y: "y"`];
  if (m.fill !== undefined) fields.push(`fill: ${jsString(m.fill)}`);
  if (m.r !== undefined) fields.push(`r: ${String(m.r)}`);
  return `{ ${fields.join(", ")} }`;
}

/** Renders C2 §5.3's `scatter_mark` production (ruling R215 item 3):
 *  `Plot.dot(scatter("<x>", "<y>", {scatter_params}), {scatter_options})`.
 *  The mark name is fixed — see {@link ScatterMarkProps}' doc comment. */
function renderScatterMark(m: ScatterMarkProps): string {
  return `Plot.dot(scatter(${jsString(m.xChannel)}, ${jsString(m.yChannel)}, ${renderScatterParams(m.scatter)}), ${renderScatterOptions(m)})`;
}

/** Emits a scatter cell's Plot code (C2 §5.3, ruling R215 item 3): the same
 *  top-level order and formatting policy as {@link generateHistogram}, over
 *  the single dot mark. */
function generateScatter(props: ScatterPlotProps): string {
  const topLines: string[] = [];
  // `title` first, so the generated code reads the way the picture does
  // — the chart's name above its axes. C2 §5.3 fixes this position, and
  // `parse` requires it for a byte-identical round trip.
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);
  topLines.push(`marks: [\n    ${renderScatterMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Renders a `color_opt` object inline (C2 §5.3, widened by ruling R217):
 *  `legend` then `domain`. Returns `null` when both are absent, for the same
 *  reason `renderXAxis` does. */
function renderColor(c: ColorProps): string | null {
  const fields: string[] = [];
  if (c.legend === true) fields.push(`legend: true`);
  if (c.domain !== undefined) fields.push(`domain: [${String(c.domain[0])}, ${String(c.domain[1])}]`);
  return fields.length === 0 ? null : `{ ${fields.join(", ")} }`;
}

/** C2 §5.3's two `track_mark` productions, verbatim (ruling R217 item 1) —
 *  the track outline and its gates, both reading `trackGeometry` rather than
 *  a data call. Constants rather than functions because neither has a
 *  parameter: the colour is fixed so an underlay can never be mistaken for a
 *  trace, and a different colour is custom code. */
const TRACK_POLYLINE_MARK = `Plot.line(trackGeometry.polyline, {x:"x", y:"y", stroke:"var(--chart-underlay)"})`;
/** See {@link TRACK_POLYLINE_MARK}. */
const TRACK_GATES_MARK = `Plot.link(trackGeometry.gates, {x1:"x1", y1:"y1", x2:"x2", y2:"y2", stroke:"var(--chart-gate)"})`;

/** Renders a `trace_mark`'s `map_options` (C2 §5.3, ruling R217 item 1): the
 *  fixed pair `x: "x"`, `y: "y"` — metres east and north, never `"t"`/`"v"`,
 *  since neither axis is time — then optionally `stroke`, then optionally
 *  `strokeWidth`. */
function renderMapOptions(m: MapMarkProps): string {
  const fields: string[] = [`x: "x"`, `y: "y"`];
  if (m.stroke !== undefined) fields.push(`stroke: ${jsString(m.stroke)}`);
  if (m.strokeWidth !== undefined) fields.push(`strokeWidth: ${String(m.strokeWidth)}`);
  return `{ ${fields.join(", ")} }`;
}

/** Renders C2 §5.3's `trace_mark` production (ruling R217 item 1):
 *  `Plot.<line|dot>(gps("<channel>" | null), {map_options})`. The `null`
 *  argument is the bare identifier, never the string `"null"` — an
 *  uncoloured trace and a channel literally named "null" are different
 *  requests. */
function renderMapMark(m: MapMarkProps): string {
  const arg = m.colourBy === null ? "null" : jsString(m.colourBy);
  return `Plot.${m.mark}(gps(${arg}), ${renderMapOptions(m)})`;
}

/** Emits a map cell's Plot code (C2 §5.3, ruling R217 item 1). `aspectRatio:
 *  1` is always emitted, immediately before `marks`: equal aspect is a
 *  property of the projection, so the document states it and the parser
 *  refuses a map cell without it. The underlay marks come first in the array,
 *  under the traces, exactly as the zero line does in a time cell. */
function generateMap(props: MapPlotProps): string {
  const topLines: string[] = [];
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) {
    const renderedColor = renderColor(props.color);
    if (renderedColor !== null) topLines.push(`color: ${renderedColor}`);
  }
  topLines.push(`aspectRatio: 1`);

  const markLines = props.marks.map((m) => `    ${renderMapMark(m)}`);
  if (props.trackUnderlay === true) {
    markLines.unshift(`    ${TRACK_GATES_MARK}`);
    markLines.unshift(`    ${TRACK_POLYLINE_MARK}`);
  }
  topLines.push(markLines.length === 0 ? "marks: []" : `marks: [\n${markLines.join(",\n")}\n  ]`);

  return renderPlotBody(topLines);
}

/** Renders C2 §5.3's `lap_mark` production (ruling R217 item 3):
 *  `Plot.<barY|dot|lineY>(<identifier>, {x: "lap", y: "v"[, z: "w"]})`. The
 *  first argument is emitted bare, never quoted — it is a host variable, and
 *  quoting it would name a channel instead of a definition. */
function renderLapMark(m: LapMarkProps): string {
  const fields: string[] = [`x: "lap"`, `y: "v"`];
  if (m.seriesBy !== undefined) fields.push(`z: ${jsString(m.seriesBy)}`);
  return `Plot.${m.mark}(${m.definition}, { ${fields.join(", ")} })`;
}

/** Emits a lap-progression cell's Plot code (C2 §5.3, ruling R217 item 3):
 *  the same top-level order and formatting policy as {@link generateScatter},
 *  over the single lap mark. */
function generateLap(props: LapPlotProps): string {
  const topLines: string[] = [];
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) {
    const renderedColor = renderColor(props.color);
    if (renderedColor !== null) topLines.push(`color: ${renderedColor}`);
  }
  topLines.push(`marks: [\n    ${renderLapMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Renders C2 §5.3's `raster_mark` production (ruling R217 item 4):
 *  `Plot.image(spectrogram("<channel>", {fft_params}), {x:"x", y:"y",
 *  width:"iw", height:"ih", src:"src"})`. Both the mark name and the option
 *  object are fixed — a raster is pixels, and there is nothing to choose
 *  about how an image binds its own frame.
 *
 *  See `parse.ts`'s `readRasterMark` for why the size fields are `iw`/`ih`
 *  rather than the `w`/`h` C2 §5.3 first spelled: `w` is the window index
 *  `fx: "w"` facets by. */
function renderSpectrogramMark(m: SpectrogramMarkProps): string {
  const call = `spectrogram(${jsString(m.channel)}, ${renderFftParams(m.fft)})`;
  return `Plot.image(${call}, {x:"x", y:"y", width:"iw", height:"ih", src:"src"})`;
}

/** Emits a spectrogram cell's Plot code (C2 §5.3, ruling R217 item 4).
 *  `fx: "w"` is always emitted, immediately before `marks`: one raster per
 *  selected window, faceted, because pixels cannot interleave the way a
 *  channel's samples can. */
function generateSpectrogram(props: SpectrogramPlotProps): string {
  const topLines: string[] = [];
  if (props.title !== undefined) topLines.push(`title: ${jsString(props.title)}`);
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) {
    const renderedColor = renderColor(props.color);
    if (renderedColor !== null) topLines.push(`color: ${renderedColor}`);
  }
  topLines.push(`fx: "w"`);
  topLines.push(`marks: [\n    ${renderSpectrogramMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Emits C2 §5.3's Plot subset as JavaScript source code — a string
 *  builder, not a JS-AST printer, over the grammar's closed, small
 *  vocabulary. Branches on `props.chart`: a time cell emits exactly what
 *  this generator always has ({@link generateTime}); an FFT cell emits
 *  C2 §5.3's `spectrum(...)` production ({@link generateFft}); a histogram
 *  cell its `histogram(...)` production ({@link generateHistogram}, ruling
 *  R215 item 2). Written as a `switch` over the discriminant, not a ternary
 *  chain, so a chart kind added to `PlotProps` without a branch here is a
 *  compile error rather than a silent fall-through to the time arm. */
export function generate(props: PlotProps): string {
  switch (props.chart) {
    case "fft":
      return generateFft(props);
    case "histogram":
      return generateHistogram(props);
    case "scatter":
      return generateScatter(props);
    case "map":
      return generateMap(props);
    case "lap":
      return generateLap(props);
    case "spectrogram":
      return generateSpectrogram(props);
    case "time":
      return generateTime(props);
  }
}
