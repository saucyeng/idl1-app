/**
 * Pure decision logic for whether a `js` cell's code binds through
 * `ChartCell`'s real viewport/tile-fetch pipeline (Tasks 6-10), an FFT
 * cell's spectrum pipeline (L6 Task 20, C2 §5.3), or a plain sandbox-output
 * mount (L6 Task 13b, R66 item 1). No React, no DOM, no IPC import --
 * `bindingFor` never calls `fetchTile`/`getSession`/`fetchFft` itself; its
 * caller (`Notebook/index.tsx`) resolves `SessionDetail` and the session's
 * recorded span (lead pre-ruling 2026-09-05 #1) and passes both in.
 */
import { parse } from "../plotForm/parse";
import { spectrumKey } from "../plotForm/spectrumKey";
import type { FftPlotProps, MarkProps, PlotProps, TimePlotProps } from "../plotForm/types";
import { exceedsBinCap, fftRequestFor, type FftRequest } from "./fftRequest";
import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import type { Span, Window as SelectedWindow } from "../../../../ipc/workbook";

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
export type JsCellBinding = TimeCellBinding | FftCellBinding;

/** Looks up one mark's channel in `sessionDetail.channels` by id, or `null`
 *  if it isn't a real channel on this session. Exported so every "does this
 *  name resolve against this session's channels" check in the app answers
 *  the same question the same way (`graphStatus.ts`'s decision 44 grey-vs-
 *  red split reuses this rather than a second predicate — ruling R141). */
export function findChannel(channels: ChannelSummary[], channelId: string): ChannelSummary | null {
  return channels.find((c) => c.channel_id === channelId) ?? null;
}

/** Builds the `TimeCellBinding` for a parsed `TimePlotProps`, or `null` if
 *  any referenced channel is unresolvable (see {@link bindingFor}'s own
 *  doc comment for the exact rule). Split out so {@link bindingFor} reads
 *  as one dispatch over `props.chart`. */
function bindingForTime(
  props: TimePlotProps,
  sessionDetail: SessionDetail,
  sessionSpanUs: number,
  definitionNames: ReadonlySet<string>
): TimeCellBinding | null {
  const channels: JsCellBindingChannel[] = [];
  const seen = new Set<string>();
  for (const mark of props.marks as MarkProps[]) {
    if (seen.has(mark.channel)) continue;
    seen.add(mark.channel);

    const channel = findChannel(sessionDetail.channels, mark.channel);
    if (channel !== null) {
      channels.push({
        channelId: channel.channel_id,
        source: "session",
        sampleRateHz: channel.nominal_rate_hz,
        lap: mark.lap ?? null,
      });
      continue;
    }

    if (definitionNames.has(mark.channel)) {
      channels.push({
        channelId: mark.channel,
        source: "definition",
        sampleRateHz: 0,
        lap: mark.lap ?? null,
      });
      continue;
    }

    return null;
  }

  const mountedChannelId = channels.find((c) => c.source === "session")?.channelId ?? null;

  return {
    kind: "time",
    props,
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
function bindingForFft(props: FftPlotProps, sessionDetail: SessionDetail, window: SelectedWindow | null): FftCellBinding | null {
  const channel = findChannel(sessionDetail.channels, props.mark.channel);
  if (channel === null) return null;

  const sampleCount = channel.sample_count;
  const { fft } = props.mark;
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

  return { kind: "fft", props, channelId: channel.channel_id, sampleCount, request, hostVarName, unrequestable };
}

/**
 * `plotForm.parse`s `code`; returns `null` when it doesn't (custom code --
 * plain mount), when a time cell references a channel that is not in
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
  window: SelectedWindow | null = null
): JsCellBinding | null {
  if (sessionDetail === null || sessionSpanUs === null) return null;

  const props: PlotProps | null = parse(cell.code);
  if (props === null) return null;

  return props.chart === "fft"
    ? bindingForFft(props, sessionDetail, window)
    : bindingForTime(props, sessionDetail, sessionSpanUs, definitionNames);
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
  if (binding.kind === "fft") {
    return `fft|${binding.hostVarName}|${binding.sampleCount}|${binding.unrequestable ?? ""}|${windowIdentity(binding.request.window)}`;
  }
  if (binding.channels.length === 0) return "no-channel";
  const parts = binding.channels.map((c) => `${c.channelId}|${c.source}|${c.lap ?? "session"}`);
  return `${parts.join(",")}|${binding.initialSpan.startUs}|${binding.initialSpan.endUs}`;
}

/**
 * Names the first channel `code` references that is not present in
 * `sessionDetail.channels`, or `null` when `code` is custom (`parse`
 * returns `null`) or every referenced channel resolves. Split out from
 * {@link bindingFor} so a caller whose binding came back `null` can tell
 * "custom code, plain mount as always" apart from "form-generated, but
 * naming a channel this session doesn't have" -- the two plain-mount cases
 * this task's dispatch requires a visibly different note for.
 *
 * Covers both chart types: a time cell's marks (a name in `definitionNames`
 * is never reported unresolved, L6 Task 18 -- it resolves through
 * `bindingFor`'s `"definition"` path instead; the caller is responsible for
 * the further distinction of a definition with no recorded axis, see
 * `bindingFor`'s own doc comment on `definitionNames`) and an FFT cell's
 * one spectrum channel (never resolved against `definitionNames` -- an FFT
 * cell's channel is always a session channel, C3 §3.6). Pure, same
 * guarantees as `bindingFor`.
 */
export function unresolvedChannelId(code: string, sessionDetail: SessionDetail, definitionNames: ReadonlySet<string>): string | null {
  const props = parse(code);
  if (props === null) return null;

  if (props.chart === "fft") {
    return findChannel(sessionDetail.channels, props.mark.channel) === null ? props.mark.channel : null;
  }

  for (const mark of props.marks as MarkProps[]) {
    if (findChannel(sessionDetail.channels, mark.channel) === null && !definitionNames.has(mark.channel)) {
      return mark.channel;
    }
  }
  return null;
}
