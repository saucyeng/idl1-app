import type { FftParams, FftPlotProps, FftXAxisProps, MarkProps, PlotProps, SpectrumMarkProps, TimePlotProps, XAxisProps, YAxisProps } from "./types";

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

/** Renders a mark's `mark_options` (C2 §5.3): the fixed `x`/`y` pair,
 *  then optionally `stroke`, then optionally `strokeWidth`. */
function renderMarkOptions(m: MarkProps): string {
  const fields: string[] = [`x: "t"`, `y: "v"`];
  if (m.stroke !== undefined) fields.push(`stroke: ${jsString(m.stroke)}`);
  if (m.strokeWidth !== undefined) fields.push(`strokeWidth: ${String(m.strokeWidth)}`);
  return `{ ${fields.join(", ")} }`;
}

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
  if (props.x !== undefined) {
    const renderedX = renderXAxis(props.x);
    if (renderedX !== null) topLines.push(`x: ${renderedX}`);
  }
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);

  const marksLine =
    props.marks.length === 0
      ? "marks: []"
      : `marks: [\n${props.marks.map((m) => `    ${renderMark(m)}`).join(",\n")}\n  ]`;
  topLines.push(marksLine);

  return renderPlotBody(topLines);
}

/** Emits an FFT cell's Plot code (C2 §5.3's Example 5): top-level order
 *  `x`, `y`, `color`, `marks`; `x` always carries `type`; the single
 *  spectrum mark rendered at column 4, its `fft_params` object on one
 *  line. Same formatting policy as {@link generateTime}. */
function generateFft(props: FftPlotProps): string {
  const topLines: string[] = [`x: ${renderFftXAxis(props.x)}`];
  if (props.y !== undefined) {
    const renderedY = renderYAxis(props.y);
    if (renderedY !== null) topLines.push(`y: ${renderedY}`);
  }
  if (props.color !== undefined) topLines.push(`color: { legend: true }`);
  topLines.push(`marks: [\n    ${renderSpectrumMark(props.mark)}\n  ]`);

  return renderPlotBody(topLines);
}

/** Emits C2 §5.3's Plot subset as JavaScript source code — a string
 *  builder, not a JS-AST printer, over the grammar's closed, small
 *  vocabulary. Branches on `props.chart`: a time cell emits exactly what
 *  this generator always has ({@link generateTime}); an FFT cell emits
 *  C2 §5.3's `spectrum(...)` production ({@link generateFft}). */
export function generate(props: PlotProps): string {
  return props.chart === "fft" ? generateFft(props) : generateTime(props);
}
