/**
 * The `postMessage` protocol between the notebook host (this realm) and the
 * origin-isolated sandbox `<iframe>` that runs `js` cells (design §6). Two
 * directions are named distinctly — `HostToSandboxMessage` for what this
 * realm sends, `SandboxToHostMessage` for what it receives — even though the
 * plan lists both in one table for readability.
 */
import type { Span, UnitLabel } from "../../../../ipc/workbook";

/**
 * One selected window's display metadata, as carried alongside a
 * `"channel"` host-variable payload's `w` column (ruling R127 item 2):
 * `windows[i]` describes every sample whose `w` entry equals `i`. A
 * type-only import of `ipc/workbook.ts`'s `Span` -- erased at build time,
 * so this stays safe for the sandbox bundle too (`fftRequest.ts`'s own doc
 * comment gives the same reasoning for its `SpectrogramParams` import).
 */
export interface WindowDescriptor {
  sessionId: string;
  span: Span;
  /** A `--chart-1` … `--chart-8` token name, never a hex literal (ruling
   *  R117 item 6) -- how a per-window colour reaches a chart (R127 item 2). */
  colour: string;
  /** Caller-supplied display label (e.g. `state/selection.ts`'s
   *  `describeWindow`) -- this module never derives one itself. */
  label: string;
}

/**
 * A host variable's value as it travels over `postMessage`. A plain JSON
 * scalar/object (`laps`, `session`, `constants`, per C2 §5.1) is wrapped as
 * `{ kind: "json" }`; a decoded channel travels as `ArrayBuffer`s in
 * `postMessage`'s transfer list rather than as a copied JSON array of
 * numbers (performance budget P7). A decoded FFT spectrum (L6 Task 19) is
 * its own sibling arm rather than reusing `"channel"`'s `{ t, v }` shape:
 * its axis is frequency, not time, so silently relabelling `t` as Hz would
 * be the wrong unit under the right name. `f` (Hz) and `m` (magnitude) are
 * the raw bytes backing a **`Float64Array`** on each end, same convention
 * as `"channel"`'s `t`/`v` -- `sandbox/main.ts`'s `materializeHostVar` does
 * `new Float64Array(payload.f)`/`new Float64Array(payload.m)`
 * unconditionally on receipt.
 *
 * `"channel"` also carries `unit` (R154/R164, C2 §5.1's `.unit`/`.unitState`
 * host-variable properties) — the same three-state `UnitLabel` a
 * `CellDefResult`/`HostChannel` carries, threaded through unchanged from
 * whichever caller resolved it (a `math` definition's `CellDefResult.unit`,
 * or a raw session channel's `ChannelSummary.unit` via
 * `model/unitLabel.ts`'s `rawUnitToLabel` — R165: neither ever comes from
 * `fetch_host_channel`'s IDLH bytes, which carry samples only).
 * `sandbox/main.ts`'s `materializeHostVar` projects it onto the returned
 * record array as two non-enumerable properties, the same pattern already
 * used for `windows` below — `.unit` a plain display string (so a prose
 * `${…}` can splice it directly, C2 §5.2) and `.unitState` the
 * `"known"|"dimensionless"|"unknown"` discriminator for code that needs to
 * tell the three states apart. `"spectrum"` has no unit of its own yet — a
 * spectrum's magnitude unit is a separate open question (C2 §3.3's
 * `periodogram`/`welch` rows), out of this task's scope.
 *
 * Both `"channel"` and `"spectrum"` gain a `w` column and a `windows`
 * descriptor array (ruling R127, amended by **ruling R129**: R127
 * originally gave only `"channel"` this shape and instead had
 * `"spectrum"` vary its *key* per window (`spectrumKey`'s withdrawn
 * `windowIndex` parameter) -- but `spectrum_call`'s grammar, C2 §5.3, has
 * no window token, so cell code had no way to address the extra keys.
 * R129 makes `"spectrum"` symmetric with `"channel"` instead: one host
 * variable per (channel, `fft_params`), never one per (…, window) pair --
 * a host-variable name is keyed by the definition alone, R127 item 1,
 * which R129 extends to spectra too): `w[i]` is the window index that
 * produced sample `i`, and `windows[w[i]]` is that window's own
 * `{ sessionId, span, colour, label }`. Every existing single-window
 * caller of either kind is unaffected (R127 item 3): `w` is all zeros and
 * `windows` has exactly one entry.
 */
export type HostVarPayload =
  | { kind: "json"; value: unknown }
  | { kind: "channel"; length: number; t: ArrayBuffer; v: ArrayBuffer; w: ArrayBuffer; windows: WindowDescriptor[]; unit: UnitLabel }
  | { kind: "spectrum"; length: number; f: ArrayBuffer; m: ArrayBuffer; w: ArrayBuffer; windows: WindowDescriptor[] }
  | { kind: "histogram"; length: number; v0: ArrayBuffer; v1: ArrayBuffer; n: ArrayBuffer; w: ArrayBuffer; windows: WindowDescriptor[]; unit: UnitLabel }
  | {
      kind: "scatter";
      length: number;
      x: ArrayBuffer;
      y: ArrayBuffer;
      w: ArrayBuffer;
      windows: WindowDescriptor[];
      /** The equal-aspect square domain both axes share, or `null` when the
       *  cell did not ask for one or the cloud has no extent to square
       *  (`ipc/scatter.ts`'s `equalAspectDomain`). Small JSON, not
       *  transferred — a cell reads it as `scatter(...).domain` and hands
       *  it to both of Plot's scales. */
      domain: [number, number] | null;
      /** The **x** channel's three-state unit (R154/R164). */
      unit: UnitLabel;
      /** The **y** channel's three-state unit. A scatter is the one payload
       *  whose two axes carry different units, so it carries two. */
      unitY: UnitLabel;
    };

/** One cell as the host hands it to the sandbox for (re)definition. */
export interface SandboxCell {
  /** Stable cell id (C2 §2.2), used to route `cellResult`/`cellError` back. */
  id: string;
  /** The cell's source code, exactly as authored inside its fence. */
  code: string;
}

/** A message this realm (the host) sends into the sandbox iframe. */
export type HostToSandboxMessage =
  | { type: "init"; runtimeVersion: string }
  | { type: "setCells"; cells: SandboxCell[] }
  | { type: "setHostVar"; name: string; value: HostVarPayload }
  | { type: "evalInline"; spanId: string; expr: string }
  | { type: "transform"; cellId: string; translateXPx: number; scaleX: number }
  | { type: "layout"; cellId: string; top: number; left: number; width: number }
  | { type: "ping"; nonce: number }
  | { type: "teardown" };

/**
 * A host→sandbox message that asks the sandbox to evaluate one inline
 * `${…}` prose span (C2 §5.2, the 2026-09-05 tracked note "L6 inline
 * `${…}` prose spans have no host→sandbox trigger yet",
 * `runs/2026-09-03/decisions.md`). `spanId` is Rust's own id for this
 * occurrence (`CellOutput.prose_spans[i].id`, ledger R70/R78,
 * `model/proseBlocks.ts`'s `ProseSpanRef.id`), not a C2 fence-string cell
 * id — it never names an actual cell. `expr` is the
 * raw text between `${` and `}` (C2 §5.2's `js_expression`), evaluated in
 * the sandbox's current host-mediated scope (`sandbox/main.ts`'s
 * `SandboxRuntime.evalInline`, which reuses `compileCell`) — never parsed
 * or type-checked on this side.
 */
export function evalInlineMessage(spanId: string, expr: string): Extract<HostToSandboxMessage, { type: "evalInline" }> {
  return { type: "evalInline", spanId, expr };
}

/**
 * Builds a `transform` message (R69 item (b)): one gesture frame's CSS
 * transform, sent host->sandbox via `postMessage` (never IPC) so the
 * sandbox can apply it to that cell's own rendered Plot with no re-fetch,
 * mirroring `ChartCell`'s existing local `transformFor` application to its
 * host-rendered raster underlay. `translateXPx` in CSS px, `scaleX`
 * dimensionless (`model/viewport.ts`'s `transformFor` return shape).
 */
export function transformMessage(
  cellId: string,
  translateXPx: number,
  scaleX: number
): Extract<HostToSandboxMessage, { type: "transform" }> {
  return { type: "transform", cellId, translateXPx, scaleX };
}

/**
 * Builds a `layout` message: this cell's on-screen rectangle, in viewport
 * px (`getBoundingClientRect()`), so the sandbox can absolutely position
 * that cell's own rendered container to appear under the host's
 * gesture-capturing frame at the right document position -- a plumbing
 * addition beyond R69's two named messages (`cellRendered`/`transform`),
 * needed because a single shared iframe (design section 6) cannot
 * otherwise place a cell's picture at the same on-screen spot as its host
 * placeholder when other cell kinds (prose/math/table) are interleaved
 * between chart cells in document order. `top`/`left`/`width` in CSS px.
 */
export function layoutMessage(
  cellId: string,
  rect: { top: number; left: number; width: number }
): Extract<HostToSandboxMessage, { type: "layout" }> {
  return { type: "layout", cellId, top: rect.top, left: rect.left, width: rect.width };
}

/** A message the sandbox iframe sends back to this realm (the host). */
export type SandboxToHostMessage =
  | { type: "ready" }
  | { type: "pong"; nonce: number }
  | { type: "cellRendered"; cellId: string; heightPx: number }
  | { type: "cellError"; cellId: string; message: string }
  | { type: "inlineResult"; spanId: string; text: string }
  | { type: "spanError"; spanId: string; message: string };

/** Narrows `unknown` to a non-null object so its fields may be probed. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates a value received via `postMessage` from the (untrusted) sandbox
 * realm. Named for its caller — the host — not for the message's own
 * taxonomy: every message it accepts originates in the sandbox and is bound
 * for the host. Returns false, never throws, on anything malformed.
 */
export function isHostMessage(msg: unknown): msg is SandboxToHostMessage {
  if (!isRecord(msg) || typeof msg.type !== "string") {
    return false;
  }

  switch (msg.type) {
    case "ready":
      return true;
    case "pong":
      return typeof msg.nonce === "number";
    case "cellRendered":
      return typeof msg.cellId === "string" && typeof msg.heightPx === "number";
    case "cellError":
      return typeof msg.cellId === "string" && typeof msg.message === "string";
    case "inlineResult":
      return typeof msg.spanId === "string" && typeof msg.text === "string";
    case "spanError":
      return typeof msg.spanId === "string" && typeof msg.message === "string";
    default:
      return false;
  }
}

/**
 * Builds a `setHostVar` message for a decoded, possibly multi-window
 * channel plus the transfer list `postMessage` needs so the three buffers
 * move by reference, not by copy (P7). `t`/`v`/`w` must not be read again by
 * the caller after this call — they are neutered once transferred.
 *
 * `t`, `v` and `w` are the raw bytes backing a **`Float64Array`** on each
 * end — `t` in seconds since session start, `v` the channel's value (C1
 * channels are natively `f64`), `w` the window index per sample (ruling
 * R127 item 2; a whole number stored as `f64` for the same reason `t`/`v`
 * are, so `sandbox/main.ts`'s `materializeHostVar` can reinterpret all
 * three with one `new Float64Array(...)` convention) — matching, byte for
 * byte, `materializeHostVar`'s unconditional `new
 * Float64Array(payload.t)`/`.v`/`.w` on receipt. The caller (typically
 * {@link combineChannelWindows}'s output) must build all three typed arrays
 * as `Float64Array` and pass their `.buffer`s here — a narrower element
 * type on this end would silently corrupt every value once received, since
 * the sandbox's reinterpretation is fixed and unconditional
 * (review-task7.md Important finding; see `protocol.test.ts`'s round-trip
 * test for the byte-for-bit proof).
 *
 * `name` is added as the first argument (deviating from the brief's sketch,
 * which omitted it) because `setHostVar` requires a variable name to bind
 * under; the point under test is that all three buffers land in `transfer`
 * exactly once, not this argument order.
 */
export function channelPayload(
  name: string,
  length: number,
  t: ArrayBuffer,
  v: ArrayBuffer,
  w: ArrayBuffer,
  windows: WindowDescriptor[],
  unit: UnitLabel
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "channel", length, t, v, w, windows, unit },
    },
    transfer: [t, v, w],
  };
}

/** One selected window's own paired `{a, b}` samples plus the descriptor
 *  {@link combinePairedWindows} attaches to every sample drawn from it --
 *  `a`/`b` are named generically here because the same combining shape
 *  serves both a channel's `{t, v}` ({@link WindowSeries}) and a spectrum's
 *  `{f, m}` ({@link SpectrumWindowSeries}), the two axes R129 made
 *  symmetric. `a.length` must equal `b.length`. */
interface PairedWindowSeries {
  descriptor: WindowDescriptor;
  a: Float64Array;
  b: Float64Array;
}

/** {@link combinePairedWindows}'s return -- generic over the same `a`/`b`
 *  naming; {@link combineChannelWindows}/{@link combineSpectrumWindows}
 *  relabel `a`/`b` to `t`/`v` or `f`/`m` for their own callers. */
interface CombinedPairedSeries {
  length: number;
  a: Float64Array;
  b: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
}

/**
 * Combines *n* selected windows' own paired samples into the single flat
 * `{length, a, b, w}` layout ruling R127 requires (extended to spectra by
 * **ruling R129**): one host variable per definition (item 1), never one
 * per (definition, window) pair. Windows are concatenated in `series`
 * order; `w[i]` is the index into the returned `windows` array that
 * produced sample `i`. Shared by {@link combineChannelWindows} (`a, b` =
 * `t, v`) and {@link combineSpectrumWindows} (`a, b` = `f, m`) -- the
 * break-insertion rule below does not care what the two axes mean.
 *
 * **A single window (`series.length <= 1`) is byte-identical to the
 * pre-multi-window shape** (ruling R127 item 3): no break row is inserted,
 * and `w` is filled with that one window's index (`0`, in the ordinary
 * one-window call). `series: []` returns an all-empty result.
 *
 * **Two or more windows get one break row inserted between each pair**
 * (ruling R127 item 4, the load-bearing part): a row of `a = NaN, b = NaN,
 * w = NaN`. Observable Plot's line marks break at a `NaN` in either channel
 * (`a` is typically `x`, `b` is typically `y`), so a cell written before
 * multi-window existed, which reads only `{a, b}` and ignores `w`, renders
 * *n separate segments* in one colour instead of one line vaulting from one
 * window's last sample to the next window's first -- a shape that would
 * look like real data and isn't (R127's own "cost if wrong"). `w`'s break
 * entry is `NaN` too, not `-1` or some other sentinel index: `w` is a
 * lookup key into `windows`, and there is no window `NaN` would name that a
 * reader could mistake for a real one, whereas a small integer sentinel
 * (`-1`) risks exactly that if `windows.length` ever reached it.
 */
function combinePairedWindows(series: readonly PairedWindowSeries[]): CombinedPairedSeries {
  const windows = series.map((s) => s.descriptor);

  if (series.length <= 1) {
    const only = series[0];
    const length = only?.b.length ?? 0;
    return {
      length,
      a: only?.a ?? new Float64Array(0),
      b: only?.b ?? new Float64Array(0),
      w: new Float64Array(length).fill(0),
      windows,
    };
  }

  const breaks = series.length - 1;
  const length = series.reduce((sum, s) => sum + s.b.length, 0) + breaks;
  const a = new Float64Array(length);
  const b = new Float64Array(length);
  const w = new Float64Array(length);

  let i = 0;
  series.forEach((s, windowIndex) => {
    if (windowIndex > 0) {
      a[i] = NaN;
      b[i] = NaN;
      w[i] = NaN;
      i++;
    }
    for (let j = 0; j < s.b.length; j++) {
      a[i] = s.a[j];
      b[i] = s.b[j];
      w[i] = windowIndex;
      i++;
    }
  });

  return { length, a, b, w, windows };
}

/** One selected window's own `{t, v}` series -- see {@link
 *  combineChannelWindows}. */
export interface WindowSeries {
  descriptor: WindowDescriptor;
  /** Seconds since `descriptor`'s session start. */
  t: Float64Array;
  v: Float64Array;
}

/** {@link combineChannelWindows}'s return -- ready to pass straight into
 *  {@link channelPayload} (via each array's `.buffer`). */
export interface CombinedChannelSeries {
  length: number;
  t: Float64Array;
  v: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
}

/** Combines one channel's per-window `{t, v}` series -- see
 *  {@link combinePairedWindows} for the shared combining/break rule this
 *  wraps (ruling R127). */
export function combineChannelWindows(series: readonly WindowSeries[]): CombinedChannelSeries {
  const combined = combinePairedWindows(series.map((s) => ({ descriptor: s.descriptor, a: s.t, b: s.v })));
  return { length: combined.length, t: combined.a, v: combined.b, w: combined.w, windows: combined.windows };
}

/** One selected window's own `{f, m}` spectrum -- see {@link
 *  combineSpectrumWindows}. */
export interface SpectrumWindowSeries {
  descriptor: WindowDescriptor;
  /** Hz. */
  f: Float64Array;
  /** Magnitude. */
  m: Float64Array;
}

/** {@link combineSpectrumWindows}'s return -- ready to pass straight into
 *  {@link spectrumPayload} (via each array's `.buffer`). */
export interface CombinedSpectrumSeries {
  length: number;
  f: Float64Array;
  m: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
}

/**
 * Combines one channel's per-window `{f, m}` spectra into the single flat
 * `{length, f, m, w}` layout -- **ruling R129**, amending R127 item 5:
 * a spectrum host variable now carries its window dimension in the
 * payload, exactly like {@link combineChannelWindows}, rather than in
 * `spectrumKey`. See {@link combinePairedWindows} for the shared
 * combining/break rule this wraps.
 */
export function combineSpectrumWindows(series: readonly SpectrumWindowSeries[]): CombinedSpectrumSeries {
  const combined = combinePairedWindows(series.map((s) => ({ descriptor: s.descriptor, a: s.f, b: s.m })));
  return { length: combined.length, f: combined.a, m: combined.b, w: combined.w, windows: combined.windows };
}

/** One selected window's own binned distribution -- see
 *  {@link combineHistogramWindows}. All three arrays are the same length
 *  (one entry per bin): `v0`/`v1` are that bin's own two edges in the
 *  channel's unit, `n` what the chart plots (C3 §3.6's
 *  `HistogramResponse.values`, already normalised in the engine). */
export interface HistogramWindowSeries {
  descriptor: WindowDescriptor;
  v0: Float64Array;
  v1: Float64Array;
  n: Float64Array;
}

/** {@link combineHistogramWindows}'s return -- ready to pass straight into
 *  {@link histogramPayload} (via each array's `.buffer`). */
export interface CombinedHistogramSeries {
  length: number;
  v0: Float64Array;
  v1: Float64Array;
  n: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
}

/**
 * Combines *n* selected windows' own binned distributions into the single
 * flat `{length, v0, v1, n, w}` layout, the histogram counterpart of
 * {@link combineChannelWindows}/{@link combineSpectrumWindows} (ruling R215
 * item 2, following R127/R129's shape): one host variable per (channel,
 * `histogram_params`), never one per (…, window) pair, with the window
 * dimension in the payload because `histogram_call`'s grammar has no window
 * token to address a second key with.
 *
 * **No break row is inserted between windows**, unlike
 * {@link combinePairedWindows}. That rule (ruling R127 item 4) exists so a
 * *line* mark does not vault from one window's last sample to the next
 * window's first, drawing a segment that looks like real data. A histogram
 * draws `rectY` bars: each row is an independent rectangle with its own
 * `x1`/`x2` extent, so there is no connecting segment to break, and a
 * `NaN`-valued separator row would instead be one more bar Plot has to
 * discard. Each window's bars are drawn where its own bin edges put them,
 * and `w` tells a cell which window each bar came from -- which is also
 * the honest picture: two windows' bins genuinely do not align unless the
 * two ranges happen to coincide.
 *
 * Windows are concatenated in `series` order; `w[i]` indexes the returned
 * `windows` array. `series: []` returns an all-empty result. A single
 * window's `w` is all `0`, exactly as its channel/spectrum counterparts'
 * is.
 */
export function combineHistogramWindows(series: readonly HistogramWindowSeries[]): CombinedHistogramSeries {
  const windows = series.map((s) => s.descriptor);
  const length = series.reduce((sum, s) => sum + s.n.length, 0);
  const v0 = new Float64Array(length);
  const v1 = new Float64Array(length);
  const n = new Float64Array(length);
  const w = new Float64Array(length);

  let i = 0;
  series.forEach((s, windowIndex) => {
    for (let j = 0; j < s.n.length; j++) {
      v0[i] = s.v0[j];
      v1[i] = s.v1[j];
      n[i] = s.n[j];
      w[i] = windowIndex;
      i++;
    }
  });

  return { length, v0, v1, n, w, windows };
}

/** One selected window's own paired `{x, y}` cloud -- see
 *  {@link combineScatterWindows}. */
export interface ScatterWindowSeries {
  descriptor: WindowDescriptor;
  x: Float64Array;
  y: Float64Array;
}

/** {@link combineScatterWindows}'s return -- ready to pass straight into
 *  {@link scatterPayload} (via each array's `.buffer`). */
export interface CombinedScatterSeries {
  length: number;
  x: Float64Array;
  y: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
}

/**
 * Combines *n* selected windows' own clouds into the single flat
 * `{length, x, y, w}` layout (ruling R215 item 3), the scatter counterpart
 * of {@link combineChannelWindows}/{@link combineSpectrumWindows}.
 *
 * **No break row is inserted between windows**, for the reason
 * {@link combineHistogramWindows}' doc comment gives: the mark is
 * `Plot.dot`, so every row is an independent point with no connecting
 * segment to break, and a `NaN` row would be one more point to discard.
 * `w` groups the points by window, which is what lets a cell colour each
 * window's cloud from its own descriptor.
 */
export function combineScatterWindows(series: readonly ScatterWindowSeries[]): CombinedScatterSeries {
  const windows = series.map((s) => s.descriptor);
  const length = series.reduce((sum, s) => sum + Math.min(s.x.length, s.y.length), 0);
  const x = new Float64Array(length);
  const y = new Float64Array(length);
  const w = new Float64Array(length);

  let i = 0;
  series.forEach((s, windowIndex) => {
    const n = Math.min(s.x.length, s.y.length);
    for (let j = 0; j < n; j++) {
      x[i] = s.x[j];
      y[i] = s.y[j];
      w[i] = windowIndex;
      i++;
    }
  });

  return { length, x, y, w, windows };
}

/**
 * Builds a `setHostVar` message for a decoded, possibly multi-window XY
 * cloud (ruling R215 item 3) plus its transfer list, mirroring
 * {@link channelPayload}. `x`/`y`/`w` must not be read again by the caller
 * after this call -- they are neutered once transferred.
 *
 * `domain` and the two units are small JSON carried alongside, not
 * transferred: `domain` is the equal-aspect square both scales share (or
 * `null`), and a scatter is the one payload kind whose two axes carry
 * *different* units, so it names both rather than one.
 */
export function scatterPayload(
  name: string,
  length: number,
  x: ArrayBuffer,
  y: ArrayBuffer,
  w: ArrayBuffer,
  windows: WindowDescriptor[],
  domain: [number, number] | null,
  unit: UnitLabel,
  unitY: UnitLabel
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "scatter", length, x, y, w, windows, domain, unit, unitY },
    },
    transfer: [x, y, w],
  };
}

/**
 * Builds a `setHostVar` message for a decoded, possibly multi-window binned
 * distribution (ruling R215 item 2) plus its transfer list, mirroring
 * {@link channelPayload} exactly except for the columns: a bin's two edges
 * and its plotted value rather than one time and one value. `v0`/`v1`/`n`/
 * `w` must not be read again by the caller after this call -- they are
 * neutered once transferred.
 *
 * All four are the raw bytes backing a **`Float64Array`** on each end, the
 * same unconditional reinterpretation `sandbox/main.ts`'s
 * `materializeHostVar` applies to every other array payload -- a narrower
 * element type on this end would silently corrupt every value.
 *
 * `unit` is the binned channel's own three-state {@link UnitLabel}
 * (R154/R164), carried for the same reason a channel payload carries one:
 * a histogram's x axis is in the channel's unit, so a cell (or a prose
 * `${…}`) can label it without a second lookup. It describes `v0`/`v1`;
 * `n` is a count or a fraction and is dimensionless either way.
 */
export function histogramPayload(
  name: string,
  length: number,
  v0: ArrayBuffer,
  v1: ArrayBuffer,
  n: ArrayBuffer,
  w: ArrayBuffer,
  windows: WindowDescriptor[],
  unit: UnitLabel
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "histogram", length, v0, v1, n, w, windows, unit },
    },
    transfer: [v0, v1, n, w],
  };
}

/**
 * Builds a `setHostVar` message for a decoded, possibly multi-window FFT
 * spectrum (L6 Task 19; C2 §5.3) plus its transfer list, mirroring
 * {@link channelPayload} exactly except for the axis: `f` (Hz, built from
 * `model/fftRequest.ts`'s `frequencyAxisHz`) and `m` (magnitude,
 * `DecodedFft.magnitudes` widened from `Float32Array` to `Float64Array`)
 * rather than `t`/`v`. `f`/`m`/`w` must not be read again by the caller
 * after this call -- they are neutered once transferred.
 *
 * Gains `w`/`windows` by **ruling R129** (amending R127 item 5): *n*
 * selected windows over one (channel, `fft_params`) pair are one host
 * variable, one call, with the window dimension carried in the payload
 * (typically {@link combineSpectrumWindows}'s output) -- never *n* calls
 * under *n* distinct names, which would need a window token
 * `spectrum_call`'s grammar (C2 §5.3) does not have.
 */
export function spectrumPayload(
  name: string,
  length: number,
  f: ArrayBuffer,
  m: ArrayBuffer,
  w: ArrayBuffer,
  windows: WindowDescriptor[]
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "spectrum", length, f, m, w, windows },
    },
    transfer: [f, m, w],
  };
}
