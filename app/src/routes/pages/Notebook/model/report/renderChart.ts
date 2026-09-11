/**
 * Host-side chart re-render for the report (decisions 85/89, ruling R173,
 * `runs/2026-09-09/report-plan.md` §1.2 option C, task R5). A `js` cell's
 * chart lives, on screen, inside the origin-isolated sandbox iframe (R69)
 * and never crosses `postMessage` as markup or pixels — this module is the
 * report's separate, host-realm render path for the one subset of `js`
 * cells the Properties form's closed grammar recognises
 * (`plotForm/parse.ts`): it re-runs `@observablehq/plot` itself, in this
 * document, on the same already-fetched channel data and the same theme/
 * palette the screen uses, so no sandbox is needed and R69's trust boundary
 * never moves. Custom-code cells (`plotForm.parse` returns `null`) and FFT
 * cells (`PlotProps.chart === "fft"`) are decided as typed absences one
 * level up, in `model/report/document.ts` — this module only ever receives
 * a cell `document.ts` has already committed to rendering, per **ruling
 * R173**'s split: "`document.ts` decides *that* a chart belongs there and
 * *what* it is made of; `renderChart` is the only thing that touches the
 * DOM."
 *
 * Split in two for testability (no `jsdom`/`happy-dom` in this worktree,
 * and adding one is out of this lane's scope — R173): {@link
 * buildPlotOptions} is pure data-shaping (`TimePlotProps` + already-fetched
 * channel data -> the exact `Plot.plot` options object), fully covered by
 * `renderChart.test.ts` with no DOM at all. {@link renderChart} itself is
 * the thin, one-call DOM-touching wrapper — `await import(...)` (so
 * `@observablehq/plot`/`d3` land in a lazily-fetched chunk, not the
 * startup bundle, plan §2.3) followed by one `Plot.plot(...)` call — and is
 * not unit-tested, the same treatment CLAUDE.md §4 already gives
 * `ReportView`'s own rendering.
 */
import type { MarkOptions as PlotMarkOptions, Markish, PlotOptions } from "@observablehq/plot";
import type { MarkProps, TimePlotProps } from "../../plotForm/types";
import type { PlotThemeOptions } from "../../theme/plotTheme";
import type { CombinedChannelPayload } from "../channelBindDriver";

/**
 * Thrown when {@link buildPlotOptions}/{@link renderChart} is asked to draw
 * a mark whose channel has no entry in `channelData` — a caller-contract
 * violation, not user-facing data: `document.ts`'s `buildChartBlocks` only
 * ever builds a `chartSlot` once every channel every mark references has
 * already resolved (R173). Kept typed rather than a bare crash (CLAUDE.md
 * §5), so a violation of that contract surfaces as a named error instead of
 * a silently partial chart standing in for genuinely missing data.
 */
export class MissingChannelDataError extends Error {
  /** The `MarkProps.channel` name that had no entry in `channelData`. */
  readonly channel: string;

  constructor(channel: string) {
    super(`renderChart: no channel data supplied for channel "${channel}"`);
    this.name = "MissingChannelDataError";
    this.channel = channel;
  }
}

/** One mark's fixed option pair (C2 §5.3: every mark binds `y: "v"` and
 *  an `x` of `"t"` or `"tr"` — see `plotForm/parse.ts`'s
 *  `readMarkOptions`), plus whichever `stroke`/`strokeWidth` this mark ends
 *  up drawn with. */
type TimeMarkOptions = Pick<PlotMarkOptions, "stroke" | "strokeWidth"> & { x: "t" | "tr"; y: "v" };

/** One channel-payload row, in the shape `x`/`y: "v"` mark options bind
 *  against — the same `{t, v, tr}` triple `sandbox/main.ts`'s
 *  `materializeHostVar` builds for a `"channel"` host variable, minus the
 *  `w` column: a caller here has already partitioned by window (see
 *  {@link recordsForWindow}) or intends every window's samples in one mark
 *  (see {@link recordsFor}), so `w` has already done its job by the time
 *  this shape exists.
 *
 *  `tr` is carried alongside `t` rather than being resolved to one column
 *  here (ruling R215 items 4-5): which of the two a mark binds is the
 *  mark's own `xField`, and building both keeps one record shape for every
 *  mark in a plot even though a plot's marks all bind the same one. */
interface TimeRecord {
  t: number;
  v: number;
  tr: number;
}

/** Every sample in `payload`, across every window it carries, in original
 *  order — used when a mark has its own fixed `stroke` (an author colour
 *  choice takes precedence over this report's own per-window colouring,
 *  see {@link buildMarks}'s doc comment) and so needs no per-window split.
 *  Includes `payload`'s own break rows (`t`/`v` both `NaN` between windows,
 *  `host/protocol.ts`'s `combinePairedWindows`) unchanged: Observable
 *  Plot's line-family marks already break a line at a `NaN` value, so a
 *  multi-window payload drawn as one mark still renders as *n* separate
 *  segments in the one fixed colour, never a line vaulting between
 *  windows. */
function recordsFor(payload: CombinedChannelPayload): TimeRecord[] {
  const records = new Array<TimeRecord>(payload.length);
  for (let i = 0; i < payload.length; i++) {
    records[i] = { t: payload.t[i], v: payload.v[i], tr: payload.tr[i] };
  }
  return records;
}

/** Only `payload`'s samples whose own `w` equals `windowIndex` (a payload's
 *  break rows carry `w: NaN`, which never equals any real index, so they
 *  are excluded here rather than needing a separate filter) — used to draw
 *  one window's own segment in that window's own colour (see
 *  {@link buildMarks}). */
function recordsForWindow(payload: CombinedChannelPayload, windowIndex: number): TimeRecord[] {
  const records: TimeRecord[] = [];
  for (let i = 0; i < payload.length; i++) {
    if (payload.w[i] === windowIndex) records.push({ t: payload.t[i], v: payload.v[i], tr: payload.tr[i] });
  }
  return records;
}

/** Matches a `WindowDescriptor.colour` token (`--chart-1` … `--chart-8`,
 *  ruling R117 item 6 — never a hex literal at that layer). */
const CHART_TOKEN_RE = /^--chart-([1-8])$/;

/**
 * A mark's `stroke`, an Observable Plot mark option, is ambiguous by
 * design: a value Plot recognises as a CSS colour is a literal paint, but
 * any other string is instead read as a *data channel* — a field name to
 * bind a colour scale to, per record (confirmed against this worktree's
 * actual `@observablehq/plot`; every raw `--chart-N`/`--not-...` token
 * this module could otherwise emit here fails that check). A raw,
 * unresolved token would therefore not render "harmlessly unstyled" but
 * would silently become a channel binding to a field that does not exist
 * on any record — a worse, quieter failure than this fallback is trying to
 * avoid. `"currentColor"` is always a valid CSS colour keyword, so it is
 * always read as the literal it is.
 */
const FALLBACK_STROKE = "currentColor";

/**
 * Resolves one window's `--chart-N` colour token to a concrete colour from
 * `palette` (`theme/series.ts`'s `seriesPalette`, resolved once by
 * `ReportView` against the host document — this module takes it as a
 * parameter so it stays DOM-free itself, `plotTheme.ts`'s own pattern).
 * `palette` is expected to hold all eight tokens in `--chart-1`…`--chart-8`
 * order (`seriesPalette`'s own contract); a malformed token (never emitted
 * by this codebase, ruling R117 item 6) or an empty `palette` falls back to
 * {@link FALLBACK_STROKE} rather than throwing — a plain, visible line in
 * the surrounding text colour is a smaller failure than aborting the whole
 * chart over one window's colour.
 */
function windowColour(colourToken: string, palette: readonly string[]): string {
  const match = CHART_TOKEN_RE.exec(colourToken);
  if (match === null || palette.length === 0) return FALLBACK_STROKE;
  const index = Number(match[1]) - 1;
  return palette[index % palette.length];
}

function timeMarkOptions(x: "t" | "tr", y: "v", stroke: string | undefined, strokeWidth: number | undefined): TimeMarkOptions {
  const options: TimeMarkOptions = { x, y };
  if (stroke !== undefined) options.stroke = stroke;
  if (strokeWidth !== undefined) options.strokeWidth = strokeWidth;
  return options;
}

/** Calls the one Plot mark-constructor `mark.mark` names (C2 §5.3's five
 *  `mark_name`s, `plotForm/types.ts`'s `MARK_NAMES`) — a `switch`, not a
 *  dynamic `Plot[mark.mark](...)` index, so each branch's own specific
 *  `XxxOptions` type checks `options` on its own terms rather than widening
 *  every call to one loose common signature. */
function callMark(Plot: typeof import("@observablehq/plot"), name: MarkProps["mark"], data: TimeRecord[], options: TimeMarkOptions): Markish {
  switch (name) {
    case "lineY":
      return Plot.lineY(data, options);
    case "dot":
      return Plot.dot(data, options);
    case "areaY":
      return Plot.areaY(data, options);
    case "rectY":
      return Plot.rectY(data, options);
    case "ruleY":
      return Plot.ruleY(data, options);
  }
}

/**
 * Builds one `MarkProps`'s `Markish[]` — one element when the mark has its
 * own fixed `stroke` (the author's explicit colour choice, honoured
 * exactly as `sandbox/main.ts` would render it: one call over every
 * window's samples, breaks and all), or one element **per window** the
 * channel's payload actually carries when `stroke` is unset. The
 * per-window split only exists for the report: the live screen never
 * overlays more than its one primary window in a chart (ruling R131 Q1),
 * so this need never arose there, but the report overlays every selected
 * window in the one chart a `js` cell produces (plan §4) and has no hover
 * legend to tell them apart on paper — so, with no author colour to defer
 * to, each window draws in its own `--chart-N` colour, the same token the
 * report's selection swatches already use (plan §3.1 item 3).
 */
function buildMarks(mark: MarkProps, channelData: ReadonlyMap<string, CombinedChannelPayload>, palette: readonly string[], Plot: typeof import("@observablehq/plot")): Markish[] {
  const payload = channelData.get(mark.channel);
  if (payload === undefined) throw new MissingChannelDataError(mark.channel);

  // Ruling R215 items 4-5: a mark binds the lap-relative column when its
  // own `xField` says so. Without this the report would silently redraw a
  // lap-pair overlay or a variance trace on session time -- the traces
  // would sit end to end instead of superimposed, which looks like real
  // data and is not what the cell says.
  const xField = mark.xField ?? "t";

  if (mark.stroke !== undefined) {
    const options = timeMarkOptions(xField, "v", mark.stroke, mark.strokeWidth);
    return [callMark(Plot, mark.mark, recordsFor(payload), options)];
  }

  return payload.windows.map((descriptor, windowIndex) => {
    const options = timeMarkOptions(xField, "v", windowColour(descriptor.colour, palette), mark.strokeWidth);
    return callMark(Plot, mark.mark, recordsForWindow(payload, windowIndex), options);
  });
}

/**
 * Pure: `props` + already-fetched `channelData` + the screen's own theme/
 * palette -> the exact options object {@link renderChart} hands to
 * `Plot.plot`. No DOM, no `@observablehq/plot` *value* import of its own —
 * `Plot` is passed in by the caller, so this module never has to decide
 * whether to import it statically or dynamically. {@link renderChart}
 * passes the module its own dynamic `import()` resolved (so
 * `@observablehq/plot`/`d3` stay out of the startup bundle, plan §2.3);
 * `renderChart.test.ts` passes a plain top-level `import * as Plot from
 * "@observablehq/plot"` instead, and calls the real mark constructors
 * (`Plot.lineY`, `Plot.dot`, …) directly — those do no DOM work at all
 * (only `Plot.plot(...)` itself needs a real `document`, confirmed against
 * this worktree's actual dependency), so this function runs, genuinely
 * exercised, under plain Node with no `jsdom`/`happy-dom` (not installed
 * here, and adding one is out of this lane's scope — ruling R173's
 * amendment). No stub of `Plot` anywhere: a fake that exists only to let
 * an untested one-liner be half-tested would buy nothing.
 *
 * Mirrors `sandbox/main.ts`'s `themedPlot` merge (grid/marginLeft from the
 * theme, a cell's own `style` — here, the report has none — merged key-by-
 * key over the theme's), so a report chart's chrome matches the screen's.
 * `props.color` (C2 §5.3's `{ legend: true }`) is deliberately not
 * forwarded: Plot's legend is driven by a data channel mapped through a
 * colour *scale*, and every stroke this function emits is already a fixed
 * literal (an author's own choice, or a per-window token resolved above) —
 * there is no colour channel for a scale to legend against. The report's
 * own selection block (task R1, plan §3.1 item 3) is this document's
 * colour key instead.
 */
export function buildPlotOptions(
  props: TimePlotProps,
  channelData: ReadonlyMap<string, CombinedChannelPayload>,
  theme: PlotThemeOptions,
  palette: readonly string[],
  Plot: typeof import("@observablehq/plot"),
): PlotOptions {
  const marks: Markish[] = [];
  // C2 §5.3's `zero_rule`, first so it draws under the data (ruling R215
  // item 5) — the same order `plotForm/generate.ts` emits it in, so the
  // report and the live chart stack their marks identically.
  if (props.zeroLine === true) marks.push(Plot.ruleY([0]));
  for (const mark of props.marks) {
    marks.push(...buildMarks(mark, channelData, palette, Plot));
  }

  const options: PlotOptions = {
    grid: theme.grid,
    marginLeft: theme.marginLeft,
    style: theme.style,
    marks,
  };
  // C2 §5.3's `title` is a real Plot option, so a titled cell keeps its
  // title on paper too — a report that dropped it would name the chart
  // differently from the notebook it was printed from.
  if (props.title !== undefined) options.title = props.title;
  if (props.x !== undefined) options.x = props.x;
  if (props.y !== undefined) options.y = props.y;
  return options;
}

/** Thrown when `Plot.plot(...)` returns something other than an
 *  `SVGSVGElement` — every mark this module's closed grammar can produce
 *  (`MARK_NAMES`) renders as a bare `<svg>` root, so this should never
 *  fire; typed rather than a silent cast so a genuine mismatch (e.g. a
 *  future Plot upgrade returning a `<figure>` wrapper for these marks)
 *  fails loudly instead of handing `ReportView` a value it cannot mount. */
export class UnexpectedPlotOutputError extends Error {
  constructor() {
    super("renderChart: Plot.plot(...) did not return an SVGSVGElement");
    this.name = "UnexpectedPlotOutputError";
  }
}

/**
 * Renders one already-committed-to time chart (`document.ts`'s
 * `chartSlot`, R173) to a real `SVGSVGElement` in this (host) document —
 * vector, selectable text, this document's own `@font-face` rules apply
 * (plan §1.2 option C). The only DOM-touching line in this module; see the
 * module doc comment for why the data-shaping half is split out into
 * {@link buildPlotOptions} instead. Not unit-tested (CLAUDE.md §4).
 *
 * **Stays a one-liner over `buildPlotOptions`.** If this function ever
 * needs a conditional of its own — a fallback, an empty-data guard, a
 * branch on chart kind — that conditional belongs in `buildPlotOptions`,
 * where it is testable, not here. The moment untested code makes a
 * decision, "UI rendering is not unit-tested" (CLAUDE.md §4) has quietly
 * become "this logic is not tested."
 */
export async function renderChart(
  props: TimePlotProps,
  channelData: ReadonlyMap<string, CombinedChannelPayload>,
  theme: PlotThemeOptions,
  palette: readonly string[],
): Promise<SVGSVGElement> {
  const Plot = await import("@observablehq/plot");
  const node = Plot.plot(buildPlotOptions(props, channelData, theme, palette, Plot));
  if (!(node instanceof SVGSVGElement)) throw new UnexpectedPlotOutputError();
  return node;
}
