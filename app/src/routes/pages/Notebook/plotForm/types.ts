/** One mark in the Properties form's state (C2 §5.3's `mark` production).
 *  `lap` is a 1-based lap number (C3 §3.2's `LapSummary.number`) or null
 *  for session scope; `strokeWidth` is in CSS pixels. */
export interface MarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY" | "rectY" | "ruleY";
  lap?: number | null;
  /**
   * Which time column this mark's x axis binds (C2 §5.3's
   * `x_field_binding`, ruling R215 items 4-5). **Absent means session
   * time** — `x: "t"`, seconds since the session's first sample, what
   * every landed document says and what `generate` emits when this field
   * is omitted. The one other value, `"tr"`, binds the lap-relative
   * column: seconds since *this sample's own selected window* began
   * (`host/protocol.ts`'s `combineChannelWindows`), so *n* selected laps
   * superimpose instead of sitting end to end. That is the axis idl0's
   * lap-pair overlay and variance trace both drew on.
   *
   * Typed as the single value rather than `"t" | "tr"` for the same reason
   * `lap` is "omitted = session scope": with only `"tr"` expressible, the
   * absent case has exactly one spelling and `parse(generate(p))` is
   * deep-equal to `p` with no normalisation step.
   *
   * There is deliberately **no distance value.** Wheel/GPS distance on X
   * is disabled with its reason (ruling R136) — a naive cumulative
   * distance axis misaligns two laps that took different lines through the
   * same corner, and a grammar slot for it would be a promise the engine
   * cannot keep. `model/xMode.ts`'s `DISTANCE_X_MODE_DISABLED_REASON` is
   * what the Properties pane shows instead.
   */
  xField?: "tr";
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
  /**
   * Plot's own scale type. `"pow"` (ruling R215 item 5) is how idl0's
   * signed-root and signed-square y scales (`worksheet.dart`'s
   * `sqrtSigned`/`squareSigned`) are expressed: d3's power scale — which
   * Plot's `"pow"` is — is **symmetric about zero**, so it compresses or
   * expands compression and rebound equally rather than folding one side
   * away the way `"sqrt"` does on a signed channel. A `"pow"` axis always
   * carries {@link exponent}; no other type ever does.
   */
  type?: "linear" | "log" | "sqrt" | "pow";
  /** Plot's `exponent`, required with `type: "pow"` and expressible with no
   *  other type (C2 §5.3, ruling R215 item 5). `0.5` is the signed root,
   *  `2` the signed square — but any positive number is legal: the two
   *  named choices are what the Properties pane *offers*, not what the
   *  grammar admits. */
  exponent?: number;
}

/** The four y-axis scale types `YAxisProps.type`'s union type admits, as a
 *  runtime array — same rationale as {@link MARK_NAMES}: a UI control
 *  enumerates this rather than hardcoding a second copy. Note that a
 *  *picker* does not offer these verbatim: `"pow"` is meaningless without
 *  an exponent, so the Properties pane offers the two named signed scales
 *  instead (`model/propertiesForm.ts`'s `Y_SCALE_CHOICES`). */
export const Y_AXIS_TYPES: readonly NonNullable<YAxisProps["type"]>[] = ["linear", "log", "sqrt", "pow"];

/** The mark names `SpectrumMarkProps.mark`'s union type admits, as a
 *  runtime array (C2 §5.3's `spectrum_mark_name` — a strict subset of
 *  {@link MARK_NAMES}, no `rectY`/`ruleY`), same rationale. */
export const SPECTRUM_MARK_NAMES: readonly SpectrumMarkProps["mark"][] = ["lineY", "dot", "areaY"];

/** `FftParams.window`'s union type, as a runtime array (C2 §5.3's `window_fn`). */
export const FFT_WINDOW_FUNCTIONS: readonly FftParams["window"][] = ["rectangular", "hann", "hamming"];

/** `FftParams.detrend`'s union type, as a runtime array (C2 §5.3's `detrend`). */
export const FFT_DETRENDS: readonly FftParams["detrend"][] = ["none", "mean", "linear"];

/** Every spelling `FftParams.scaling` **accepts** when parsing stored cell
 *  code (C2 §5.3's `scaling`, widened by ruling R167/R168): the maths
 *  language's three current names plus the retired `"magnitude"` spelling a
 *  pre-R167 workbook may still carry. `plotForm/parse.ts`'s grammar reader
 *  uses this one, unchanged, so an old cell keeps round-tripping. Not for a
 *  picker — see {@link FFT_SCALING_OPTIONS} for what a control offers. */
export const FFT_SCALINGS: readonly FftParams["scaling"][] = ["density", "spectrum", "raw_magnitude", "magnitude"];

/** The three scalings a picker **offers** (C2 §5.3's `scaling`, ruling
 *  R167/R168) — the maths language's current names, with the retired
 *  `"magnitude"` spelling deliberately excluded (R168: accepted, never
 *  offered). `components/PropertiesForm.tsx`'s scaling `<select>` renders
 *  this. */
export const FFT_SCALING_OPTIONS: readonly FftParams["scaling"][] = ["density", "spectrum", "raw_magnitude"];

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
  scaling: "density" | "spectrum" | "raw_magnitude" | "magnitude";
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
  /**
   * The chart's own title, rendered centred above the plot (R216's chrome,
   * `components/CellFrame.tsx`'s `title` prop). Optional; absent means the
   * cell falls back to its `# label:` line, which stays exactly as it was
   * — an explicit title simply wins (`model/chartTitle.ts`).
   *
   * `title` is a real Plot option, so the generated code stays idiomatic
   * Plot that draws its own title when run anywhere else. It is a
   * **plot-level** option, not a mark's, which is why it sits beside
   * `x`/`y`/`color` rather than inside a mark.
   */
  title?: string;

  /**
   * Draw a horizontal reference line at y = 0 (idl0's zero-line toggle,
   * `worksheet.dart`; ruling R215 item 5). Emitted as a real
   * `Plot.ruleY([0])` at the head of `marks`, not as a plot option — it
   * *is* a mark, and writing it as one keeps the generated code idiomatic
   * Plot that an author can read and hand-edit. `true` or entirely absent;
   * the grammar admits no other value, exactly like `color.legend`.
   *
   * Only a **time** cell has this. A spectrum's magnitude axis has no
   * meaningful zero crossing, a histogram's bars already sit on their own
   * baseline, and a scatter's zero line would be the friction circle's
   * centre, which `equalAspect` already frames.
   */
  zeroLine?: true;
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
  /**
   * The chart's own title, rendered centred above the plot (R216's chrome,
   * `components/CellFrame.tsx`'s `title` prop). Optional; absent means the
   * cell falls back to its `# label:` line, which stays exactly as it was
   * — an explicit title simply wins (`model/chartTitle.ts`).
   *
   * `title` is a real Plot option, so the generated code stays idiomatic
   * Plot that draws its own title when run anywhere else. It is a
   * **plot-level** option, not a mark's, which is why it sits beside
   * `x`/`y`/`color` rather than inside a mark.
   */
  title?: string;
}

/** `HistogramParams.binMode`'s union type, as a runtime array (C2 §5.3's
 *  `bin_mode`, ruling R215 item 2). */
export const HISTOGRAM_BIN_MODES: readonly HistogramParams["binMode"][] = ["count", "width"];

/** `HistogramParams.normalise`'s union type, as a runtime array (C2 §5.3's
 *  `normalise`, ruling R215 item 2). */
export const HISTOGRAM_NORMALISATIONS: readonly HistogramParams["normalise"][] = ["counts", "fraction"];

/** C2 §5.3's `histogram_params` production — the four parameters of one
 *  histogram chart, all required in this fixed order, for the same reason
 *  {@link FftParams}' six are: "a missing key is custom code, not a
 *  default" (C2 §5.3). Maps one-for-one onto C3 §3.6's
 *  `HistogramParams` wire shape (`binMode`→`bin_mode`,
 *  `binValue`→`bin_value`), which is the only place the two spellings
 *  differ. */
export interface HistogramParams {
  /** How {@link binValue} is read: a bin **count**, or a bin **width** in
   *  the channel's own unit that the engine resolves to a count. */
  binMode: "count" | "width";
  /** A bin count (a positive integer, at most C3 §3.6's `MAX_HISTOGRAM_BINS`)
   *  under `binMode: "count"`; a bin width in the channel's own unit under
   *  `"width"`. One slot for both so the grammar has one production, not
   *  two mutually exclusive keys whose "exactly one present" rule the
   *  parser would have to enforce by hand. */
  binValue: number;
  /** Widen the auto range to `[-m, m]` so zero sits on a bin boundary. */
  symmetric: boolean;
  /** Whether the bars carry raw counts or each bin's share of the window's
   *  finite samples. Selects `HistogramResponse.values`; `counts` is
   *  always the raw count either way (C3 §3.6). */
  normalise: "counts" | "fraction";
}

/** One histogram cell's single bar mark (C2 §5.3's `histogram_mark`
 *  production, ruling R215 item 2). Singular by type, exactly as
 *  {@link FftPlotProps.mark} is: idl0's translucent multi-channel overlay
 *  (`chart_workspace.dart:600-606`) is a stated parity gap, not silently
 *  dropped — one `fetch_histogram` call resolves one distribution, and two
 *  channels' distributions would need a shared explicit range to be
 *  comparable at all.
 *
 *  The mark name is fixed at `rectY`, not a picked subset the way
 *  {@link SPECTRUM_MARK_NAMES} is: the mark binds `x1`/`x2` to the bin's
 *  own edges (`"v0"`/`"v1"`), and `lineY`/`areaY` have no `x2` channel to
 *  bind — offering them would be a control that silently draws the wrong
 *  picture. */
export interface HistogramMarkProps {
  channel: string;
  histogram: HistogramParams;
  /** Any valid CSS colour literal. */
  fill?: string;
  /** `0..1`; Plot's own `fillOpacity`. */
  fillOpacity?: number;
}

/** C2 §5.3's histogram-cell `plot_options` production (ruling R215 item 2).
 *  `mark` (singular) for the same reason {@link FftPlotProps}' is — see
 *  {@link HistogramMarkProps}. `x` is the **value** axis here (the binned
 *  channel's own unit), not time and not frequency, and carries no `type`:
 *  a histogram's x axis is always the linear bin axis the engine's own
 *  `bin_edges` describe. */
export interface HistogramPlotProps {
  chart: "histogram";
  mark: HistogramMarkProps;
  x?: XAxisProps;
  y?: YAxisProps;
  color?: { legend: true };
  /**
   * The chart's own title, rendered centred above the plot (R216's chrome,
   * `components/CellFrame.tsx`'s `title` prop). Optional; absent means the
   * cell falls back to its `# label:` line, which stays exactly as it was
   * — an explicit title simply wins (`model/chartTitle.ts`).
   *
   * `title` is a real Plot option, so the generated code stays idiomatic
   * Plot that draws its own title when run anywhere else. It is a
   * **plot-level** option, not a mark's, which is why it sits beside
   * `x`/`y`/`color` rather than inside a mark.
   */
  title?: string;
}

/** C2 §5.3's `scatter_params` production — the two parameters of one
 *  scatter chart, both required in this fixed order, for the same reason
 *  {@link FftParams}' six and {@link HistogramParams}' four are (C2 §5.3:
 *  "a missing key is custom code, not a default").
 *
 *  There is deliberately **no** density-mode or colour-by-third-channel
 *  slot. idl0's scatter chart had both (`scatter_chart.dart`) and
 *  `core/src/scatter.rs` still implements both, but neither is reachable
 *  from a v3 cell yet — a grammar slot for either would be a promise the
 *  IPC surface cannot keep (C3 §3.5 records the same gap). */
export interface ScatterParams {
  /** Maximum points the engine decimates the cloud to, by uniform stride.
   *  A positive integer, at most C3 §3.5's `MAX_SCATTER_POINTS`. In the
   *  document rather than in host state because it changes the picture:
   *  a budget of 500 and one of 20 000 draw visibly different clouds. */
  pointBudget: number;
  /** Square both axes onto one range so a G-G cloud's friction circle is
   *  round (idl0's own default). A *rendering* choice, but a stated one:
   *  C2 §5.3's "no renderer-only parameters" rule means the document says
   *  whether the axes are squared, not the host. */
  equalAspect: boolean;
}

/** One scatter cell's single dot mark (C2 §5.3's `scatter_mark`
 *  production, ruling R215 item 3). Singular by type, like
 *  {@link FftPlotProps.mark} and {@link HistogramPlotProps.mark}: one
 *  `fetch_scatter` call resolves one cloud.
 *
 *  The mark name is fixed at `dot` — a cloud of paired samples has no
 *  ordering along either axis, so `lineY`/`areaY` would connect points in
 *  sample order and draw a scribble that looks like a trajectory. */
export interface ScatterMarkProps {
  /** The channel on the x axis (`fetch_scatter`'s `x_channel`). */
  xChannel: string;
  /** The channel on the y axis (`fetch_scatter`'s `y_channel`). */
  yChannel: string;
  scatter: ScatterParams;
  /** Any valid CSS colour literal. */
  fill?: string;
  /** Dot radius, CSS px; Plot's own `r`. */
  r?: number;
}

/** C2 §5.3's scatter-cell `plot_options` production (ruling R215 item 3).
 *  Both axes carry a channel's own unit rather than time or frequency, so
 *  both are the plain optional {@link XAxisProps}/{@link YAxisProps}. */
export interface ScatterPlotProps {
  chart: "scatter";
  mark: ScatterMarkProps;
  x?: XAxisProps;
  y?: YAxisProps;
  color?: { legend: true };
  /**
   * The chart's own title, rendered centred above the plot (R216's chrome,
   * `components/CellFrame.tsx`'s `title` prop). Optional; absent means the
   * cell falls back to its `# label:` line, which stays exactly as it was
   * — an explicit title simply wins (`model/chartTitle.ts`).
   *
   * `title` is a real Plot option, so the generated code stays idiomatic
   * Plot that draws its own title when run anywhere else. It is a
   * **plot-level** option, not a mark's, which is why it sits beside
   * `x`/`y`/`color` rather than inside a mark.
   */
  title?: string;
}

/** C2 §5.3's `color_opt` production (widened 2026-09-11, ruling R217).
 *  `domain` is legal only on a map or spectrogram cell, where the document —
 *  not the host — states the colour range: two windows' heatmaps chosen
 *  independently would look identical when they are not. */
export interface ColorProps {
  legend?: true;
  domain?: [number, number];
}

/** The mark names {@link MapMarkProps.mark}'s union admits, as a runtime
 *  array (C2 §5.3's `trace_mark`, ruling R217 item 1). `line` draws the
 *  racing line; `dot` draws the fixes themselves, which is what shows where a
 *  receiver dropped out. */
export const MAP_MARK_NAMES: readonly MapMarkProps["mark"][] = ["line", "dot"];

/** One trace in a map cell (C2 §5.3's `trace_mark`, ruling R217 item 1).
 *
 *  A map cell is the one kind whose `marks` array may hold more than one
 *  *kind* of mark — the optional `trackGeometry` underlay marks come first,
 *  under the data, which is why they are a plot-level flag
 *  ({@link MapPlotProps.trackUnderlay}) rather than entries here. */
export interface MapMarkProps {
  /** The colour-by channel's name, or `null` for an uncoloured trace. Always
   *  present: a slot that is never absent is what makes the document state
   *  the colour source even when there is none. */
  colourBy: string | null;
  mark: "line" | "dot";
  /** A CSS colour literal, or `"c"` (colour by the colour-by channel) or
   *  `"w"` (colour by window, as R127 defines for channels). `"c"` with
   *  `colourBy: null` is custom code — there is no channel to colour by. */
  stroke?: string;
  /** px. */
  strokeWidth?: number;
}

/** C2 §5.3's map-cell `plot_options` production (ruling R217 item 1).
 *
 *  `aspectRatio: 1` is not a field here because it is not a choice: the
 *  grammar requires the literal on every map cell, so `generate` always emits
 *  it and `parse` refuses a cell without it. Equal aspect is a property of
 *  the projection — an unsquared map turns a circular berm into an ellipse —
 *  so it is stated in the document and nowhere else (C2 §5.3). */
export interface MapPlotProps {
  chart: "map";
  /** At least one; the form always seeds one trace. */
  marks: MapMarkProps[];
  /** Draw the track's reference polyline and gates under the traces
   *  (`trackGeometry`, C2 §5.1). `true` or entirely absent, like
   *  {@link TimePlotProps.zeroLine} — and, like it, emitted as real marks at
   *  the **head** of the array rather than as a plot option, because an
   *  outline belongs under the data. Absent when the session has no track:
   *  `trackGeometry` is `null` and there is nothing to draw. */
  trackUnderlay?: true;
  /** Metres east. Both axes are the projection's own metres, never degrees. */
  x?: XAxisProps;
  /** Metres north. */
  y?: YAxisProps;
  color?: ColorProps;
  /** See {@link TimePlotProps.title}. */
  title?: string;
}

/** The mark names {@link LapMarkProps.mark}'s union admits, as a runtime
 *  array (C2 §5.3's `lap_mark`, ruling R217 item 3). */
export const LAP_MARK_NAMES: readonly LapMarkProps["mark"][] = ["barY", "dot", "lineY"];

/** One lap-progression cell's single mark (C2 §5.3's `lap_mark`, ruling R217
 *  item 3). Singular by type, like every other non-time kind's.
 *
 *  {@link definition} is a bare §3.1 identifier, never a data call: a `[lap]`
 *  value is always a math definition — `mean([peak_freq], "t:lap")`, or
 *  `lap_time()` — so there is no `gps(...)`-style host form to invent, and a
 *  bare identifier in the first mark's data slot is exactly what makes a lap
 *  cell recognisable to the same first-callee lookahead every other kind
 *  uses. */
export interface LapMarkProps {
  definition: string;
  mark: "barY" | "dot" | "lineY";
  /** Bind `z`/`stroke` to `"w"` so each selected window is its own series,
   *  coloured from R127's descriptor. Absent draws one undifferentiated
   *  series. */
  seriesBy?: "w";
}

/** C2 §5.3's lap-cell `plot_options` production (ruling R217 item 3). The x
 *  axis is an **ordinal lap number**, not time — lap numbers repeating across
 *  two sessions is correct here, because `w` separates the series. */
export interface LapPlotProps {
  chart: "lap";
  mark: LapMarkProps;
  x?: XAxisProps;
  y?: YAxisProps;
  color?: ColorProps;
  /** See {@link TimePlotProps.title}. */
  title?: string;
}

/** One spectrogram cell's single image mark (C2 §5.3's `raster_mark`, ruling
 *  R217 item 4). The mark name is fixed at `image`: a raster is pixels, and
 *  no other Plot mark consumes them.
 *
 *  {@link fft} reuses {@link FftParams} verbatim — the same six keys in the
 *  same fixed order — because an FFT cell and a spectrogram parameterise the
 *  same STFT. `averaging` is carried but means nothing here: a spectrogram
 *  keeps every frame, which is what makes it a spectrogram rather than a
 *  spectrum. */
export interface SpectrogramMarkProps {
  channel: string;
  fft: FftParams;
}

/** C2 §5.3's spectrogram-cell `plot_options` production (ruling R217 item 4).
 *
 *  `fx: "w"` is not a field, for the reason a map's `aspectRatio` is not: the
 *  grammar requires the literal. A raster has no `w` column — pixels cannot
 *  interleave and a `NaN` break row between two images is meaningless — so a
 *  spectrogram cell fetches **one raster per selected window** and facets
 *  them, sharing one frequency scale. */
export interface SpectrogramPlotProps {
  chart: "spectrogram";
  mark: SpectrogramMarkProps;
  /** Time, seconds. Each facet takes its own domain from its own window's
   *  `RasterMeta`, so this is the label, rarely the domain. */
  x?: XAxisProps;
  /** Frequency, Hz. `type` is `"linear"` or `"log"`, the same choice an FFT
   *  cell's x axis has. */
  y?: YAxisProps;
  /** `domain` is the union of the windows' `vmin`/`vmax`, stated in the
   *  document rather than chosen per facet. */
  color?: ColorProps;
  /** See {@link TimePlotProps.title}. */
  title?: string;
}

/** C2 §5.3's `plot_options` production — the Properties pane's whole
 *  internal state for one `js` cell in the `plotForm` subset. A
 *  discriminated union on `chart`: a cell is exactly one chart kind, never
 *  two (C2 §5.3, "A cell is a time cell or an FFT cell, never
 *  both" — widened by ruling R215 to every chart kind the grammar has a
 *  production for). Every existing time-cell literal in this lane gained the
 *  `chart: "time"` discriminant when this union was introduced (L6 Task
 *  20) — the time branch of `generate`/`parse` is otherwise unchanged, so
 *  every landed document round-trips byte-identically to before.
 *
 *  `XAxisProps` (the time-cell x scale) is deliberately absent a `type`
 *  field: C2 §5.3 says the generator never emits it for a time cell (the
 *  grammar's `x_field` allows only the literal `"linear"`, reserved for a
 *  future non-time x-axis, C2 §8-2 — now realised as the FFT cell's own
 *  {@link FftXAxisProps}, a distinct type, not a widened `XAxisProps`). */
export type PlotProps =
  | TimePlotProps
  | FftPlotProps
  | HistogramPlotProps
  | ScatterPlotProps
  | MapPlotProps
  | LapPlotProps
  | SpectrogramPlotProps;

/** Every `PlotProps.chart` discriminant, as a runtime array — the single
 *  list a chart-type control enumerates against, same rationale as
 *  {@link MARK_NAMES}. In the order the Properties pane's chart-type
 *  control presents them. */
export const CHART_KINDS: readonly PlotProps["chart"][] = [
  "time",
  "fft",
  "histogram",
  "scatter",
  "map",
  "lap",
  "spectrogram",
];
