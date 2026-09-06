/** One mark in the Properties form's state (C2 §5.3's `mark` production).
 *  `lap` is a 1-based lap number (C3 §3.2's `LapSummary.number`) or null
 *  for session scope; `strokeWidth` is in CSS pixels. */
export interface MarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY" | "rectY" | "ruleY";
  lap?: number | null;
  stroke?: string;      // any valid CSS colour literal
  strokeWidth?: number; // px
}

/** The five mark names `MarkProps.mark`'s union type admits, as a runtime
 *  array — a TS union isn't reflectable, so this is the single source both
 *  `parse.ts`'s grammar reader and any UI control (L6 Task 12's Properties
 *  form) enumerate against, rather than each hardcoding its own copy that
 *  could drift from `MarkProps.mark` or from each other. */
export const MARK_NAMES: readonly MarkProps["mark"][] = ["lineY", "dot", "areaY", "rectY", "ruleY"];

/** C2 §5.3's `x_scale` production for a **time** cell. `type` is
 *  intentionally absent — see the note below. An FFT cell's x axis is
 *  {@link FftXAxisProps} instead, a distinct type: it always carries
 *  `type` (C2 §5.3), which a time cell's x axis never does. */
export interface XAxisProps {
  label?: string;
  /** [min, max] in the channel's native x unit (seconds since session
   *  start, per §5.1). */
  domain?: [number, number];
}

/** C2 §5.3's `y_scale` production. Shared by both chart types — an FFT
 *  cell's magnitude/PSD axis and a time cell's value axis both admit the
 *  same three fields. */
export interface YAxisProps {
  label?: string;
  /** [min, max] in the plotted channel's native unit — channel-dependent,
   *  unlike x's fixed seconds-since-session-start (or, for an FFT cell,
   *  Hz). */
  domain?: [number, number];
  type?: "linear" | "log" | "sqrt";
}

/** The three y-axis scale types `YAxisProps.type`'s union type admits, as a
 *  runtime array — same rationale as {@link MARK_NAMES}: a UI control
 *  enumerates this rather than hardcoding a second copy. */
export const Y_AXIS_TYPES: readonly NonNullable<YAxisProps["type"]>[] = ["linear", "log", "sqrt"];

/** The mark names `SpectrumMarkProps.mark`'s union type admits, as a
 *  runtime array (C2 §5.3's `spectrum_mark_name` — a strict subset of
 *  {@link MARK_NAMES}, no `rectY`/`ruleY`), same rationale. */
export const SPECTRUM_MARK_NAMES: readonly SpectrumMarkProps["mark"][] = ["lineY", "dot", "areaY"];

/** `FftParams.window`'s union type, as a runtime array (C2 §5.3's `window_fn`). */
export const FFT_WINDOW_FUNCTIONS: readonly FftParams["window"][] = ["rectangular", "hann", "hamming"];

/** `FftParams.detrend`'s union type, as a runtime array (C2 §5.3's `detrend`). */
export const FFT_DETRENDS: readonly FftParams["detrend"][] = ["none", "mean", "linear"];

/** `FftParams.scaling`'s union type, as a runtime array (C2 §5.3's `scaling`). */
export const FFT_SCALINGS: readonly FftParams["scaling"][] = ["magnitude", "density"];

/** `FftParams.averaging`'s union type, as a runtime array (C2 §5.3's `averaging`). */
export const FFT_AVERAGINGS: readonly FftParams["averaging"][] = ["none", "mean", "median", "max"];

/** `FftXAxisProps.type`'s union type, as a runtime array (C2 §5.3's `x.type` in an FFT cell). */
export const FFT_X_AXIS_TYPES: readonly FftXAxisProps["type"][] = ["linear", "log"];

/** C2 §5.3's `fft_params` production — the six parameters of one FFT
 *  chart's spectrum, all required in this fixed order: "a missing key is
 *  custom code, not a default" (C2 §5.3). `windowSize`/`hopSize` are in
 *  samples, or the token `"all"` meaning the whole record (R79 Q1) — the
 *  host resolves `"all"` to the channel's `ChannelSummary.sample_count` at
 *  fetch time (`model/jsCellBinding.ts`'s `bindingFor`), never writing a
 *  resolved count back into the document. */
export interface FftParams {
  /** samples, or `"all"` for the whole record. */
  windowSize: number | "all";
  /** samples, or `"all"` for the whole record. */
  hopSize: number | "all";
  window: "rectangular" | "hann" | "hamming";
  detrend: "none" | "mean" | "linear";
  scaling: "magnitude" | "density";
  averaging: "none" | "mean" | "median" | "max";
}

/** One FFT cell's single spectrum mark (C2 §5.3's `spectrum_mark`
 *  production). An FFT cell has exactly one of these, by type — not a
 *  `marks` array with a runtime "exactly one" check (R79 Q7). */
export interface SpectrumMarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY";
  fft: FftParams;
  stroke?: string;      // any valid CSS colour literal
  strokeWidth?: number; // px
}

/** C2 §5.3's FFT `x_scale` production. `type` is required and always
 *  emitted by `generate` — "for the same reason the `fft_params` keys are
 *  required" (C2 §5.3) — unlike a time cell's {@link XAxisProps}, which
 *  never carries `type` at all (R80 Q1: `x` itself is required in the FFT
 *  arm so `parse(generate(p)) === p` holds for every `p` the form can
 *  produce). */
export interface FftXAxisProps {
  label?: string;
  /** [min, max] in Hz. */
  domain?: [number, number];
  type: "linear" | "log";
}

/** C2 §5.3's time-cell `plot_options` production. */
export interface TimePlotProps {
  chart: "time";
  /** Required; the form always seeds one mark (C2 §5.3). */
  marks: MarkProps[];
  x?: XAxisProps;
  y?: YAxisProps;
  color?: { legend: true };
}

/** C2 §5.3's FFT-cell `plot_options` production. `mark` (singular, not
 *  `marks`) makes "exactly one spectrum mark" a type error rather than a
 *  runtime check (C2 §5.3: "A discriminated union rather than an optional
 *  field"). `x` is required, with a required `type` (R80 Q1). */
export interface FftPlotProps {
  chart: "fft";
  mark: SpectrumMarkProps;
  x: FftXAxisProps;
  y?: YAxisProps;
  color?: { legend: true };
}

/** C2 §5.3's `plot_options` production — the Properties pane's whole
 *  internal state for one `js` cell in the `plotForm` subset. A
 *  discriminated union on `chart`: a cell is a time cell or an FFT cell,
 *  never both (C2 §5.3, "A cell is a time cell or an FFT cell, never
 *  both"). Every existing time-cell literal in this lane gained the
 *  `chart: "time"` discriminant when this union was introduced (L6 Task
 *  20) — the time branch of `generate`/`parse` is otherwise unchanged, so
 *  every landed document round-trips byte-identically to before.
 *
 *  `XAxisProps` (the time-cell x scale) is deliberately absent a `type`
 *  field: C2 §5.3 says the generator never emits it for a time cell (the
 *  grammar's `x_field` allows only the literal `"linear"`, reserved for a
 *  future non-time x-axis, C2 §8-2 — now realised as the FFT cell's own
 *  {@link FftXAxisProps}, a distinct type, not a widened `XAxisProps`). */
export type PlotProps = TimePlotProps | FftPlotProps;
