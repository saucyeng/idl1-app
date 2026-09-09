/**
 * Pure state logic for the Properties pane (design §6, D13). This module
 * holds every rule for turning a cell's `code` string into form state and
 * back — parse/custom detection, "last known props" tracking across
 * `code` changes, and every control's props-to-props edit — so
 * `components/PropertiesForm.tsx` only wires DOM events to these
 * functions and renders their result (CLAUDE.md §4: UI rendering itself
 * is not unit-tested, but this module, the pane's whole logic surface
 * beyond `plotForm` itself, is).
 *
 * Every function here is synchronous and side-effect free: no React, no
 * DOM, no IPC. `generate`/`parse` (Tasks 2–3, widened for the FFT chart at
 * L6 Task 20) remain the only things that produce or read the code string;
 * this module only ever builds the next `PlotProps` value.
 */
import {
  FFT_SCALING_OPTIONS,
  generate,
  parse,
  type FftParams,
  type FftPlotProps,
  type MarkProps,
  type PlotProps,
  type TimePlotProps,
  type XAxisProps,
  type YAxisProps,
} from "../plotForm";

/** The form's derived view of one render's `code` prop (design §6:
 *  "Code outside [the generated subset] ... greys the pane to custom
 *  code"). `props` is `null` exactly when `isCustom` is true — the pane
 *  renders its controls from `props` only when non-null. */
export interface FormViewState {
  /** True when `parse(code)` returned `null`: `code` falls outside the
   *  `plotForm` subset and the pane must grey to "custom code". */
  isCustom: boolean;
  /** The parsed props to render controls from, or `null` when custom. */
  props: PlotProps | null;
}

/** The form's full state across renders: the current view, plus the last
 *  `PlotProps` a successful `parse` produced for this cell (or `null` if
 *  `parse` has never once succeeded). `lastKnownProps` is what "Reset to
 *  form" regenerates from — it survives a run of custom-code renders so a
 *  reset after several hand edits still recovers the last form-authored
 *  shape rather than nothing. */
export interface PropertiesFormState {
  view: FormViewState;
  lastKnownProps: PlotProps | null;
}

/** The state a brand-new `PropertiesForm` instance starts from, before its
 *  first `code` prop has been examined. */
export const INITIAL_FORM_STATE: PropertiesFormState = {
  view: { isCustom: true, props: null },
  lastKnownProps: null,
};

/** Derives {@link FormViewState} for one `code` value. Called on every
 *  render, not just mount (design §6: "bidirectional inside that
 *  subset" — an external Code-pane edit must be reflected here
 *  immediately); cheap, since `parse` is a small hand-rolled
 *  recursive-descent reader over a closed grammar, not a general JS
 *  parser. */
export function deriveFormViewState(code: string): FormViewState {
  const props = parse(code);
  return props === null ? { isCustom: true, props: null } : { isCustom: false, props };
}

/** Advances {@link PropertiesFormState} to reflect a new `code` value:
 *  re-derives the view, and updates `lastKnownProps` only when this
 *  render's parse succeeded (a custom-code render never overwrites the
 *  last known good props — that would defeat the point of "last known"). */
export function advanceFormState(prevState: PropertiesFormState, code: string): PropertiesFormState {
  const view = deriveFormViewState(code);
  const lastKnownProps = view.props ?? prevState.lastKnownProps;
  return { view, lastKnownProps };
}

/** The default single-mark `TimePlotProps` the form always seeds (C2 §5.3:
 *  "the form always seeds one mark") — used both as a brand-new cell's
 *  starting point and as "Reset to form"'s fallback when `parse` has
 *  never once succeeded for this cell (no `lastKnownProps` to regenerate
 *  from instead). `channel` is `channels`' first entry when one is
 *  available, or the empty string otherwise — `generate` never throws on
 *  an empty channel name, so this is always immediately generatable
 *  rather than a placeholder the caller must special-case. */
export function defaultPlotProps(channels: readonly { id: string }[]): PlotProps {
  return { chart: "time", marks: [{ channel: channels[0]?.id ?? "", mark: "lineY" }] };
}

/** The default single-spectrum-mark `FftPlotProps` a chart-type switch (or
 *  a brand-new FFT cell) seeds (C2 §5.3's parameter table's defaults):
 *  `windowSize: 2048`, `hopSize: 1024` (50% overlap), `window: "hann"`,
 *  `detrend: "mean"`, `scaling: "raw_magnitude"`, `averaging: "mean"`;
 *  `x.type` seeds `"log"` and `x.label` seeds `"Frequency (Hz)"` (this
 *  task's brief, matching C2 §5.3's parameter table). `channel` is
 *  `channels`' first entry when one is available, or the empty string
 *  otherwise, mirroring {@link defaultPlotProps}. */
export function defaultFftPlotProps(channels: readonly { id: string; label: string; unit?: string }[]): FftPlotProps {
  const props: FftPlotProps = {
    chart: "fft",
    mark: {
      channel: channels[0]?.id ?? "",
      mark: "lineY",
      fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
    },
    x: { label: "Frequency (Hz)", type: "log" },
  };
  const label = suggestSpectrumAxisLabel(channels[0], "raw_magnitude");
  if (label !== undefined) props.y = { label };
  return props;
}

/** The code "Reset to form" writes back: `generate` of `lastKnownProps`
 *  when one exists, or of {@link defaultPlotProps} otherwise (design §6 /
 *  this task's brief — never a no-op, even for a cell that started as
 *  hand-written custom code and has never once parsed). */
export function resetToFormCode(lastKnownProps: PlotProps | null, channels: readonly { id: string }[]): string {
  return generate(lastKnownProps ?? defaultPlotProps(channels));
}

/** Suggests a y-axis label for a newly picked channel: `"<label> (<unit>)"`
 *  when `channel.unit` is present and non-empty, or `undefined` otherwise
 *  (ruling R65: no quantity→unit table exists in TypeScript, so this reads
 *  straight off the channel's own recorded unit — C1 §4.1's
 *  `ChannelSummary.unit` — rather than a per-quantity si/imperial choice;
 *  `unitsPreference` has no effect in wave 2). The result is a plain,
 *  editable starting value for the label field, never a locked or
 *  recomputed display (C2 §1: "no v3 construct converts units") — the
 *  caller writes it into `y.label` exactly once, when the channel is
 *  picked, the same way any other field value is set. */
export function suggestAxisLabel(channel: { label: string; unit?: string } | undefined): string | undefined {
  if (channel === undefined || channel.unit === undefined || channel.unit === "") {
    return undefined;
  }
  return `${channel.label} (${channel.unit})`;
}

/** Suggests an FFT cell's y-axis label per scaling (R79 Q5, widened by
 *  R167/R168 to the maths language's three names): `"PSD (<unit>²/Hz)"` for
 *  `"density"`, `"Power (<unit>²)"` for `"spectrum"`, `"Magnitude (<unit>)"`
 *  for `"raw_magnitude"` and for the retired `"magnitude"` spelling — the
 *  three labels match C2 §3.3.1's rule exactly
 *  (`core/src/math/units.rs::spectral_rule`). `undefined` when the channel
 *  has no recorded unit (same "no v3 construct converts units" rule as
 *  {@link suggestAxisLabel} — this is a plain string concatenation of the
 *  unit the engine already supplied, never a conversion). An ordinary
 *  editable suggestion on R65's existing seed path, not a locked display:
 *  the caller writes it into `y.label` once, on the channel pick or on a
 *  scaling change, and never overwrites a label the author already typed.
 *  Written as an exhaustive switch, not a ternary chain, so a future fourth
 *  name is a compile error rather than a silent fall-through to
 *  Magnitude. */
export function suggestSpectrumAxisLabel(
  channel: { label: string; unit?: string } | undefined,
  scaling: FftParams["scaling"]
): string | undefined {
  if (channel === undefined || channel.unit === undefined || channel.unit === "") {
    return undefined;
  }
  const unit = channel.unit;
  switch (scaling) {
    case "density":
      return `PSD (${unit}²/Hz)`;
    case "spectrum":
      return `Power (${unit}²)`;
    case "raw_magnitude":
    case "magnitude":
      return `Magnitude (${unit})`;
  }
}

/** Segment overlap as a percentage, for display only (R79 Q3): the
 *  document and the grammar keep `hopSize` in samples, C3's own unit — this
 *  function derives a friendlier read-only figure beside it, never written
 *  back into `props`. `null` when either value is `"all"` (no segmentation
 *  to speak an overlap of — a whole-record request is one segment) or when
 *  `windowSize`/`hopSize` are not both positive (a value the user is
 *  mid-typing, or a stored value of zero — meaningless to describe as a
 *  percentage rather than clamped to zero). */
export function overlapPercent(windowSize: number | "all", hopSize: number | "all"): number | null {
  if (windowSize === "all" || hopSize === "all") return null;
  if (!(windowSize > 0) || !(hopSize > 0)) return null;
  return ((windowSize - hopSize) / windowSize) * 100;
}

/** Switches chart type, preserving the channel selection and otherwise
 *  regenerating from that type's defaults (R79 Q6: no confirmation and no
 *  dialog — a one-click undo by switching back, unlike custom code, which
 *  is unrecoverable).
 *
 *  The channel carried across is the **first** mark's channel (R80 Q6):
 *  `Time → FFT` seeds the FFT arm's one spectrum mark on `props.marks[0]`'s
 *  channel (or `channels[0]` if the time cell had no marks); `FFT → Time`
 *  seeds one time mark on the spectrum's channel. This reuses the same
 *  "first mark drives it" convention {@link suggestAxisLabel}'s call site
 *  already documents, rather than inventing a second rule for this
 *  switch. Switching to the chart type `props` already has is a no-op
 *  (returns `props` unchanged) — there is nothing to preserve across a
 *  switch that isn't happening. */
export function setChartType(
  props: PlotProps,
  next: "time" | "fft",
  channels: readonly { id: string; label: string; unit?: string }[]
): PlotProps {
  if (props.chart === "time" && next === "fft") {
    const channelId = props.marks[0]?.channel ?? channels[0]?.id ?? "";
    const channel = channels.find((c) => c.id === channelId);
    const seed = defaultFftPlotProps(channels);
    const label = suggestSpectrumAxisLabel(channel, seed.mark.fft.scaling);
    const withChannel: FftPlotProps = { ...seed, mark: { ...seed.mark, channel: channelId } };
    if (label !== undefined) withChannel.y = { label };
    else delete withChannel.y;
    return withChannel;
  }

  if (props.chart === "fft" && next === "time") {
    const channelId = props.mark.channel;
    const seed = defaultPlotProps(channels) as TimePlotProps;
    return { ...seed, marks: [{ ...seed.marks[0], channel: channelId }] };
  }

  return props;
}

/** Patches the six FFT parameters. Setting `averaging: "none"` forces
 *  `windowSize`/`hopSize` to `"all"` in the same returned value — R76's
 *  single-segment rule made unreachable-by-construction rather than shown
 *  later as a server error (C2 §5.3 control 8): the caller never has a
 *  chance to combine `averaging: "none"` with a sample-count window/hop
 *  through this form. A patch that both sets `averaging: "none"` and an
 *  explicit `windowSize`/`hopSize` has the explicit value overridden by
 *  the forcing rule, since forcing is unconditional whenever the resulting
 *  `averaging` is `"none"` — including when `averaging` itself is not part
 *  of this patch but the mark's *current* `averaging` already is `"none"`
 *  (e.g. a hop-size edit arriving while `"none"` is selected), so the
 *  invariant holds continuously, not only at the moment `"none"` is
 *  picked. */
export function updateFftParams(props: FftPlotProps, patch: Partial<FftParams>): FftPlotProps {
  const merged: FftParams = { ...props.mark.fft, ...patch };
  if (merged.averaging === "none") {
    merged.windowSize = "all";
    merged.hopSize = "all";
  }
  return { ...props, mark: { ...props.mark, fft: merged } };
}

/** The scaling `<option>` values the Properties pane's scaling `<select>`
 *  renders for one FFT cell's current `scaling` (this task's brief): the
 *  three offered scalings ({@link FFT_SCALING_OPTIONS}), plus the retired
 *  `"magnitude"` spelling appended, **for this render only**, when the cell
 *  is currently on it. An HTML `<select>` with a `value` that matches none
 *  of its `<option>`s silently displays its first option instead — without
 *  this, a `"magnitude"` cell would render as "Density (PSD)" and the next
 *  unrelated edit would write that lie back. Picking anything else from the
 *  rendered list drops the appended option; the caller never has to special
 *  case it beyond rendering what this returns. Pure so `PropertiesForm.tsx`
 *  need not be rendered to test it (CLAUDE.md §4: UI rendering itself is
 *  not unit-tested, but the logic behind it is). */
export function fftScalingSelectOptions(current: FftParams["scaling"]): readonly FftParams["scaling"][] {
  return current === "magnitude" ? [...FFT_SCALING_OPTIONS, "magnitude"] : FFT_SCALING_OPTIONS;
}

/** Appends a new mark bound to `channel`, defaulting to the `lineY` mark
 *  type and session scope (`lap` omitted, per {@link MarkProps}'s own
 *  "omitted means session scope" convention — `updateMark` is how a
 *  caller then narrows it to a lap). Time cells only: an FFT cell has
 *  exactly one mark by type (`FftPlotProps.mark`, singular), so adding a
 *  second is a type error, not a runtime concern. */
export function addMark(props: TimePlotProps, channel: string): TimePlotProps {
  return { ...props, marks: [...props.marks, { channel, mark: "lineY" }] };
}

/** Removes the mark at `index`. A no-op (returns `props` unchanged) for
 *  an out-of-range `index`, so a caller wired to a stale index never
 *  corrupts unrelated marks. Time cells only, see {@link addMark}. */
export function removeMark(props: TimePlotProps, index: number): TimePlotProps {
  if (index < 0 || index >= props.marks.length) return props;
  return { ...props, marks: props.marks.filter((_, i) => i !== index) };
}

/** Shallow-merges `patch` into the mark at `index`. A no-op for an
 *  out-of-range `index`. Setting a field to `undefined` in `patch` clears
 *  it (matches `MarkProps`' own "omitted = default" fields, e.g.
 *  `stroke`/`strokeWidth`/`lap`). Time cells only, see {@link addMark}. */
export function updateMark(props: TimePlotProps, index: number, patch: Partial<MarkProps>): TimePlotProps {
  if (index < 0 || index >= props.marks.length) return props;
  return { ...props, marks: props.marks.map((m, i) => (i === index ? { ...m, ...patch } : m)) };
}

/** Moves the mark at `fromIndex` to `toIndex`, shifting the marks between
 *  them (array reorder, not a swap). A no-op for equal or out-of-range
 *  indices. Time cells only, see {@link addMark}. */
export function moveMark(props: TimePlotProps, fromIndex: number, toIndex: number): TimePlotProps {
  const n = props.marks.length;
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) return props;
  const marks = [...props.marks];
  const [moved] = marks.splice(fromIndex, 1);
  marks.splice(toIndex, 0, moved);
  return { ...props, marks };
}

/** True when every field of `x` is `undefined` — the "empty axis object"
 *  case `generate`/`parse` both normalise away (Task 2/3's own
 *  convention: an all-undefined axis is represented by the key being
 *  absent from `PlotProps`, never `x: {}`). Time cells only: an FFT cell's
 *  `x` always carries `type` (R80 Q1) and so is never empty. */
function isEmptyXAxis(x: XAxisProps): boolean {
  return x.label === undefined && x.domain === undefined;
}

/** True when every field of `y` is `undefined` (see {@link isEmptyXAxis}). */
function isEmptyYAxis(y: YAxisProps): boolean {
  return y.label === undefined && y.domain === undefined && y.type === undefined;
}

/** Shallow-merges `patch` into `props.x` (starting from `{}` if `props.x`
 *  is absent), then drops the `x` key entirely if the result is empty —
 *  matching `generate`, which can never emit `x: {}` for a **time** cell
 *  (Task 2), so this function can never hand `generate` a value it would
 *  mis-render. Generic over the chart-type union: for an FFT cell, `x` is
 *  `FftXAxisProps` (always carrying `type`, never empty) and this function
 *  only ever patches `label`/`domain` on it, leaving `type` untouched — a
 *  caller sets `type` through the dedicated `x.type` control instead. */
export function updateXAxis(props: PlotProps, patch: Partial<Pick<XAxisProps, "label" | "domain">>): PlotProps {
  if (props.chart === "fft") {
    return { ...props, x: { ...props.x, ...patch } };
  }
  const next: XAxisProps = { ...(props.x ?? {}), ...patch };
  if (isEmptyXAxis(next)) {
    const { x: _drop, ...rest } = props;
    return rest;
  }
  return { ...props, x: next };
}

/** Sets an FFT cell's `x.type` (Lin/Log control, C2 §5.3's twelfth-listed
 *  control #10) — the one `x` field {@link updateXAxis} does not touch,
 *  since a time cell's `x` has no `type` field at all. */
export function updateFftXAxisType(props: FftPlotProps, type: "linear" | "log"): FftPlotProps {
  return { ...props, x: { ...props.x, type } };
}

/** Shallow-merges `patch` into `props.y`, dropping the `y` key entirely if
 *  the result is empty (see {@link updateXAxis}). Generic over the
 *  chart-type union: both `TimePlotProps` and `FftPlotProps` share the
 *  same optional `YAxisProps` shape. */
export function updateYAxis(props: PlotProps, patch: Partial<YAxisProps>): PlotProps {
  const next: YAxisProps = { ...(props.y ?? {}), ...patch };
  if (isEmptyYAxis(next)) {
    const { y: _drop, ...rest } = props;
    return rest;
  }
  return { ...props, y: next };
}

/** Sets or clears the plot's colour legend (C2 §5.3's `color_opt`, the
 *  form's one checkbox-shaped control: `{ legend: true }` or entirely
 *  absent — the grammar admits no other value). Generic over the
 *  chart-type union: both chart types share the same optional `color`
 *  field. */
export function setColorLegend(props: PlotProps, enabled: boolean): PlotProps {
  if (enabled) return { ...props, color: { legend: true } };
  const { color: _drop, ...rest } = props;
  return rest;
}
