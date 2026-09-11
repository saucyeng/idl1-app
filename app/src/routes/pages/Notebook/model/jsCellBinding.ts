/**
 * Pure decision logic for whether a `js` cell's code binds through
 * `ChartCell`'s real viewport/tile-fetch pipeline (Tasks 6-10), an FFT
 * cell's spectrum pipeline (L6 Task 20, C2 §5.3), or a plain sandbox-output
 * mount (L6 Task 13b, R66 item 1). No React, no DOM, no IPC import --
 * `bindingFor` never calls `fetchTile`/`getSession`/`fetchFft` itself; its
 * caller (`Notebook/index.tsx`) resolves `SessionDetail` and the session's
 * recorded span (lead pre-ruling 2026-09-05 #1) and passes both in.
 */
import { histogramKey } from "../plotForm/histogramKey";
import { parse } from "../plotForm/parse";
import { scatterKey } from "../plotForm/scatterKey";
import { spectrumKey } from "../plotForm/spectrumKey";
import type { FftPlotProps, HistogramParams, HistogramPlotProps, ScatterPlotProps, TimePlotProps } from "../plotForm/types";
import { exceedsBinCap, fftRequestFor, type FftRequest } from "./fftRequest";
import {
  extractChannelCalls,
  extractHistogramCalls,
  extractScatterCalls,
  extractSpectrumCalls,
  type ChannelCallRef,
  type HistogramCallRef,
  type ScatterCallRef,
  type SpectrumCallRef,
} from "./jsCellCalls";
import { MAX_HISTOGRAM_BINS, type HistogramParams as WireHistogramParams } from "../../../../ipc/histogram";
import { MAX_SCATTER_POINTS } from "../../../../ipc/scatter";
import { rawUnitToLabel, UNIT_NOT_YET_EVALUATED } from "./unitLabel";
import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import type { Span, UnitLabel, Window as SelectedWindow } from "../../../../ipc/workbook";

/** Where one bound channel's samples come from (L6 Task 18, R77.3):
 *  `"session"` — a real session channel, fetched tile-by-tile through
 *  `ChartCell`'s existing pipeline; `"definition"` — a workbook `math`
 *  definition (`eval_workbook`'s `CellOutput.defs[].name`), fetched whole,
 *  decimated to a budget, via `fetch_host_channel` (C3 §3.4). */
export type BindingChannelSource = "session" | "definition";

/** One distinct channel a form-generated time cell's marks reference. */
export interface JsCellBindingChannel {
  channelId: string;
  /** `"definition"` ⇒ this names a workbook `math` definition rather than a
   *  session channel — it has no tile tier, no `TileCacheKey` and no time
   *  window (`fetch_host_channel` takes none, C3 §3.4). */
  source: BindingChannelSource;
  /** This channel's own nominal rate (`ChannelSummary.nominal_rate_hz`), in Hz — feeds `chooseTier`/`tileRange`.
   *  Meaningful only for `source === "session"` — a definition has no
   *  nominal rate; `0` for `source === "definition"`, and never fed to
   *  `chooseTier`/`tileRange` for one. */
  sampleRateHz: number;
  /**
   * The mark(s)' lap scope for this channel occurrence (`MarkProps.lap`):
   * a 1-based lap number, or `null` for session scope. Plumbed through to
   * `NotebookSession`'s registry (lead pre-ruling #2) but **not** applied
   * to narrow the fetched tile window this task -- R52 Q5's `lap_context`
   * and the lap tables are a wave-2 gap, not a bare TODO: `eval_workbook`
   * has no `lap_context` parameter yet (N4) and the tile-fetch path
   * (`model/tiers.ts`/`ipc/tiles.ts`) has no lap-relative addressing at
   * all today.
   */
  lap: number | null;
  /** This channel's three-state unit (R154/R164) — `source === "session"`:
   *  `ChannelSummary.unit` (C1 §4.1) via `model/unitLabel.ts`'s
   *  `rawUnitToLabel`; `source === "definition"`: the owning workbook
   *  definition's `CellDefResult.unit`, from the caller's own
   *  `definitionUnitByName` (`bindingFor`'s own doc comment) — `unknown`
   *  with a generic reason when that map has no entry yet (e.g. before the
   *  first `eval_workbook_v2` for this window has resolved). Threaded
   *  straight through to `channelBindDriver.ts`'s dispatched
   *  `ChannelBindAction`/`BoundChannel` — this module is the one place that
   *  resolves it, so nothing downstream re-derives it. */
  unit: UnitLabel;
}

/**
 * The initial time window every channel bound from this cell starts at,
 * before any gesture. `startUs`/`endUs` only -- **not** a full
 * `model/viewport.ts` `Viewport`: this module has no way to know a
 * `ChartCell`'s rendered pixel width (a DOM measurement), so the caller
 * fills in `pixelWidth` from the actual mounted width before constructing
 * a `Viewport` to pass down.
 */
export interface InitialSpan {
  /** Start of the window, in µs since session start (inclusive). Always `0`. */
  startUs: number;
  /** End of the window, in µs since session start (exclusive) -- the session's recorded span. */
  endUs: number;
}

/**
 * What a form-generated **time** `js` cell needs to render through
 * `ChartCell` instead of a plain mount (R66 item 1). One entry per distinct
 * channel the cell's marks reference -- a multi-mark cell binds every
 * distinct channel (R52 Q2: `channel()` materialises per-channel arrays;
 * nothing in the grammar or `ChartCell`'s one-channel-per-instance design
 * lets two marks on different channels share one binding).
 */
export interface TimeCellBinding {
  kind: "time";
  /** The cell's parsed form state, for anything a caller needs beyond the channel list (e.g. a future multi-channel overlay). */
  props: TimePlotProps;
  /** One binding per distinct `marks[*].channel` referenced by `props`, in the order each channel first appears across `marks`. */
  channels: JsCellBindingChannel[];
  /** The initial window every bound channel starts at, before any gesture -- see {@link InitialSpan}'s own doc comment on why it is not a full `Viewport`. */
  initialSpan: InitialSpan;
  /** The `channelId` of the first `source === "session"` entry in `channels`,
   *  or `null` when every bound channel is a `"definition"` (L6 Task 18).
   *  This is the one channel `ChartCell` mounts and fetches a viewport for
   *  (R69(d)) — a definition-only cell has no `ChartCell` at all (Q2(a),
   *  R78) and so no mounted channel. An explicit field, not a caller
   *  recomputing `channels[0]`: `channels[0]` may now be a `"definition"`
   *  entry, and `index.tsx`'s own `// TODO(idl0)` about `binding.channels[0]`
   *  stays true for the session-channel case only. */
  mountedChannelId: string | null;
}

/**
 * What a form-generated **FFT** `js` cell needs to render its spectrum (L6
 * Task 20, C2 §5.3). Exactly one channel, one request, one host-variable
 * name -- an FFT cell has exactly one spectrum mark by type
 * (`FftPlotProps.mark`), so there is nothing to enumerate the way
 * {@link TimeCellBinding.channels} does.
 */
export interface FftCellBinding {
  kind: "fft";
  props: FftPlotProps;
  channelId: string;
  /** `ChannelSummary.sample_count`, samples — what `"all"` resolves to. */
  sampleCount: number;
  /** Built by `fftRequestFor`; `lap` is always `null` (C3 §3.6). */
  request: FftRequest;
  /** `spectrumKey(channelId, props.mark.fft)` — the host variable name this
   *  spectrum is published under, computed by the one shared function both
   *  the host and the sandbox call (C2 §5.3). */
  hostVarName: string;
  /** Non-null when this cell must not fetch: too few samples (fewer than
   *  two, R76), or the resolved window exceeds `MAX_FFT_BINS` (R79 Q4). The
   *  string is the note the cell shows (R78 Task 19 Q3: the `JsCellFrame`
   *  note slot). */
  unrequestable: string | null;
}

/**
 * What a form-generated `js` cell needs to render -- a time cell through
 * `ChartCell`'s real viewport pipeline, or an FFT cell through its spectrum
 * pipeline. A discriminated union on `kind`, mirroring `plotForm.PlotProps`'
 * own `chart` discriminant one level up (L6 Task 20).
 */
/**
 * What a form-generated **histogram** `js` cell needs to render its binned
 * distribution (ruling R215 item 2, C2 §5.3, C3 §3.6). Exactly one channel,
 * one request, one host-variable name -- a histogram cell has exactly one
 * bar mark by type ({@link HistogramPlotProps.mark}), the same shape
 * {@link FftCellBinding} has and for the same reason.
 */
export interface HistogramCellBinding {
  kind: "histogram";
  props: HistogramPlotProps;
  channelId: string;
  /** The channel's three-state unit (R154/R164), for the bin-edge axis --
   *  resolved here, like a time cell's, so nothing downstream re-derives
   *  it. */
  unit: UnitLabel;
  /** `fetch_histogram`'s `params` argument, in C3 §3.6's wire spelling
   *  (`bin_mode`/`bin_value`), translated from the grammar's camelCase
   *  here so the driver and the effect never translate it again. */
  params: WireHistogramParams;
  /** `histogramKey(channelId, props.mark.histogram)` -- the host variable
   *  name this distribution is published under, computed by the one shared
   *  function both the host and the sandbox call (C2 §5.3). */
  hostVarName: string;
  /** Non-null when this cell must not fetch: a `binMode: "count"` value
   *  outside C3 §3.6's `1..=MAX_HISTOGRAM_BINS`, or a non-positive
   *  `binMode: "width"`. The string is the note the cell shows
   *  (`JsCellFrame`'s note slot), refused here rather than round-tripped
   *  as the engine's `invalid_argument`. */
  unrequestable: string | null;
}

/**
 * What a form-generated **scatter** `js` cell needs to render its XY cloud
 * (ruling R215 item 3, C2 §5.3, C3 §3.5). Two channels, one request, one
 * host-variable name.
 */
export interface ScatterCellBinding {
  kind: "scatter";
  props: ScatterPlotProps;
  xChannelId: string;
  yChannelId: string;
  /** Each axis's three-state unit (R154/R164). A scatter is the one binding
   *  whose two axes carry different units, so it resolves both. */
  unitX: UnitLabel;
  unitY: UnitLabel;
  /** `fetch_scatter`'s `point_budget`, straight from the document. */
  pointBudget: number;
  /** Whether the host squares both axes onto one domain before publishing
   *  (`ipc/scatter.ts`'s `equalAspectDomain`) — the document's choice, per
   *  C2 §5.3's "no renderer-only parameters". */
  equalAspect: boolean;
  /** `scatterKey(xChannelId, yChannelId, props.mark.scatter)`. */
  hostVarName: string;
  /** Non-null when this cell must not fetch: a `pointBudget` outside C3
   *  §3.5's `1..=MAX_SCATTER_POINTS`. The string is the note the cell
   *  shows, refused here rather than round-tripped as the engine's
   *  `invalid_argument`. */
  unrequestable: string | null;
}

export type JsCellBinding = TimeCellBinding | FftCellBinding | HistogramCellBinding | ScatterCellBinding;

/** Looks up one mark's channel in `sessionDetail.channels` by id, or `null`
 *  if it isn't a real channel on this session. Exported so every "does this
 *  name resolve against this session's channels" check in the app answers
 *  the same question the same way (`graphStatus.ts`'s decision 44 grey-vs-
 *  red split reuses this rather than a second predicate — ruling R141). */
export function findChannel(channels: ChannelSummary[], channelId: string): ChannelSummary | null {
  return channels.find((c) => c.channel_id === channelId) ?? null;
}

/** A minimal, synthetic `TimePlotProps` standing in for `TimeCellBinding.props`
 *  when `code` didn't round-trip through `plotForm.parse` (ruling R148 part
 *  2). Every mark it lists is `"lineY"` with no styling -- a placeholder,
 *  not a claim about how the cell actually draws (a hand-written cell may
 *  use any Plot mark at all; this module never sees which). Nothing in
 *  `Notebook/index.tsx` reads a `TimeCellBinding`'s `props` today (it reads
 *  `channels`/`mountedChannelId`/`initialSpan` only) -- the field exists
 *  for a future caller (its own doc comment: "anything a caller needs
 *  beyond the channel list"), and a synthetic value here keeps that field
 *  populated rather than making it `| null` for the one arm that can't
 *  produce a real one. */
function syntheticTimeProps(calls: readonly ChannelCallRef[]): TimePlotProps {
  return {
    chart: "time",
    marks: calls.map((c) => ({ channel: c.channel, mark: "lineY", lap: c.lap })),
  };
}

/** Builds the `TimeCellBinding` from the `channel(...)` calls a cell makes
 *  (ruling R148 part 2), or `null` if any referenced channel is
 *  unresolvable (see {@link bindingFor}'s own doc comment for the exact
 *  rule). `displayProps` is `TimeCellBinding.props` verbatim -- the real
 *  parsed form state when `code` matched it, or {@link syntheticTimeProps}
 *  otherwise; this function's own channel-resolution logic never consults
 *  it. Split out so {@link bindingFor} reads as one dispatch over which
 *  calls a cell makes. */
function bindingForTime(
  calls: readonly ChannelCallRef[],
  displayProps: TimePlotProps,
  sessionDetail: SessionDetail,
  sessionSpanUs: number,
  definitionNames: ReadonlySet<string>,
  definitionUnitByName: ReadonlyMap<string, UnitLabel> = new Map()
): TimeCellBinding | null {
  const channels: JsCellBindingChannel[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    if (seen.has(call.channel)) continue;
    seen.add(call.channel);

    const channel = findChannel(sessionDetail.channels, call.channel);
    if (channel !== null) {
      channels.push({
        channelId: channel.channel_id,
        source: "session",
        sampleRateHz: channel.nominal_rate_hz,
        lap: call.lap,
        unit: rawUnitToLabel(channel.unit),
      });
      continue;
    }

    if (definitionNames.has(call.channel)) {
      channels.push({
        channelId: call.channel,
        source: "definition",
        sampleRateHz: 0,
        lap: call.lap,
        unit: definitionUnitByName.get(call.channel) ?? UNIT_NOT_YET_EVALUATED,
      });
      continue;
    }

    return null;
  }

  const mountedChannelId = channels.find((c) => c.source === "session")?.channelId ?? null;

  return {
    kind: "time",
    props: displayProps,
    channels,
    initialSpan: { startUs: 0, endUs: sessionSpanUs },
    mountedChannelId,
  };
}

/**
 * Builds the `FftCellBinding` for a parsed `FftPlotProps`, or `null` if the
 * spectrum's channel is not a real session channel (an FFT cell's one
 * channel is never a workbook definition -- `fetch_fft` takes a session
 * channel id, C3 §3.6). `"all"` resolves to `channel.sample_count` here,
 * exactly once, at binding time (C2 §5.3: "the host resolves it to the
 * channel's `ChannelSummary.sample_count` at fetch time") -- never written
 * back into `props`, which keeps saying `"all"` on disk.
 *
 * `unrequestable` is set, and the request built from a mechanically
 * consistent but practically unusable window, for two cases: fewer than
 * two samples (R76 -- `fetch_fft` would reject any window over such a
 * channel) and a resolved window over `MAX_FFT_BINS` (R79 Q4) -- checked
 * against the *resolved* window (post-`"all"`), never the raw grammar
 * value, since `"all"` only becomes a concrete number here.
 *
 * @param window The selected window this FFT cell is being bound for (C1
 *   §6.1, ruling R117 — replaces the pre-windows `mainLap: number | null`,
 *   R83/L2b Task 6) — passed straight through to `fetch_fft_v2`'s `window`
 *   argument as-is via {@link FftRequest.window}, `null` when nothing is
 *   selected. C3 §3.6's FFT grammar has no per-mark lap or window token
 *   (R79), so this is the cell's only window source. A caller with several
 *   selected windows calls this once per window (each with its own
 *   `request.window`, to fetch each window's own spectrum) -- but every
 *   call shares the same {@link hostVarName} (ruling R129, amending R127
 *   item 5: a spectrum host variable's window dimension lives in its
 *   *payload*, `host/protocol.ts`'s `combineSpectrumWindows`, never in the
 *   key), so the caller combines the *n* fetched spectra into one payload
 *   before publishing, exactly as it already must for a time cell's
 *   channels (R127 item 1).
 */
function bindingForFft(
  call: SpectrumCallRef,
  displayProps: FftPlotProps,
  sessionDetail: SessionDetail,
  window: SelectedWindow | null
): FftCellBinding | null {
  const channel = findChannel(sessionDetail.channels, call.channel);
  if (channel === null) return null;

  const sampleCount = channel.sample_count;
  const fft = call.fft;
  const request = fftRequestFor(
    channel.channel_id,
    sampleCount,
    {
      windowSize: fft.windowSize === "all" ? sampleCount : fft.windowSize,
      hopSize: fft.hopSize === "all" ? sampleCount : fft.hopSize,
      window: fft.window,
      detrend: fft.detrend,
      scaling: fft.scaling,
    },
    fft.averaging,
    window
  );
  const hostVarName = spectrumKey(channel.channel_id, fft);

  let unrequestable: string | null = null;
  if (sampleCount < 2) {
    unrequestable = "This channel has too few samples for an FFT.";
  } else if (exceedsBinCap(request.params.window_size)) {
    unrequestable = "This spectrum has more bins than the chart can draw — reduce the window size.";
  }

  return { kind: "fft", props: displayProps, channelId: channel.channel_id, sampleCount, request, hostVarName, unrequestable };
}

/** A minimal, synthetic `FftPlotProps` standing in for `FftCellBinding.props`
 *  when `code` didn't round-trip through `plotForm.parse` -- same
 *  reasoning as {@link syntheticTimeProps}. `x.type` must be present on
 *  the real type ({@link FftXAxisProps}, C2 §5.3), so this always says
 *  `"linear"`; nothing reads it for a cell on this path (index.tsx reads
 *  only `channelId`/`hostVarName`/`request`/`unrequestable`). */
function syntheticFftProps(call: SpectrumCallRef): FftPlotProps {
  return {
    chart: "fft",
    mark: { channel: call.channel, mark: "lineY", fft: call.fft },
    x: { type: "linear" },
  };
}

/** Translates C2 §5.3's camelCase `histogram_params` into C3 §3.6's
 *  `snake_case` wire shape. The one place the two spellings meet (ruling
 *  R215 item 2): `binValue` is passed through verbatim in both modes, never
 *  rounded here -- a `"count"` value that is not a legal integer is refused
 *  by {@link bindingForHistogram}'s `unrequestable`, not silently
 *  corrected. */
function wireHistogramParams(h: HistogramParams): WireHistogramParams {
  return { bin_mode: h.binMode, bin_value: h.binValue, symmetric: h.symmetric, normalise: h.normalise };
}

/**
 * Builds the `HistogramCellBinding` for a histogram cell's one
 * `histogram(...)` call, or `null` if its channel is not a real session
 * channel (C3 §3.6's `fetch_histogram` takes a session channel id, never a
 * workbook definition name -- the same restriction {@link bindingForFft}
 * has, and for the same reason: the command slices `data.parquet`, which a
 * definition has no column in).
 *
 * `unrequestable` refuses, before any fetch, exactly what C3 §3.6 would
 * answer `invalid_argument` to under `binMode: "count"` (a non-integer or
 * out-of-range bin count), plus a non-positive `binMode: "width"`. The
 * width case is this module's own addition, not a mirror of an engine
 * error: the engine treats an unresolvable width as the *degenerate empty
 * result*, which is right for "this data cannot be binned that way" but
 * wrong as the answer to "you typed a negative width" -- a cell that says
 * why is better than one that silently draws nothing.
 */
function bindingForHistogram(
  call: HistogramCallRef,
  displayProps: HistogramPlotProps,
  sessionDetail: SessionDetail
): HistogramCellBinding | null {
  const channel = findChannel(sessionDetail.channels, call.channel);
  if (channel === null) return null;

  const h = call.histogram;
  let unrequestable: string | null = null;
  if (h.binMode === "count") {
    if (!Number.isInteger(h.binValue) || h.binValue < 1 || h.binValue > MAX_HISTOGRAM_BINS) {
      unrequestable = `Bin count must be a whole number between 1 and ${MAX_HISTOGRAM_BINS}.`;
    }
  } else if (!(h.binValue > 0) || !Number.isFinite(h.binValue)) {
    unrequestable = "Bin width must be greater than zero.";
  }

  return {
    kind: "histogram",
    props: displayProps,
    channelId: channel.channel_id,
    unit: rawUnitToLabel(channel.unit),
    params: wireHistogramParams(h),
    hostVarName: histogramKey(channel.channel_id, h),
    unrequestable,
  };
}

/** A minimal, synthetic `HistogramPlotProps` standing in for
 *  `HistogramCellBinding.props` when `code` didn't round-trip through
 *  `plotForm.parse` -- same reasoning as {@link syntheticTimeProps}. */
function syntheticHistogramProps(call: HistogramCallRef): HistogramPlotProps {
  return { chart: "histogram", mark: { channel: call.channel, histogram: call.histogram } };
}

/**
 * Builds the `ScatterCellBinding` for a scatter cell's one `scatter(...)`
 * call, or `null` if **either** channel is not a real session channel (C3
 * §3.5's `fetch_scatter` takes two session channel ids; a workbook
 * definition has no column in `data.parquet` to pair from). Both are
 * checked, not just the x channel: a cloud with one resolvable axis is not
 * a partially-valid cloud, it is no cloud.
 */
function bindingForScatter(
  call: ScatterCallRef,
  displayProps: ScatterPlotProps,
  sessionDetail: SessionDetail
): ScatterCellBinding | null {
  const x = findChannel(sessionDetail.channels, call.xChannel);
  const y = findChannel(sessionDetail.channels, call.yChannel);
  if (x === null || y === null) return null;

  const { pointBudget, equalAspect } = call.scatter;
  const unrequestable =
    Number.isInteger(pointBudget) && pointBudget >= 1 && pointBudget <= MAX_SCATTER_POINTS
      ? null
      : `Point budget must be a whole number between 1 and ${MAX_SCATTER_POINTS}.`;

  return {
    kind: "scatter",
    props: displayProps,
    xChannelId: x.channel_id,
    yChannelId: y.channel_id,
    unitX: rawUnitToLabel(x.unit),
    unitY: rawUnitToLabel(y.unit),
    pointBudget,
    equalAspect,
    hostVarName: scatterKey(x.channel_id, y.channel_id, call.scatter),
    unrequestable,
  };
}

/** A minimal, synthetic `ScatterPlotProps` standing in for
 *  `ScatterCellBinding.props` when `code` didn't round-trip through
 *  `plotForm.parse` -- same reasoning as {@link syntheticTimeProps}. */
function syntheticScatterProps(call: ScatterCallRef): ScatterPlotProps {
  return { chart: "scatter", mark: { xChannel: call.xChannel, yChannel: call.yChannel, scatter: call.scatter } };
}

/**
 * Extracts `code`'s `channel(...)`/`spectrum(...)`/`histogram(...)`/`scatter(...)` calls (`model/jsCellCalls.ts`,
 * ruling R148 part 2) and binds against them -- **not** by requiring `code`
 * to round-trip through `plotForm.parse` as one recognised form. A cell
 * with a `spectrum(...)` call is an FFT cell (`fetch_fft` takes exactly one
 * channel, C3 §3.6, so only the first such call is used); otherwise a cell
 * with at least one `channel(...)` call is a time cell; a cell with
 * neither is custom code with nothing to bind (`null`, plain mount, same
 * as always). `TimeCellBinding.props`/`FftCellBinding.props` carry the real
 * parsed form state when `code` happens to match it, and a synthetic
 * placeholder ({@link syntheticTimeProps}/{@link syntheticFftProps})
 * otherwise -- `parse` still runs, but only to populate that display field,
 * never to gate whether binding happens at all.
 *
 * Returns `null` when a time cell references a channel that is not in
 * `sessionDetail.channels` and not a name in `definitionNames` either (an
 * unresolvable channel is never fetched -- a plain mount with a visible
 * note instead, per this task's dispatch), when an FFT cell's one channel
 * is not a real session channel (never a `"definition"` -- `fetch_fft`
 * takes a session channel id, C3 §3.6), or when `sessionDetail`/
 * `sessionSpanUs` is not yet available (nothing to bind against). Pure: no
 * IPC, no DOM, no React.
 *
 * @param sessionSpanUs The session's recorded span in µs (lead pre-ruling
 *   #1: `SessionSummary.duration_ms`, or the coarsest-tile fallback),
 *   already resolved by the caller. `null` while still resolving --
 *   treated the same as no session selected. Unused for the FFT arm (an
 *   FFT cell has no time viewport), but still required so a caller does
 *   not need to know which arm a cell will resolve to before calling.
 * @param definitionNames Every workbook `math` definition name a **time**
 *   mark may bind to instead of a session channel (L6 Task 18, R77.3) --
 *   `eval_workbook`'s own `CellOutput.defs[].name`, restricted by the
 *   caller (`index.tsx`) to definitions with a recorded time axis
 *   (`CellDefResult.value.has_t`, C3 §3.4): a `has_t: false` definition has
 *   no axis to chart against and is treated exactly like an unresolvable
 *   channel here (Q3(a), R78) -- the caller distinguishes the two notes
 *   ("not part of this session" vs "has no recorded axis") itself, since
 *   this module never sees `has_t` for a name it excludes. Not consulted
 *   for the FFT arm.
 * @param window The selected window this cell is being bound for (C1 §6.1,
 *   ruling R117 — replaces the pre-windows `mainLap: number | null`, R83/
 *   L2b Task 6), or `null` when nothing is selected — consulted only by
 *   the FFT arm ({@link bindingForFft}); a time cell's per-mark `lap`
 *   (`MarkProps.lap`) is unrelated and unaffected, and `bindingForTime`'s
 *   own channel/span resolution is per-session, not per-window (R127 item
 *   1 — a channel's host-variable name must not encode which windows are
 *   selected), so a caller with several selected windows over the same
 *   session calls this once, not once per window, for the time arm. A
 *   multi-window caller does call the FFT arm once per window (each with
 *   its own `window`, to fetch each window's own spectrum), but every call
 *   resolves to the *same* `hostVarName` (ruling R129: a spectrum's window
 *   dimension lives in its payload, not its key, exactly like a channel's).
 */
export function bindingFor(
  cell: { id: string; code: string },
  sessionDetail: SessionDetail | null,
  sessionSpanUs: number | null,
  definitionNames: ReadonlySet<string>,
  window: SelectedWindow | null = null,
  /** A `"definition"` channel's own unit (R154/R164), keyed by name --
   *  typically the same `CellDefResult.unit` map `Notebook/index.tsx`
   *  builds alongside `definitionNames` from the primary window's
   *  `eval_workbook_v2` output (both filter the same `.defs`). Optional,
   *  defaulting to empty, so every existing caller/test that only cares
   *  about resolvability (not the unit) is unaffected -- a name absent from
   *  this map resolves to {@link UNIT_NOT_YET_EVALUATED}, not a crash. */
  definitionUnitByName: ReadonlyMap<string, UnitLabel> = new Map()
): JsCellBinding | null {
  if (sessionDetail === null || sessionSpanUs === null) return null;

  const parsedProps = parse(cell.code);

  const scatterCalls = extractScatterCalls(cell.code);
  if (scatterCalls.length > 0) {
    const call = scatterCalls[0];
    const displayProps = parsedProps !== null && parsedProps.chart === "scatter" ? parsedProps : syntheticScatterProps(call);
    return bindingForScatter(call, displayProps, sessionDetail);
  }

  const histogramCalls = extractHistogramCalls(cell.code);
  if (histogramCalls.length > 0) {
    const call = histogramCalls[0];
    const displayProps = parsedProps !== null && parsedProps.chart === "histogram" ? parsedProps : syntheticHistogramProps(call);
    return bindingForHistogram(call, displayProps, sessionDetail);
  }

  const spectrumCalls = extractSpectrumCalls(cell.code);
  if (spectrumCalls.length > 0) {
    const call = spectrumCalls[0];
    const displayProps = parsedProps !== null && parsedProps.chart === "fft" ? parsedProps : syntheticFftProps(call);
    return bindingForFft(call, displayProps, sessionDetail, window);
  }

  const channelCalls = extractChannelCalls(cell.code);
  if (channelCalls.length === 0) return null;

  const displayProps = parsedProps !== null && parsedProps.chart === "time" ? parsedProps : syntheticTimeProps(channelCalls);
  return bindingForTime(channelCalls, displayProps, sessionDetail, sessionSpanUs, definitionNames, definitionUnitByName);
}

/** A stable string identity for one `Span` (mirrors `state/selection.ts`'s
 *  `spanKey`, kept as a local copy over the wire `snake_case` shape rather
 *  than importing the app-state module — this file stays dependency-free
 *  of `app/src/state/**`, matching `model/openEvalDriver.ts`'s and
 *  `model/sessionSpanDriver.ts`'s precedent of importing only the wire
 *  `Window`/`Span` types from `ipc/workbook.ts`). */
function spanIdentity(span: Span): string {
  switch (span.kind) {
    case "session":
      return "session";
    case "lap":
      return `lap:${span.lap_number}`;
    case "range":
      return `range:${span.t0_us}:${span.t1_us}`;
  }
}

/** A stable string identity for a selected window's *content* -- `colour`
 *  excluded, same reasoning as `spanIdentity`'s sibling in
 *  `state/selection.ts`'s `windowKey` (recolouring is not fetch-relevant).
 *  `null` (nothing selected) identifies as `"none"`. Used only by
 *  {@link bindingIdentity}'s FFT arm. */
function windowIdentity(window: SelectedWindow | null): string {
  return window === null ? "none" : `${window.session_id}:${spanIdentity(window.span)}`;
}

/**
 * A stable string identity for everything `Notebook/index.tsx`'s bind
 * effects fetch for this cell, used to detect "this cell's binding
 * changed" without a deep-equal over the whole `JsCellBinding`. Two
 * bindings with the same identity are treated as the same binding: no
 * re-fetch. Covers both arms of the union:
 *
 * - Time: every distinct bound channel (id, `source` and lap) plus the
 *   initial span -- includes each channel's `source` (L6 Task 18) so a
 *   name moving from unresolvable to `"definition"`, or from
 *   `"definition"` to `"session"`, always produces a different identity --
 *   not only `channels[0]`/the mounted channel, since the effect re-fetches
 *   every distinct channel, not only the mounted one (R72).
 * - FFT: `hostVarName` (which encodes the channel and all six `fft_params`
 *   -- **never** the window, ruling R129 amending R127 item 5: a spectrum's
 *   window dimension lives in its payload, so two windows over the same
 *   channel/`fft_params` share one `hostVarName`) plus the resolved sample
 *   count, the `unrequestable` state and `request.window`'s own content
 *   (R83/L2b Task 6, extended by R117 from a bare lap number to a full
 *   selected window) -- a window selection change must start a new fetch
 *   even when nothing else about the cell changed, and since `hostVarName`
 *   no longer varies by window, `request.window`'s content is the *only*
 *   thing here that can distinguish two calls bound to different windows --
 *   two consecutive renders producing the same identity must not start a
 *   second fetch, the existing `boundIdentityRef` contract L6 Task 20
 *   extends rather than replaces.
 *
 * Pure string formatting, no IPC.
 */
export function bindingIdentity(binding: JsCellBinding): string {
  if (binding.kind === "scatter") {
    // `hostVarName` encodes both channels and both `scatter_params`
    // (`scatterKey`), so only the refusal state can distinguish two
    // bindings beyond it. Per-cell, not per-window, for the reason the
    // histogram arm's is -- see that branch's comment.
    return `scatter|${binding.hostVarName}|${binding.unrequestable ?? ""}`;
  }
  if (binding.kind === "histogram") {
    // `hostVarName` already encodes the channel and all four
    // `histogram_params` (`histogramKey`), so only the refusal state can
    // distinguish two bindings beyond it. The window is deliberately
    // **not** part of it: a histogram host variable's window dimension
    // lives in its payload (`combineHistogramWindows`), never in its key,
    // so the caller's per-window loop keys its own runs by
    // `(cellId, windowKey)` and this identity stays per-cell -- exactly
    // the split ruling R129 settled for spectra.
    return `histogram|${binding.hostVarName}|${binding.unrequestable ?? ""}`;
  }
  if (binding.kind === "fft") {
    return `fft|${binding.hostVarName}|${binding.sampleCount}|${binding.unrequestable ?? ""}|${windowIdentity(binding.request.window)}`;
  }
  if (binding.channels.length === 0) return "no-channel";
  const parts = binding.channels.map((c) => `${c.channelId}|${c.source}|${c.lap ?? "session"}`);
  return `${parts.join(",")}|${binding.initialSpan.startUs}|${binding.initialSpan.endUs}`;
}

/**
 * Names the first channel `code`'s `channel(...)`/`spectrum(...)` calls
 * reference that is not present in `sessionDetail.channels`, or `null`
 * when `code` makes no such calls at all (custom code) or every referenced
 * channel resolves. Split out from {@link bindingFor} so a caller whose
 * binding came back `null` can tell "custom code, plain mount as always"
 * apart from "names a channel this session doesn't have" -- the two
 * plain-mount cases this task's dispatch requires a visibly different note
 * for. Uses the same extraction as `bindingFor` (ruling R148 part 2), not
 * `plotForm.parse`, so this distinction is available for a hand-written
 * cell exactly as it is for a form-generated one.
 *
 * Covers both chart types, with the same dispatch rule as `bindingFor`: a
 * `spectrum(...)` call makes this an FFT cell (only the first such call is
 * consulted, matching `bindingFor`); otherwise every `channel(...)` call is
 * checked. A name in `definitionNames` is never reported unresolved for a
 * time cell (L6 Task 18 -- it resolves through `bindingFor`'s
 * `"definition"` path instead; the caller is responsible for the further
 * distinction of a definition with no recorded axis, see `bindingFor`'s own
 * doc comment on `definitionNames`) but always is for an FFT cell's one
 * spectrum channel (never resolved against `definitionNames` -- an FFT
 * cell's channel is always a session channel, C3 §3.6). Pure, same
 * guarantees as `bindingFor`.
 */
export function unresolvedChannelId(code: string, sessionDetail: SessionDetail, definitionNames: ReadonlySet<string>): string | null {
  const scatterCalls = extractScatterCalls(code);
  if (scatterCalls.length > 0) {
    const { xChannel, yChannel } = scatterCalls[0];
    // The x channel is reported first when both are unresolvable: the note
    // slot holds one name, and reporting the first-written one matches the
    // order the author reads their own call in.
    if (findChannel(sessionDetail.channels, xChannel) === null) return xChannel;
    return findChannel(sessionDetail.channels, yChannel) === null ? yChannel : null;
  }

  const histogramCalls = extractHistogramCalls(code);
  if (histogramCalls.length > 0) {
    const { channel } = histogramCalls[0];
    return findChannel(sessionDetail.channels, channel) === null ? channel : null;
  }

  const spectrumCalls = extractSpectrumCalls(code);
  if (spectrumCalls.length > 0) {
    const { channel } = spectrumCalls[0];
    return findChannel(sessionDetail.channels, channel) === null ? channel : null;
  }

  for (const call of extractChannelCalls(code)) {
    if (findChannel(sessionDetail.channels, call.channel) === null && !definitionNames.has(call.channel)) {
      return call.channel;
    }
  }
  return null;
}
