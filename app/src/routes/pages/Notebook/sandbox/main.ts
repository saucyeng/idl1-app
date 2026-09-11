/**
 * The origin-isolated sandbox realm's own entry point (design §6). Runs
 * inside an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`)
 * built by `../host/SandboxHost.ts`. This module is never imported by the
 * host app shell — it is bundled as a *separate* Vite entry
 * (`vite.config.ts`'s `notebookSandbox` input, R56) so `@observablehq/plot`,
 * `d3`, `@observablehq/inputs` and `htl` resolve into one real, loadable
 * script rather than staying as raw unbundled source.
 *
 * Not unit-tested (CLAUDE.md §4: rendering). The host realm's rule against
 * `eval`/`new Function` does not apply here — cell code legitimately runs
 * inside this, a *different* realm, through mechanisms this file owns.
 *
 * The `tokens.css` import below (UI-8) is this document's *own* copy of the
 * brand token sheet: CSS custom properties do not cross an iframe boundary,
 * so a cell's `Plot.plot({...})` call inside this realm needs its own
 * `:root` definitions of `--bg`/`--rule`/`--chart-1`… to resolve anything.
 * Vite's `notebookSandbox` entry (R56) bundles and links this stylesheet for
 * this HTML entry same as any other CSS import.
 *
 * `sandboxCanvas.css`, imported after it, neutralises `tokens.css`'s own
 * `:root`/`body` background for this document only (see that file's doc
 * comment for the full blackout mechanism it fixes) -- source order, not
 * specificity, is what makes it win, so it must stay after this line.
 */
import "../../../../styles/tokens.css";
import "./sandboxCanvas.css";
import { Runtime } from "@observablehq/runtime";
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import * as Inputs from "@observablehq/inputs";
import { html } from "htl";

import type {
  HostToSandboxMessage,
  HostVarPayload,
  RasterFramePayload,
  SandboxCell,
  SandboxToHostMessage,
} from "../host/protocol";
import { gpsKey, rasterKey } from "../plotForm/gpsKey";
import { histogramKey } from "../plotForm/histogramKey";
import { scatterKey } from "../plotForm/scatterKey";
import { spectrumKey } from "../plotForm/spectrumKey";
import type { FftParams, HistogramParams, ScatterParams } from "../plotForm/types";
import { plotTheme } from "../theme/plotTheme";
import { documentVars } from "../theme/series";
import { bindHostVariables, type HostVariableSink } from "./hostVariables";

/**
 * Wraps the real `Plot` module so every `Plot.plot({...})` call a notebook
 * cell's own code makes automatically merges in {@link plotTheme} (UI-8;
 * `brief-ui-8.md` "Applying it"). The theme cannot be spliced into a cell's
 * own source text — a cell's code is exactly what a person wrote (C2 §5;
 * "the workbook is a file") — so this wraps the bound `Plot` global instead,
 * the one place every cell's `Plot.plot(...)` call actually runs. Every
 * other export (`Plot.lineY`, `Plot.dot`, …) passes through unchanged.
 *
 * The merge is shallow at the top level (a cell's own `marginLeft`/`grid`
 * wins if set) except `style`, which is merged key-by-key so a cell that
 * only sets, say, `style.fontWeight` keeps the theme's `background`/`color`/
 * `fontFamily` rather than losing them to a full-object overwrite.
 */
function themedPlot(read: Parameters<typeof plotTheme>[0]): typeof Plot {
  const theme = plotTheme(read);
  return {
    ...Plot,
    plot(options: Plot.PlotOptions = {}): (SVGSVGElement | HTMLElement) & Plot.Plot {
      const themeStyle = typeof theme.style === "object" && theme.style !== null ? theme.style : undefined;
      const cellStyle = typeof options.style === "object" && options.style !== null ? options.style : undefined;
      const mergedStyle = themeStyle === undefined && cellStyle === undefined ? undefined : { ...themeStyle, ...cellStyle };
      return Plot.plot({
        grid: theme.grid,
        marginLeft: theme.marginLeft,
        ...options,
        style: mergedStyle ?? options.style ?? theme.style,
      });
    },
  };
}

/**
 * Sends a message to the host realm. `targetOrigin: "*"` is the standard,
 * correct choice for a sandboxed iframe with no `allow-same-origin`: this
 * document's own origin is opaque ("null"), so it has no way to assert the
 * host's real origin. The security boundary here is the `sandbox` flags and
 * the host's own `isHostMessage` validation, not `postMessage` origin
 * filtering.
 */
function postToHost(message: SandboxToHostMessage): void {
  window.parent.postMessage(message, "*");
}

/**
 * Renders `value` into `container`'s own DOM (R69 item (a) -- the sandbox
 * renders each cell's output itself; nothing crosses `postMessage` as an
 * HTML string for the host to inject). A DOM node (`Plot.plot(...)`'s
 * usual return, or any `html`-tagged fragment) is appended directly, never
 * cloned into an HTML string first -- there is no host-side
 * `dangerouslySetInnerHTML` left to feed. Any other value (a bare number,
 * string, or object a custom-code cell returns) becomes `textContent`,
 * never `innerHTML`, so a string value can never be interpreted as markup
 * even inside this already-isolated realm.
 */
function renderCellValue(container: HTMLElement, value: unknown): void {
  container.replaceChildren();
  if (value instanceof Node) {
    container.appendChild(value);
  } else {
    container.textContent = String(value);
  }
}

/**
 * Materialises a `postMessage`d host-variable payload into the value cell
 * code actually sees. A `json` payload passes through unchanged. A
 * `channel` payload's transferred buffers become an array of `{t, v, w}`
 * records (R52 Q2 — chosen over the SoA `{length, t, v}` shape C2 §5.1
 * originally proposed, pending that spec's own amendment) rather than the
 * raw `Float64Array` views, since record objects are what Observable Plot's
 * tabular-data protocol iterates. `w` (ruling R127 item 2) is each sample's
 * window index -- a pre-multi-window cell that destructures only `{t, v}`
 * simply never reads it, and a single-window payload's `w` is all `0`
 * (R127 item 3), so this is additive, not a breaking change to any existing
 * cell's shape. `payload.windows` (the `{sessionId, span, colour, label}`
 * descriptor `windows[i]` names for every sample whose `w === i`) is
 * attached to the returned array as a non-enumerable `windows` property --
 * it does not appear in `for...of`/`Array.prototype.map` iteration or in
 * Plot's own field access by index, but is reachable as
 * `channel(name).windows` by code that wants a window's own colour/label
 * (R127 item 2's "colour comes from the descriptor"), without inventing a
 * second host variable or a second `channel(...)` return shape.
 *
 * A `spectrum` payload (L6 Task 19) is the same record-array shape over its
 * own axis, `{f, m}` (frequency Hz, magnitude) rather than `{t, v}` — a
 * spectrum's axis is frequency, never time — and, since **ruling R129**
 * (amending R127 item 5), carries the same `w`/`windows` treatment as a
 * `channel` payload: `spectrumKey` never varies by window, so a multi-window
 * FFT cell's `n` spectra arrive combined in one payload, grouped by `w`,
 * exactly like a multi-window channel's samples.
 */
/**
 * One rendered raster as a spectrogram cell's own code sees it (ruling R217
 * item 4). The field names are C2 §5.3's `raster_mark` production: `x`/`y`
 * place the image's **centre** in data coordinates, `iw`/`ih` are its size
 * in **CSS pixels** (the host requested the raster at exactly the size the
 * cell draws it at, so no resampling happens here), `src` is its `data:`
 * URL, and `w` is the window index the cell facets by.
 *
 * `iw`/`ih` rather than C2 §5.3's original `w`/`h`: the same production also
 * fixes `fx: "w"`, and `w` cannot be both the window index every other
 * payload in the app uses it for *and* an image's pixel width. Faceting by a
 * width that is identical across windows collapses every window's raster
 * into one facet, which is the opposite of what `fx: "w"` is for. See this
 * lane's report -- the contract text is corrected to match.
 */
interface RasterRecord {
  /** The image's centre, x, in data coordinates (seconds). */
  x: number;
  /** The image's centre, y, in data coordinates (Hz). */
  y: number;
  /** The image's rendered width, CSS pixels. */
  iw: number;
  /** The image's rendered height, CSS pixels. */
  ih: number;
  /** A `data:image/png` URL for this window's raster. */
  src: string;
  /** The window index -- `fx: "w"`'s facet channel. */
  w: number;
}

/**
 * Encodes one transferred RGBA8 frame as a `data:image/png` URL, the only
 * form `Plot.image`'s `src` channel accepts that a null-origin realm can
 * actually load: a `blob:` URL minted in the host realm is scoped to the
 * host's origin and this document's origin is opaque, so it would never
 * resolve here.
 *
 * Encoding runs once per fetched raster, on receipt, never per rendered
 * frame -- a spectrogram's pixels change only when a settle-bound
 * `fetch_raster_v2` returns new ones (C3 §4), so this never sits on the
 * interaction path (R201). Returns an empty string for a degenerate
 * (zero-area) frame or if the 2D context is unavailable, which renders as
 * no image rather than a broken one.
 */
function rasterDataUrl(frame: RasterFramePayload): string {
  if (frame.pixelWidth <= 0 || frame.pixelHeight <= 0) return "";
  const canvas = document.createElement("canvas");
  canvas.width = frame.pixelWidth;
  canvas.height = frame.pixelHeight;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return "";
  const pixels = new Uint8ClampedArray(frame.pixels);
  const expected = frame.pixelWidth * frame.pixelHeight * 4;
  if (pixels.length < expected) return "";
  ctx.putImageData(new ImageData(pixels.subarray(0, expected), frame.pixelWidth, frame.pixelHeight), 0, 0);
  return canvas.toDataURL("image/png");
}

function materializeHostVar(payload: HostVarPayload): unknown {
  if (payload.kind === "json") {
    return payload.value;
  }

  if (payload.kind === "channel") {
    const t = new Float64Array(payload.t);
    const v = new Float64Array(payload.v);
    const tr = new Float64Array(payload.tr);
    const w = new Float64Array(payload.w);
    const records = new Array<{ t: number; v: number; tr: number; w: number }>(payload.length);
    for (let i = 0; i < payload.length; i++) {
      records[i] = { t: t[i], v: v[i], tr: tr[i], w: w[i] };
    }
    Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
    // C2 §5.1's `.unit`/`.unitState` host-variable properties (R154/R164):
    // `.unit` a plain display string so a prose `${…}` splices it directly
    // (R154 item 5 — this never auto-appends it to a value; an author
    // places it explicitly), `.unitState` the three-state discriminator for
    // code that must tell "no unit" apart from "we don't know" (§3.3.1).
    // Non-enumerable, same as `windows` above, so `for...of`/`Plot`'s own
    // field access by index never sees them.
    Object.defineProperty(records, "unit", { value: payload.unit.state === "known" ? payload.unit.text : "", enumerable: false });
    Object.defineProperty(records, "unitState", { value: payload.unit.state, enumerable: false });
    return records;
  }

  if (payload.kind === "scatter") {
    const xs = new Float64Array(payload.x);
    const ys = new Float64Array(payload.y);
    const w = new Float64Array(payload.w);
    const records = new Array<{ x: number; y: number; w: number }>(payload.length);
    for (let i = 0; i < payload.length; i++) {
      records[i] = { x: xs[i], y: ys[i], w: w[i] };
    }
    Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
    // `.domain` is the equal-aspect square both scales share, or `null`
    // when the cell did not ask for one -- a cell writes
    // `x: { domain: scatter(...).domain }` and the same for `y`. Squaring
    // is the document's choice (`equalAspect`), computed host-side from
    // the engine's own pre-decimation extent; this realm never derives it.
    Object.defineProperty(records, "domain", { value: payload.domain, enumerable: false });
    // Two units, one per axis -- the only payload kind whose axes differ.
    Object.defineProperty(records, "unit", { value: payload.unit.state === "known" ? payload.unit.text : "", enumerable: false });
    Object.defineProperty(records, "unitState", { value: payload.unit.state, enumerable: false });
    Object.defineProperty(records, "unitY", { value: payload.unitY.state === "known" ? payload.unitY.text : "", enumerable: false });
    Object.defineProperty(records, "unitYState", { value: payload.unitY.state, enumerable: false });
    return records;
  }

  if (payload.kind === "raster") {
    const records: RasterRecord[] = payload.frames.map((frame) => ({
      x: (frame.xDomain[0] + frame.xDomain[1]) / 2,
      y: (frame.yDomain[0] + frame.yDomain[1]) / 2,
      iw: frame.pixelWidth,
      ih: frame.pixelHeight,
      src: rasterDataUrl(frame),
      w: frame.windowIndex,
    }));
    Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
    // The engine's own ramp stops and colour bounds (R177): a cell builds
    // its legend gradient from these and never reimplements Turbo.
    Object.defineProperty(records, "rampStops", { value: payload.rampStops, enumerable: false });
    Object.defineProperty(records, "scale", { value: payload.scale, enumerable: false });
    // The magnitude axis's unit, projected the same way every other
    // payload's is, so a cell (or a prose `${…}`) can label the colour
    // legend without a second lookup.
    const unit = payload.magnitudeUnit;
    Object.defineProperty(records, "unit", { value: unit !== null && unit.state === "known" ? unit.text : "", enumerable: false });
    Object.defineProperty(records, "unitState", { value: unit?.state ?? "unknown", enumerable: false });
    return records;
  }

  if (payload.kind === "gps") {
    const xs = new Float64Array(payload.x);
    const ys = new Float64Array(payload.y);
    const ts = new Float64Array(payload.t);
    const cs = new Float64Array(payload.c);
    const w = new Float64Array(payload.w);
    const records = new Array<{ x: number; y: number; t: number; c: number; w: number }>(payload.length);
    for (let i = 0; i < payload.length; i++) {
      records[i] = { x: xs[i], y: ys[i], t: ts[i], c: cs[i], w: w[i] };
    }
    Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
    // `.hasC` says whether `c` carries a resampled channel at all -- every
    // `c` is `NaN` when it does not, so a cell can tell "uncoloured trace"
    // from "coloured trace with no sample near this fix" without scanning.
    // Non-enumerable, same as `windows`, so Plot's own field access never
    // sees it.
    Object.defineProperty(records, "hasC", { value: payload.hasC, enumerable: false });
    return records;
  }

  if (payload.kind === "histogram") {
    const v0 = new Float64Array(payload.v0);
    const v1 = new Float64Array(payload.v1);
    const n = new Float64Array(payload.n);
    const w = new Float64Array(payload.w);
    const records = new Array<{ v0: number; v1: number; n: number; w: number }>(payload.length);
    for (let i = 0; i < payload.length; i++) {
      records[i] = { v0: v0[i], v1: v1[i], n: n[i], w: w[i] };
    }
    Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
    // `.unit`/`.unitState` describe `v0`/`v1` (the bin edges, in the binned
    // channel's own unit); `n` is a count or a fraction and is
    // dimensionless either way. Same non-enumerable projection as a
    // `channel` payload's, so a cell can label its value axis without a
    // second lookup.
    Object.defineProperty(records, "unit", { value: payload.unit.state === "known" ? payload.unit.text : "", enumerable: false });
    Object.defineProperty(records, "unitState", { value: payload.unit.state, enumerable: false });
    return records;
  }

  const f = new Float64Array(payload.f);
  const m = new Float64Array(payload.m);
  const w = new Float64Array(payload.w);
  const records = new Array<{ f: number; m: number; w: number }>(payload.length);
  for (let i = 0; i < payload.length; i++) {
    records[i] = { f: f[i], m: m[i], w: w[i] };
  }
  Object.defineProperty(records, "windows", { value: payload.windows, enumerable: false });
  return records;
}

/**
 * Owns every `js` cell's own rendering container inside this document (R69
 * item (a)): a `position: fixed` `<div>` per cell id, appended to
 * `document.body`, positioned/sized by the host's `layout` message and
 * transformed live by the host's `transform` message (item (b)) -- the
 * host's own `ChartCell` frame is a same-rect, pointer-events-only overlay
 * (`components/ChartCell.tsx`'s doc comment) that this container's pixels
 * show through underneath. `position: fixed` matches viewport px 1:1 with
 * `getBoundingClientRect()`, the coordinate space the host's `layout`
 * message is computed in.
 */
class CellContainers {
  private readonly byId = new Map<string, HTMLDivElement>();

  /** Returns cell `cellId`'s container, creating and appending it on first use. */
  get(cellId: string): HTMLDivElement {
    let container = this.byId.get(cellId);
    if (container === undefined) {
      container = document.createElement("div");
      container.dataset.cellId = cellId;
      container.style.position = "fixed";
      container.style.transformOrigin = "left";
      document.body.appendChild(container);
      this.byId.set(cellId, container);
    }
    return container;
  }

  /** Applies a host `layout` message's rect to cell `cellId`'s container. */
  layout(cellId: string, top: number, left: number, width: number): void {
    const container = this.get(cellId);
    container.style.top = `${top}px`;
    container.style.left = `${left}px`;
    container.style.width = `${width}px`;
  }

  /** Applies a host `transform` message to cell `cellId`'s container (R69 item (b)). */
  transform(cellId: string, translateXPx: number, scaleX: number): void {
    const container = this.byId.get(cellId);
    if (container === undefined) return;
    container.style.transform = `translateX(${translateXPx}px) scaleX(${scaleX})`;
  }

  /** Removes every container -- called on `teardown`, ahead of the whole iframe being discarded. */
  clear(): void {
    for (const container of this.byId.values()) {
      container.remove();
    }
    this.byId.clear();
  }
}

const cellContainers = new CellContainers();

/**
 * A small custom `Observer` (Runtime's own interface: `pending`/`fulfilled`/
 * `rejected`) rather than `@observablehq/inspector` — that package is not
 * among the eight approved dependencies and is not installed; the brief
 * explicitly allows either. `fulfilled` renders the value into this cell's
 * own container ({@link CellContainers}) and reports the container's
 * rendered height back to the host as `cellRendered` (R69 item (a)) --
 * nothing crosses `postMessage` as a serialized HTML string. `rejected`
 * still posts `cellError` as plain text (never HTML), and clears the
 * container so a stale successful render never lingers under a new error.
 */
function makeObserver(cellId: string) {
  return {
    pending(): void {
      // No host message on "pending" — the protocol has no such state, and
      // the host's own UI decides how to show "running" (or doesn't).
    },
    fulfilled(value: unknown): void {
      const container = cellContainers.get(cellId);
      renderCellValue(container, value);
      const heightPx = container.getBoundingClientRect().height;
      postToHost({ type: "cellRendered", cellId, heightPx });
    },
    rejected(error: unknown): void {
      cellContainers.get(cellId).replaceChildren();
      const message = error instanceof Error ? error.message : String(error);
      postToHost({ type: "cellError", cellId, message });
    },
  };
}

/**
 * Compiles a cell's fenced source into a function the Runtime can call with
 * `inputNames`' current values as positional arguments. Tries the common
 * case first — a single implicit-return expression (`Plot.plot({...})`) —
 * and falls back to treating `code` as a statement body requiring an
 * explicit `return`, the way a multi-statement cell must write it.
 *
 * // TODO(idl0): this has no free-identifier analysis — every cell receives
 * // every currently bound host-variable name as an input regardless of
 * // whether its code uses it, and cells cannot reference each other by
 * // name. A real Observable-style compiler (AST-based free-variable
 * // extraction) is out of this task's scope; revisit in Task 13 if
 * // cross-cell references are needed.
 */
function compileCell(inputNames: string[], code: string): (...args: unknown[]) => unknown {
  try {
    return new Function(...inputNames, `return (\n${code}\n);`) as (...args: unknown[]) => unknown;
  } catch (expressionError) {
    // The expression form failed — the cell may legitimately be a
    // statement body (`const x = ...; x`). But this fallback drops the
    // `return`, so a cell that *was* an expression silently evaluates to
    // `undefined` and renders the literal text "undefined" — which is
    // exactly what an illegal parameter name in `inputNames` caused for
    // every cell at once (a spectrum's host-var key is not an
    // identifier). If the statement form fails too, the code itself is
    // bad and the error must reach the cell rather than be swallowed.
    try {
      return new Function(...inputNames, code) as (...args: unknown[]) => unknown;
    } catch {
      throw expressionError;
    }
  }
}

/** A name that may be used as a `new Function` parameter — see
 *  {@link SandboxRuntime.bindHostVar}. Deliberately conservative: ASCII
 *  identifier characters only, never starting with a digit. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Owns the one `Runtime`/`module` pair this sandbox document runs for its whole lifetime. */
class SandboxRuntime {
  private readonly runtime = new Runtime();
  private readonly module = this.runtime.module();
  private readonly hostVars = new Map<string, unknown>();
  private readonly hostVariables = new Map<string, HostVariableSink>();
  private readonly boundNames = new Set<string>();
  private readonly cellVariables = new Map<string, { delete(): void }>();

  constructor() {
    // The bound `Plot` is the themed wrapper (UI-8), not the raw library —
    // every cell's own `Plot.plot({...})` call merges `plotTheme` this way,
    // since a cell's source text is exactly what a person wrote and is
    // never itself rewritten. `documentVars(document)` reads this
    // document's *own* `:root` (this file's `tokens.css` import above),
    // never the host document's, since custom properties do not cross the
    // iframe boundary.
    const themedPlotModule = themedPlot(documentVars(document));

    // Library bindings never change after construction, so a plain
    // `module.builtin()` (whose value a dependent cell reads verbatim, per
    // `bindHostVariables`'s doc comment) is correct and simpler here — no
    // update path is needed for these.
    this.module.builtin("Plot", themedPlotModule);
    this.module.builtin("d3", d3);
    this.module.builtin("Inputs", Inputs);
    this.module.builtin("html", html);
    // Also mirrored into `hostVars` (never used for `channelLookup`, which
    // only ever finds arrays) so `evalInline` can build the exact same
    // `inputNames`/argument-value pairing `compileCell` gives a persistent
    // cell, without a second bookkeeping structure.
    this.hostVars.set("Plot", themedPlotModule);
    this.hostVars.set("d3", d3);
    this.hostVars.set("Inputs", Inputs);
    this.hostVars.set("html", html);
    for (const name of ["Plot", "d3", "Inputs", "html"]) {
      this.boundNames.add(name);
    }
    // C2 §5.1's three ambient host variables, plus `channel`, start with
    // their documented defaults and are bound through `bindHostVariables`
    // (never `module.builtin()`) so a later `setHostVar` reaches every cell
    // that already resolved them — see that function's doc comment for why.
    this.bindHostVar("laps", []);
    this.bindHostVar("session", null);
    this.bindHostVar("constants", {});
    this.bindHostVar("channel", (name: string, opts?: { lap?: number; session?: string }) =>
      this.channelLookup(name, opts)
    );
    // C2 §5.3's `spectrum(channel, fft_params)` (L6 Task 20): the same
    // ambient-host-variable shape as `channel(...)` -- bound through
    // `bindHostVar`, never `module.builtin` (see that method's own doc
    // comment on why: a later `setHostVar` must reach every cell that
    // already resolved this name). `params` is ignored here except for the
    // key derivation (C2 §5.3): the host has already resolved every
    // parameter before the fetch, so this call is a lookup, never DSP.
    this.bindHostVar("spectrum", (name: string, params: FftParams) => this.spectrumLookup(name, params));
    // C2 §5.3's `histogram(channel, histogram_params)` (ruling R215 item
    // 2): the same ambient-host-variable shape as `spectrum(...)`, over the
    // binned distribution the host fetched with `fetch_histogram` (C3
    // §3.6). A lookup, never binning: the engine owns every bin edge and
    // every value (CLAUDE.md §2), and this realm only draws them.
    this.bindHostVar("histogram", (name: string, params: HistogramParams) => this.histogramLookup(name, params));
    // C2 §5.3's `scatter(xChannel, yChannel, scatter_params)` (ruling R215
    // item 3): the one data call in this grammar that names two channels.
    // A lookup, never pairing or decimating -- the engine owns both
    // (CLAUDE.md §2), and this realm draws the points it is handed.
    this.bindHostVar("scatter", (x: string, y: string, params: ScatterParams) => this.scatterLookup(x, y, params));
    // C2 §5.3's `gps(colour_by | null)` (ruling R217 item 1): the map
    // cell's trace, already projected into one local ENU frame and
    // decimated to the cell's own point budget by the engine. A lookup,
    // never a projection -- no latitude crosses into this realm
    // (CLAUDE.md §2).
    this.bindHostVar("gps", (colourBy: string | null) => this.gpsLookup(colourBy));
    // C2 §5.3's `trackGeometry` (ruling R217 item 1): the map cell's
    // reference polyline and gates, in the same frame and origin as every
    // trace for the same session, so the two superimpose without the
    // sandbox deriving anything. A bare identifier rather than a call --
    // it takes no argument and there is nothing to key it by. Starts empty
    // so a map cell that renders before `fetch_gps_trace_meta` resolves
    // draws its trace with no underlay rather than throwing.
    this.bindHostVar("trackGeometry", { polyline: [], gates: [] });
    // C2 §5.3's `spectrogram(channel, fft_params)` (ruling R217 item 4):
    // one already-rendered raster per selected window, faceted by window.
    // A lookup, never DSP and never pixel encoding -- `core::colormap`
    // owns the ramp (R177) and the engine owns every pixel.
    this.bindHostVar("spectrogram", (name: string, params: FftParams) => this.rasterLookup(name, params));
  }

  /** Updates `hostVars` (used by `channelLookup`'s by-name search), the
   *  reactive Runtime binding (via `bindHostVariables`), and the set of
   *  names every cell is given as an input (`setCells`). */
  private bindHostVar(name: string, value: unknown): void {
    this.hostVars.set(name, value);
    bindHostVariables(this.module, this.hostVariables, { [name]: value });
    // Only a name that is a legal JS identifier may join `boundNames`,
    // because `setCells` passes that set as `new Function`'s *parameter
    // list*. A spectrum's host-var name is `spectrumKey(...)` — e.g.
    // `"IMU0_AccelZ | 4096 | 2048 | hann | mean | magnitude | mean"` —
    // which is not an identifier, so including it made every cell's
    // compile throw and fall back to the no-`return` form, rendering the
    // literal string "undefined" in every chart. Such a value is still in
    // `hostVars`, so `channel(...)`/`spectrum(...)` reach it by name; only
    // the bare-identifier binding (C2 §5.1) is skipped, which it could
    // never have supported anyway.
    if (IDENTIFIER_RE.test(name)) this.boundNames.add(name);
  }

  /**
   * `channel(name, {lap?, session?})` (C2 §5.1): general lookup by name.
   * Returns the `{t, v, w}[]` array `materializeHostVar` built for `name`
   * (ruling R127 -- `w` is the window index per sample, all `0` when only
   * one window is bound), or `[]` before the host has pushed anything.
   *
   * // TODO(idl0): `lap`/`session` scoping is not implemented here — the
   * // host is responsible for deciding which pre-resolved windows to
   * // combine for a given `(name, lap, session)` combination (that
   * // resolution is Task 7's `tileToChannelData` plus R127's
   * // `combineChannelWindows`, both host-side); this is a bare-name lookup
   * // over whatever the host has already sent.
   */
  private channelLookup(name: string, _opts?: { lap?: number; session?: string }): { t: number; v: number; tr: number; w: number }[] {
    const value = this.hostVars.get(name);
    if (!Array.isArray(value)) {
      // R148: an unbound channel returns an empty array, which Plot renders
      // as axis labels and nothing else -- indistinguishable from a working
      // chart with no data. Say so rather than fail silently.
      console.warn(
        `[sandbox] channel(${JSON.stringify(name)}) is not bound; known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as { t: number; v: number; tr: number; w: number }[];
  }

  /**
   * `spectrum(channel, fft_params)` (C2 §5.3, L6 Task 20): looks up the
   * spectrum the host published for this exact `(channel, fft_params)`
   * combination, by recomputing {@link spectrumKey} from this call's own
   * arguments -- the same shared pure function `model/jsCellBinding.ts`'s
   * `bindingFor` uses on the host side to name the host variable it
   * pushes, so the two sides cannot drift. Returns the `{f, m, w}[]`
   * records `materializeHostVar` built for that key (ruling R129: `w` is
   * the window index per sample, grouping every selected window's own
   * spectrum in one array, the same treatment `channelLookup` gets), or
   * `[]` before the host has pushed anything (or if this cell's
   * `fft_params` do not match what was actually requested) -- the exact
   * shape and failure mode {@link channelLookup} already has. Never
   * fetches, never does DSP.
   */
  private spectrumLookup(name: string, params: FftParams): { f: number; m: number; w: number }[] {
    const key = spectrumKey(name, params);
    const value = this.hostVars.get(key);
    if (!Array.isArray(value)) {
      // R148, same reasoning as `channelLookup`: an unbound spectrum returns
      // an empty array, which Plot renders as axis labels and nothing else.
      // The key is printed because host and sandbox each compute it from
      // their own `FftParams`, so a mismatch here is a real failure mode.
      console.warn(
        `[sandbox] spectrum(${JSON.stringify(name)}) is not bound under key ${JSON.stringify(key)};` +
          ` known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as { f: number; m: number; w: number }[];
  }

  /**
   * `histogram(channel, histogram_params)` (C2 §5.3, ruling R215 item 2):
   * looks up the distribution the host published for this exact (channel,
   * `histogram_params`) combination, by recomputing {@link histogramKey}
   * from this call's own arguments -- the same shared pure function the
   * host side uses to name the variable it pushes, so the two cannot
   * drift. Returns the `{v0, v1, n, w}[]` records `materializeHostVar`
   * built (one per bin per selected window; `w` is the window index, the
   * same treatment {@link channelLookup}/{@link spectrumLookup} get), or
   * `[]` before the host has pushed anything. Never fetches, never bins.
   */
  private histogramLookup(name: string, params: HistogramParams): { v0: number; v1: number; n: number; w: number }[] {
    const key = histogramKey(name, params);
    const value = this.hostVars.get(key);
    if (!Array.isArray(value)) {
      // R148, same reasoning as `channelLookup`/`spectrumLookup`: an
      // unbound distribution returns an empty array, which Plot renders as
      // axis labels and nothing else. The key is printed because host and
      // sandbox each compute it from their own `HistogramParams`, so a
      // mismatch here is a real failure mode.
      console.warn(
        `[sandbox] histogram(${JSON.stringify(name)}) is not bound under key ${JSON.stringify(key)};` +
          ` known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as { v0: number; v1: number; n: number; w: number }[];
  }

  /**
   * `scatter(xChannel, yChannel, scatter_params)` (C2 §5.3, ruling R215
   * item 3): looks up the cloud the host published for this exact triple,
   * by recomputing {@link scatterKey} from this call's own arguments --
   * the same shared pure function the host side uses to name the variable
   * it pushes. Returns the `{x, y, w}[]` records `materializeHostVar`
   * built, carrying a non-enumerable `.domain` (the equal-aspect square,
   * or `null`) and per-axis `.unit`/`.unitY`, or `[]` before the host has
   * pushed anything. Never fetches, never pairs, never decimates.
   */
  private scatterLookup(xChannel: string, yChannel: string, params: ScatterParams): { x: number; y: number; w: number }[] {
    const key = scatterKey(xChannel, yChannel, params);
    const value = this.hostVars.get(key);
    if (!Array.isArray(value)) {
      // R148, same reasoning as the other three lookups: an unbound cloud
      // returns an empty array, which Plot renders as axis labels and
      // nothing else. Say so rather than fail silently.
      console.warn(
        `[sandbox] scatter(${JSON.stringify(xChannel)}, ${JSON.stringify(yChannel)}) is not bound under key ${JSON.stringify(key)};` +
          ` known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as { x: number; y: number; w: number }[];
  }

  /**
   * `gps(colour_by | null)` (C2 §5.3, ruling R217 item 1): looks up the
   * projected trace the host published for this colour-by channel, by
   * recomputing {@link gpsKey} from this call's own argument -- the same
   * shared pure function the host side uses to name the variable it
   * pushes, so the two cannot drift. Returns the `{x, y, t, c, w}[]`
   * records `materializeHostVar` built (metres east, metres north, seconds,
   * the resampled colour channel, and the window index; a `NaN` row
   * separates each window's own trace so a `Plot.line` breaks rather than
   * vaulting between laps), or `[]` before the host has pushed anything.
   * Never fetches, never projects.
   */
  private gpsLookup(colourBy: string | null): { x: number; y: number; t: number; c: number; w: number }[] {
    const key = gpsKey(colourBy);
    const value = this.hostVars.get(key);
    if (!Array.isArray(value)) {
      // R148, same reasoning as the other lookups: an unbound trace returns
      // an empty array, which Plot renders as axis labels and nothing else.
      console.warn(
        `[sandbox] gps(${JSON.stringify(colourBy)}) is not bound under key ${JSON.stringify(key)};` +
          ` known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as { x: number; y: number; t: number; c: number; w: number }[];
  }

  /**
   * `spectrogram(channel, fft_params)` (C2 §5.3, ruling R217 item 4): looks
   * up the rasters the host published for this exact (channel,
   * `fft_params`) combination, by recomputing {@link rasterKey} from this
   * call's own arguments. Returns **one record per selected window** --
   * `{x, y, iw, ih, src, w}`, the image's frame in data coordinates, its
   * `data:` URL, and its window index -- because pixels cannot interleave
   * the way a channel's samples can, so a spectrogram facets by `w` rather
   * than concatenating. `[]` before the host has pushed anything. Never
   * fetches, never does DSP, never encodes a colour ramp.
   */
  private rasterLookup(name: string, params: FftParams): RasterRecord[] {
    const key = rasterKey(name, params);
    const value = this.hostVars.get(key);
    if (!Array.isArray(value)) {
      // R148, same reasoning as the other lookups.
      console.warn(
        `[sandbox] spectrogram(${JSON.stringify(name)}) is not bound under key ${JSON.stringify(key)};` +
          ` known host vars: ${JSON.stringify([...this.hostVars.keys()])}`
      );
      return [];
    }
    return value as RasterRecord[];
  }

  /** Binds or updates one host variable (`setHostVar`). */
  setHostVar(name: string, payload: HostVarPayload): void {
    this.bindHostVar(name, materializeHostVar(payload));
  }

  /**
   * Evaluates one inline `${…}` prose span (C2 §5.2) as a one-shot
   * expression — not a persistent Runtime `Variable` the way `setCells`'
   * cells are, since a span has no lifetime beyond "get this one string
   * now". Reuses `compileCell`'s exact construction (same `inputNames`,
   * same `new Function` wrapping, including its implicit-return-expression
   * fallback) so `${…}`'s scope is identical to a `js` cell's, per C2
   * §5.2's "same host-mediated scope" requirement — the difference is only
   * that the result is `String(value)`-coerced and posted as
   * `inlineResult`/`spanError` instead of becoming a Runtime observer's
   * `fulfilled`/`rejected` callback.
   *
   * On success, posts `{ type: "inlineResult", spanId, text }`; on a
   * throw, posts `{ type: "spanError", spanId, message }` (R66 item 2,
   * L6 Task 13b) — a distinct message from `cellError`, since a span id
   * and a fence-string cell id are conceptually different and, before
   * this task, both travelled in `cellError`'s `cellId` slot, which made
   * a span failure indistinguishable from an actual cell's failure on the
   * host side.
   */
  evalInline(spanId: string, expr: string): void {
    const inputNames = [...this.boundNames];
    const args = inputNames.map((name) => this.hostVars.get(name));
    try {
      const fn = compileCell(inputNames, expr);
      const value = fn(...args);
      postToHost({ type: "inlineResult", spanId, text: String(value) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postToHost({ type: "spanError", spanId, message });
    }
  }

  /**
   * Replaces the whole cell set. Every previously defined cell `Variable` is
   * deleted first — simpler and safer than trying to diff and redefine
   * anonymous variables, at the cost of re-running every cell (not just
   * changed ones) on every edit.
   *
   * // TODO(idl0): this redefine-all approach, and giving every cell every
   * // currently bound name as an input (see `compileCell`'s own TODO)
   * // rather than just the names its code actually uses, are both
   * // judgment calls for this task, not settled design — a finer-grained
   * // diff and free-identifier analysis can replace both later without
   * // changing the message protocol.
   */
  setCells(cells: SandboxCell[]): void {
    for (const variable of this.cellVariables.values()) {
      variable.delete();
    }
    this.cellVariables.clear();

    const inputNames = [...this.boundNames];
    for (const cell of cells) {
      const fn = compileCell(inputNames, cell.code);
      const variable = this.module.variable(makeObserver(cell.id)).define(inputNames, fn);
      this.cellVariables.set(cell.id, variable);
    }
  }

  /** Tears down every cell ahead of the whole iframe being discarded. */
  teardown(): void {
    for (const variable of this.cellVariables.values()) {
      variable.delete();
    }
    this.cellVariables.clear();
  }
}

let sandboxRuntime: SandboxRuntime | null = null;

function handleMessage(message: HostToSandboxMessage): void {
  switch (message.type) {
    case "init":
      sandboxRuntime = new SandboxRuntime();
      break;
    case "setHostVar":
      sandboxRuntime?.setHostVar(message.name, message.value);
      break;
    case "setCells":
      sandboxRuntime?.setCells(message.cells);
      break;
    case "evalInline":
      sandboxRuntime?.evalInline(message.spanId, message.expr);
      break;
    case "transform":
      cellContainers.transform(message.cellId, message.translateXPx, message.scaleX);
      break;
    case "layout":
      cellContainers.layout(message.cellId, message.top, message.left, message.width);
      break;
    case "ping":
      postToHost({ type: "pong", nonce: message.nonce });
      break;
    case "teardown":
      sandboxRuntime?.teardown();
      sandboxRuntime = null;
      cellContainers.clear();
      break;
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  // The host is a trusted party (this document's own creator), unlike the
  // sandbox→host direction the host must itself validate; the check here is
  // only "did this come from our parent frame", not a payload shape check.
  if (event.source !== window.parent) {
    return;
  }
  handleMessage(event.data as HostToSandboxMessage);
});

// `ready` now means "this document has loaded and attached its message
// listener" — sent unconditionally, once, right after the listener above is
// registered, rather than only as `init`'s reply (review-task5b.md Critical
// finding: gating `ready` on `init` made it impossible for the host to know
// *when* it's safe to send `init` itself in the first place). The host's
// `OutboundQueue` (`host/outboundQueue.ts`) holds every outbound message
// (including `init`) until this arrives, then flushes in order.
postToHost({ type: "ready" });
