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
 * DOM, no IPC. `generate`/`parse` (Tasks 2–3) remain the only things that
 * produce or read the code string; this module only ever builds the next
 * `PlotProps` value.
 */
import { generate, parse, type MarkProps, type PlotProps, type XAxisProps, type YAxisProps } from "../plotForm";

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

/** The default single-mark `PlotProps` the form always seeds (C2 §5.3:
 *  "the form always seeds one mark") — used both as a brand-new cell's
 *  starting point and as "Reset to form"'s fallback when `parse` has
 *  never once succeeded for this cell (no `lastKnownProps` to regenerate
 *  from instead). `channel` is `channels`' first entry when one is
 *  available, or the empty string otherwise — `generate` never throws on
 *  an empty channel name, so this is always immediately generatable
 *  rather than a placeholder the caller must special-case. */
export function defaultPlotProps(channels: readonly { id: string }[]): PlotProps {
  return { marks: [{ channel: channels[0]?.id ?? "", mark: "lineY" }] };
}

/** The code "Reset to form" writes back: `generate` of `lastKnownProps`
 *  when one exists, or of {@link defaultPlotProps} otherwise (design §6 /
 *  this task's brief — never a no-op, even for a cell that started as
 *  hand-written custom code and has never once parsed). */
export function resetToFormCode(lastKnownProps: PlotProps | null, channels: readonly { id: string }[]): string {
  return generate(lastKnownProps ?? defaultPlotProps(channels));
}

/** Appends a new mark bound to `channel`, defaulting to the `lineY` mark
 *  type and session scope (`lap` omitted, per {@link MarkProps}'s own
 *  "omitted means session scope" convention — `updateMark` is how a
 *  caller then narrows it to a lap). */
export function addMark(props: PlotProps, channel: string): PlotProps {
  return { ...props, marks: [...props.marks, { channel, mark: "lineY" }] };
}

/** Removes the mark at `index`. A no-op (returns `props` unchanged) for
 *  an out-of-range `index`, so a caller wired to a stale index never
 *  corrupts unrelated marks. */
export function removeMark(props: PlotProps, index: number): PlotProps {
  if (index < 0 || index >= props.marks.length) return props;
  return { ...props, marks: props.marks.filter((_, i) => i !== index) };
}

/** Shallow-merges `patch` into the mark at `index`. A no-op for an
 *  out-of-range `index`. Setting a field to `undefined` in `patch` clears
 *  it (matches `MarkProps`' own "omitted = default" fields, e.g.
 *  `stroke`/`strokeWidth`/`lap`). */
export function updateMark(props: PlotProps, index: number, patch: Partial<MarkProps>): PlotProps {
  if (index < 0 || index >= props.marks.length) return props;
  return { ...props, marks: props.marks.map((m, i) => (i === index ? { ...m, ...patch } : m)) };
}

/** Moves the mark at `fromIndex` to `toIndex`, shifting the marks between
 *  them (array reorder, not a swap). A no-op for equal or out-of-range
 *  indices. */
export function moveMark(props: PlotProps, fromIndex: number, toIndex: number): PlotProps {
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
 *  absent from `PlotProps`, never `x: {}`). */
function isEmptyXAxis(x: XAxisProps): boolean {
  return x.label === undefined && x.domain === undefined;
}

/** True when every field of `y` is `undefined` (see {@link isEmptyXAxis}). */
function isEmptyYAxis(y: YAxisProps): boolean {
  return y.label === undefined && y.domain === undefined && y.type === undefined;
}

/** Shallow-merges `patch` into `props.x` (starting from `{}` if `props.x`
 *  is absent), then drops the `x` key entirely if the result is empty —
 *  matching `generate`, which can never emit `x: {}` (Task 2), so this
 *  function can never hand `generate` a value it would mis-render. */
export function updateXAxis(props: PlotProps, patch: Partial<XAxisProps>): PlotProps {
  const next: XAxisProps = { ...(props.x ?? {}), ...patch };
  if (isEmptyXAxis(next)) {
    const { x: _drop, ...rest } = props;
    return rest;
  }
  return { ...props, x: next };
}

/** Shallow-merges `patch` into `props.y`, dropping the `y` key entirely if
 *  the result is empty (see {@link updateXAxis}). */
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
 *  absent — the grammar admits no other value). */
export function setColorLegend(props: PlotProps, enabled: boolean): PlotProps {
  if (enabled) return { ...props, color: { legend: true } };
  const { color: _drop, ...rest } = props;
  return rest;
}
