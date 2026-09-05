import type { MarkProps, PlotProps, XAxisProps, YAxisProps } from "./types";

/** Serializes a JS string literal for embedding in generated code via
 *  `JSON.stringify`, never manual quote-wrapping, so a label containing a
 *  quote or backslash cannot produce invalid code. */
function jsString(s: string): string {
  return JSON.stringify(s);
}

/** Renders an `x_scale` object inline (C2 §5.3), e.g.
 *  `{ label: "Time (s)" }`. Field order is `label`, `domain` — the
 *  grammar's `x_field` order. `type` is never emitted (see `types.ts`).
 *  Returns `null` (never `"{}"`) when every field is undefined — C2
 *  §5.3's `x_scale` never produces an empty object, so the caller omits
 *  the `x` key entirely, the same "omit when undefined" pattern the
 *  individual fields already follow. */
function renderXAxis(x: XAxisProps): string | null {
  const fields: string[] = [];
  if (x.label !== undefined) fields.push(`label: ${jsString(x.label)}`);
  if (x.domain !== undefined) fields.push(`domain: [${String(x.domain[0])}, ${String(x.domain[1])}]`);
  return fields.length === 0 ? null : `{ ${fields.join(", ")} }`;
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

/** Emits C2 §5.3's Plot subset as JavaScript source code — a string
 *  builder, not a JS-AST printer, over the grammar's closed, small
 *  vocabulary.
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
 *  Never throws on a well-formed `PlotProps` — an empty `marks` array is
 *  legal per the grammar ("a plot with no marks is legal but pointless")
 *  and generates `marks: []` rather than a multi-line empty block. */
export function generate(props: PlotProps): string {
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

  const body = topLines.map((line, i) => `  ${line}${i < topLines.length - 1 ? "," : ""}`).join("\n");
  return `Plot.plot({\n${body}\n})`;
}
