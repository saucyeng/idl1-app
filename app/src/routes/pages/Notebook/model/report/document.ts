/**
 * The report's document model (decisions 85/89, `runs/2026-09-09/report-plan.md`
 * tasks R1/R4/R6, rulings R166/R173). Pure: no React, no DOM, no IPC import —
 * this module turns already-fetched data into a flat, typed, ordered block
 * list that `components/ReportView.tsx` (tasks R2/R6) renders and
 * `model/report/toPdf.ts` (task R7) will one day feed to a PDF writer.
 * Every test in `document.test.ts` exercises this module directly, with no
 * jsdom.
 *
 * **Per-window, not primary-window-only (task R4).** The screen only ever
 * shows the *primary* window (`index.tsx`'s `primaryWindow`, ruling
 * R131 Q1) — this document does not inherit that limit (plan §4): one
 * `windowSection` (or, for a window whose own evaluation failed,
 * {@link WindowFailureBlock} — R121, never dropped, never merged into a
 * neighbour) per entry of `windows`/`evals`, in selection order, plus a
 * {@link ComparisonBlock} of every scalar definition once more than one
 * window is selected (plan §4: two laps is the normal case, not an edge
 * case).
 *
 * **Charts (task R6, ruling R173).** A `js` cell never appears inline in a
 * window's own content — unlike a `math`/`table` cell, its chart is not
 * per-window content at all: `plotForm`-generated code always overlays
 * every selected window in the one chart it draws (plan §4), because that
 * is how `channelBindDriver.ts`'s `CombinedChannelPayload` already arrives
 * (every window's samples in one array, `w`-tagged). So every `js` cell is
 * decided exactly **once**, in document-cell order, by {@link
 * buildChartBlocks} — never once per selected window — and its block (a
 * {@link ChartSlotBlock}, carrying its own printed caption — see
 * {@link formatChartCaption} — or a chart {@link AbsenceBlock}) is placed after
 * every window's own section, grouped with the others (plan §4: "overlay
 * charts grouped after them"). Per **ruling R173**'s split, this module
 * decides *that* a chart belongs there and *what* it is made of — the
 * parsed `PlotProps`, the already-fetched channel data — and never
 * constructs an `SVGSVGElement` or touches the DOM itself; only
 * `model/report/renderChart.ts` (task R5), called from `ReportView`, does
 * that. A cell `plotForm.parse` rejects (custom code) or whose `PlotProps`
 * is an FFT chart (not yet supported by `renderChart.ts`) is a named
 * absence instead, never a silent gap (R148/R150/R153).
 */
import type { CellOutput, IpcError, WindowEval } from "../../../../../ipc/workbook";
import type { SessionSummary } from "../../../../../ipc/catalog";
import { describeWindow, sessionLabel, type SelectionWindow } from "../../../../../state/selection";
import type { ScannedCell } from "../cells";
import { parse } from "../../plotForm/parse";
import type { PlotProps, TimePlotProps } from "../../plotForm/types";
import type { ProseBlock as ProseBlockData } from "../proseBlocks";
import type { CombinedChannelPayload } from "../channelBindDriver";
import { formatRate, formatUnit, type UnitDisplay } from "../unitText";
import { X_MODE_OPTIONS, type XMode } from "../xMode";

/** The report's cover page: title, when it was built, and the provenance a
 *  reader would need to reproduce any number in it (plan §3.1 item 1). */
export interface CoverBlock {
  kind: "cover";
  title: string;
  /** i64, Unix epoch ms — when this document was built, not when the
   *  session was recorded. */
  generatedAtMs: number;
  appVersion: string;
  /** The primary session's `engine_version`, or "not recorded" when there
   *  is no session to read one from. */
  engineVersion: string;
  /** The primary session's `importer_version`, same fallback. */
  importerVersion: string;
}

/** One session's identity block (plan §3.1 item 2) — one per distinct
 *  session across the whole selection, not just the primary window's. A
 *  field recorded as `""` (C1 §6) renders `"not recorded"` here, never
 *  blank (R148/R153): the empty string is resolved to that text in this
 *  block already, so `ReportView` never has to repeat the rule. */
export interface SessionBlock {
  kind: "session";
  sessionId: string;
  rider: string;
  bike: string;
  venueName: string;
  eventName: string;
  /** `"not recorded"` when `timestamp_utc_ms === 0` (C1 §3.1). */
  timestampText: string;
  sourceFormat: string;
  /** `"not recorded"` when `device_id === null` (C1 §2, FIT/GPX/CSV). */
  deviceId: string;
}

/** One selected window's row in the report's selection block (plan §3.1
 *  item 3) — every window in the selection, in order, independent of
 *  which window's content sections got built. */
export interface SelectionRow {
  label: string;
  colour: string;
}

export interface SelectionBlock {
  kind: "selection";
  windows: SelectionRow[];
}

/** One heading marking the start of a window's content sections — one per
 *  entry of the selection (task R4). */
export interface WindowSectionBlock {
  kind: "windowSection";
  label: string;
  colour: string;
}

/** A window whose own `evalWorkbookV2` entry failed (ruling R121) —
 *  its own section, in its selection position, never dropped and never
 *  merged into a neighbour (plan §4: "the single worst outcome this lane
 *  can produce" is a report that silently omits a lap that errored). */
export interface WindowFailureBlock {
  kind: "windowFailure";
  label: string;
  colour: string;
  error: IpcError;
}

/** One rendered prose block (a cell's `prose_before`/`prose_after`, C2
 *  §2.4). Carries the same two states `ProseBlockContent` already has —
 *  this module does not resolve `${…}` spans (they are filled, in the live
 *  app, from a live sandbox round trip this static document has no
 *  channel for); an unresolved span's literal `${expr}` source shows
 *  through in `html`, matching `ProseBlock.tsx`'s own fallback for a span
 *  with no result yet. */
export type ReportProseBlock =
  | { kind: "prose"; cellId: string; position: "before" | "after"; html: string }
  | { kind: "prose"; cellId: string; position: "before" | "after"; text: string };

/** One `math`-cell definition's row (plan §3.2 — the fix for the gap
 *  `MathCell.tsx` has today: name and sample count with no unit and no
 *  rate, even though both are on the wire). `valueText` mirrors
 *  `MathCell.tsx`'s `DefRow`: the def's own error text, the
 *  `HostChannelRef` marker, or "—". */
export interface DefTableRow {
  name: string;
  label: string | null;
  valueText: string;
  unit: UnitDisplay;
  /** `null` when a rate is genuinely not applicable (R152) — a scalar
   *  reduction has no sample rate, and this is never rendered as
   *  "unknown". */
  rateText: string | null;
}

export interface DefTableBlock {
  kind: "defTable";
  cellId: string;
  rows: DefTableRow[];
}

/** One grid row's cells, `TableCell.tsx`'s per-grid-cell shape flattened to
 *  display text: a numeric value or that cell's own evaluator error. */
export interface TableBlock {
  kind: "table";
  cellId: string;
  rows: { text: string; isError: boolean }[][];
}

/** A cell this report could not include, named rather than silently
 *  dropped (R148/R150/R153) — a `math`/`table` cell with no evaluated
 *  output for a window, or (task R6) a `js` cell whose code is custom
 *  (`plotForm.parse` returned `null`), whose chart is an FFT/spectrum
 *  chart (not yet supported by `renderChart.ts`), or whose channel data
 *  was not supplied to this build. */
export interface AbsenceBlock {
  kind: "absence";
  cellId: string;
  reason: string;
}

/** One `js` cell this report **will** render (task R6, ruling R173) —
 *  everything `renderChart.ts` needs and nothing it doesn't: the parsed
 *  form state, and that cell's own channel-data map (`channelId` ->
 *  {@link CombinedChannelPayload}, every mark's channel already resolved —
 *  {@link buildChartBlocks} never emits this block otherwise). No
 *  `SVGSVGElement` here — this module stays DOM-free; `ReportView` is what
 *  calls `renderChart`. `windowLabels` is every window this chart's data
 *  actually spans (deduplicated, selection order not guaranteed — read
 *  from the channel payloads themselves), for `ReportView`'s caption.
 *  `caption` ({@link formatChartCaption}) is that caption's full printed
 *  text -- the window names plus the worksheet's X mode and the point
 *  count the data was *actually* reduced to (plan §3.4), never the budget
 *  that was requested: a zoomed-out static chart has no hover/zoom to
 *  check that against, so a wrong number here is a specific false
 *  statement about the signal, worse than no caption at all. */
export interface ChartSlotBlock {
  kind: "chartSlot";
  cellId: string;
  props: TimePlotProps;
  channelData: ReadonlyMap<string, CombinedChannelPayload>;
  windowLabels: string[];
  caption: string;
}

/** One scalar definition's row in the {@link ComparisonBlock} (plan §4) —
 *  matched by definition `name` across every window that evaluated it.
 *  `cells[i]` corresponds to `ComparisonBlock.columns[i]` (the same
 *  selection order as {@link SelectionBlock}); `null` marks a window with
 *  no result for this definition (it never evaluated, or that window's
 *  own evaluation failed) — never coerced to an empty string, so
 *  `ReportView` can render it as its own dash rather than an
 *  indistinguishable blank. */
export interface ComparisonRow {
  name: string;
  label: string | null;
  cells: (string | null)[];
}

/** Scalar definitions (`sample_rate_hz === null`, or `value.has_t ===
 *  false`, plan §4) across every window, one column per selected window —
 *  present only once more than one window is selected (plan §3.1 item 5:
 *  "when more than one window is selected"). */
export interface ComparisonBlock {
  kind: "comparison";
  columns: SelectionRow[];
  rows: ComparisonRow[];
}

/** Every diagnostic this document collected while it was built: unit notes
 *  (R154 §2.1), structural cell errors, and every absence's reason —
 *  gathered once here rather than scattered per-section, so a reader can
 *  find "why isn't X in this report" in one place (plan §3.1 item 6). */
export interface AppendixBlock {
  kind: "appendix";
  entries: string[];
}

export type ReportBlock =
  | CoverBlock
  | SessionBlock
  | SelectionBlock
  | WindowSectionBlock
  | WindowFailureBlock
  | ReportProseBlock
  | DefTableBlock
  | TableBlock
  | AbsenceBlock
  | ChartSlotBlock
  | ComparisonBlock
  | AppendixBlock;

export interface ReportDocument {
  blocks: ReportBlock[];
}

/** `plotForm.parse` rejected this cell's code — the plan's own quoted
 *  example (§1.2): "never as a gap." */
function customCodeReason(cellId: string): string {
  return `Chart \`${cellId}\` is custom code and could not be included in this report.`;
}

/** A chart kind `renderChart.ts` (task R5) does not draw. It only renders
 *  a **time** chart; an FFT or histogram cell is parseable (not "custom
 *  code") but still out of that task's scope, so it gets an absence block
 *  that names which kind it is rather than one generic line. Exhaustive by
 *  the `Record` type, so a chart kind added to `PlotProps` without a reason
 *  here is a compile error, never a silent omission from a report. */
const NON_TIME_CHART_ABSENCE_REASONS: Record<Exclude<PlotProps["chart"], "time">, string> = {
  fft: "FFT/spectrum charts are not yet included in reports — this cell's chart could not be included.",
  histogram: "Histogram charts are not yet included in reports — this cell's chart could not be included.",
};

/** This cell parsed and is a time chart, but no channel data was supplied
 *  for it at all (the caller never fetched/retained any, e.g. the cell was
 *  never bound this session) — distinct from a *specific* missing channel
 *  (see `missingChannelReason`), which can only happen for a multi-channel
 *  cell missing one of several. */
function noChartDataReason(cellId: string): string {
  return `Cell ${cellId}: no channel data was available when this report was built.`;
}

/** One of a multi-channel chart's marks names a channel this build's
 *  channel-data map has no entry for — named specifically, not folded into
 *  {@link noChartDataReason}'s generic text, since the cell's *other*
 *  channels did resolve. */
function missingChannelReason(channel: string): string {
  return `Chart data for channel "${channel}" was not available when this report was built.`;
}

/** `""`/`null` -> `"not recorded"`, the one shared rule for every "not set"
 *  field this document renders (C1 §2/§6, R148/R153). */
function recordedOr(value: string | null, fallback = "not recorded"): string {
  return value === null || value === "" ? fallback : value;
}

function findSession(sessionId: string, sessions: readonly SessionSummary[]): SessionSummary | null {
  return sessions.find((s) => s.session_id === sessionId) ?? null;
}

/** The bare display name `describeWindow` prefixes its label with —
 *  `state/selection.ts`'s `sessionLabel` (ruling R169: the one session
 *  display-name formatter, also the top-bar chip's), or "Unknown session"
 *  when `findSession` could not resolve the window's `sessionId` at all —
 *  a case `sessionLabel` itself has no way to express, since it takes an
 *  already-resolved `SessionSummary`. */
function windowSessionLabel(session: SessionSummary | null): string {
  return session === null ? "Unknown session" : sessionLabel(session);
}

function buildCover(primarySession: SessionSummary | null, appVersion: string, generatedAtMs: number): CoverBlock {
  return {
    kind: "cover",
    title: "Session report",
    generatedAtMs,
    appVersion,
    engineVersion: recordedOr(primarySession?.engine_version ?? null),
    importerVersion: recordedOr(primarySession?.importer_version ?? null),
  };
}

function buildSessionBlock(session: SessionSummary): SessionBlock {
  return {
    kind: "session",
    sessionId: session.session_id,
    rider: recordedOr(session.rider),
    bike: recordedOr(session.bike),
    venueName: recordedOr(session.venue_name),
    eventName: recordedOr(session.event_name),
    timestampText: session.timestamp_utc_ms === 0 ? "not recorded" : new Date(session.timestamp_utc_ms).toISOString(),
    sourceFormat: session.source_format,
    deviceId: recordedOr(session.device_id),
  };
}

function buildSelectionBlock(windows: readonly SelectionWindow[], sessions: readonly SessionSummary[]): SelectionBlock {
  return {
    kind: "selection",
    windows: windows.map((w) => ({
      label: describeWindow(w, windowSessionLabel(findSession(w.sessionId, sessions))),
      colour: w.colour,
    })),
  };
}

/** Mirrors `MathCell.tsx`'s `DefRow` value text exactly, so the screen and
 *  the report never disagree about what a definition's own value cell
 *  says. */
function defValueText(def: CellOutput["defs"][number]): string {
  if (def.error !== null) return `${def.error.kind}: ${def.error.message}`;
  if (def.value !== null) {
    const plural = def.value.length === 1 ? "" : "s";
    const t = def.value.has_t ? " (t)" : "";
    return `${def.value.length} sample${plural}${t}`;
  }
  return "—";
}

function buildDefTable(cellId: string, output: CellOutput, entries: string[]): DefTableBlock {
  const rows: DefTableRow[] = output.defs.map((def) => {
    const unit = formatUnit(def.unit);
    if (unit.unknownReason !== null) {
      entries.push(`${def.label ?? def.name}: unit unknown — ${unit.unknownReason}`);
    }
    for (const note of def.unit_notes) {
      entries.push(`${def.label ?? def.name}: ${note.message}`);
    }
    return {
      name: def.name,
      label: def.label,
      valueText: defValueText(def),
      unit,
      rateText: formatRate(def.sample_rate_hz),
    };
  });
  return { kind: "defTable", cellId, rows };
}

/** Narrows a `table`-kind `CellOutput.value` the same way `TableCell.tsx`
 *  does — this module has no reason to duplicate `TableCell`'s type by
 *  importing a component, so it re-checks the same shape locally. */
function isTableCellValue(value: unknown): value is { results: { value: number | null; error: string | null }[][] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { results?: unknown }).results);
}

function buildTable(cellId: string, output: CellOutput): TableBlock {
  const rows = isTableCellValue(output.value)
    ? output.value.results.map((row) => row.map((cell) => ({ text: cell.error ?? String(cell.value ?? ""), isError: cell.error !== null })))
    : [];
  return { kind: "table", cellId, rows };
}

/** Builds the content blocks (prose/defTable/table) for one window's
 *  already-succeeded evaluation, in document order, and appends every
 *  diagnostic it finds to `entries` (mutated in place — this function's
 *  one side effect, kept local to this file).
 *
 *  A `js`-kind cell contributes **no** def/table/absence content here — its
 *  chart is not per-window content at all (this module's own doc comment,
 *  task R6) — but its surrounding prose still runs through this per-window
 *  walk exactly like every other cell's, since prose *is* window-position
 *  narrative and a window's own section is still the right place for it. */
function buildContentBlocks(
  cells: readonly ScannedCell[],
  proseBlocks: ReadonlyMap<string, ProseBlockData>,
  outputs: readonly CellOutput[],
  entries: string[],
): ReportBlock[] {
  const byId = new Map(outputs.map((o) => [o.cell_id, o] as const));
  const blocks: ReportBlock[] = [];

  for (const cell of cells) {
    if (cell.id === null) continue;
    const before = proseBlocks.get(`${cell.id}::before`);
    if (before !== undefined) blocks.push(proseToBlock(before));

    if (cell.kind !== "js") {
      const output = byId.get(cell.id);
      if (output === undefined) {
        entries.push(`Cell ${cell.id}: not evaluated for this window.`);
        blocks.push({ kind: "absence", cellId: cell.id, reason: "This cell has no evaluated result for this window." });
      } else {
        for (const err of output.errors) {
          entries.push(`Cell ${cell.id}: ${err.kind}: ${err.message}`);
        }
        if (output.kind === "math") {
          blocks.push(buildDefTable(cell.id, output, entries));
        } else if (output.kind === "table") {
          blocks.push(buildTable(cell.id, output));
        }
      }
    }

    const after = proseBlocks.get(`${cell.id}::after`);
    if (after !== undefined) blocks.push(proseToBlock(after));
  }

  return blocks;
}

/** Decodes a `ScannedCell.bodyRange` UTF-8 byte range out of `markdown` —
 *  the same conversion `model/sourcePalette.ts`'s own private
 *  `decodeByteRange` does (`.slice` alone is wrong here: a byte range, not
 *  a UTF-16 code-unit range). */
function decodeByteRange(markdown: string, range: [number, number]): string {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

/** The worksheet-level {@link XMode}'s display label, read from the one
 *  place that names it (`model/xMode.ts`'s `X_MODE_OPTIONS`, the same list
 *  the worksheet's own X-mode control renders) rather than a second literal
 *  `"Time"`/`"Distance"` copy here. Falls back to the raw mode value for a
 *  future mode this list has not yet named — never throws on a value this
 *  module cannot otherwise reject at the type level. */
function xModeLabel(mode: XMode): string {
  return X_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

/** The real number of points a chart's most granular channel actually
 *  carries — the maximum `CombinedChannelPayload.length` across every
 *  channel feeding one chart, since a multi-channel overlay's channels can
 *  each resolve to a different actual count (a shorter record, a slower
 *  native rate) even though every channel in one `js` cell is fetched
 *  against the same point budget. `channelData` is never empty here — see
 *  {@link buildChartBlocks}'s own emptiness check before this is called. */
function chartPointCount(channelData: ReadonlyMap<string, CombinedChannelPayload>): number {
  return Math.max(...Array.from(channelData.values(), (payload) => payload.length));
}

/**
 * Formats one chart's printed caption (plan §3.4): the windows it covers,
 * the worksheet's X mode, and the point count the chart's data was
 * **actually** carried at — never the budget that was requested, which
 * this function is never handed at all (see {@link ChartSlotBlock}'s doc
 * comment for why printing that instead would be a false statement about
 * the signal, not a disclosed limitation). Exported for
 * `document.test.ts`; every other caller goes through {@link
 * buildChartBlocks}.
 */
export function formatChartCaption(windowLabels: readonly string[], xMode: XMode, pointCount: number): string {
  const windows = windowLabels.join(", ");
  // "drawn at N points", not a bare "N points": the number is a *render*
  // count, and the reason plan §3.4 wants it printed at all is so a reader
  // does not over-read a smoothed trace as the real signal. A bare
  // "2048 points" reads as a fact about the ride; "drawn at 2048 points"
  // reads as a fact about the picture, which is what it is. The
  // pre-decimation sample count would be better still, but it is not
  // reachable per window without span arithmetic this pure module has no
  // inputs for — so this says exactly what it knows and no more.
  const points = `drawn at ${pointCount} point${pointCount === 1 ? "" : "s"}`;
  const axis = `${xModeLabel(xMode)} axis, ${points}`;
  return windows === "" ? axis : `${windows} — ${axis}`;
}

/**
 * Builds every `js`-kind cell's chart block, once each, in document-cell
 * order (task R6, ruling R173) — never once per window, see this module's
 * doc comment. A cell whose code `plotForm.parse` rejects, whose parsed
 * chart is FFT (not yet renderable, `renderChart.ts`), or that names a
 * channel `chartChannelData` has no entry for, becomes a named
 * {@link AbsenceBlock}; otherwise a {@link ChartSlotBlock} carrying exactly
 * what `renderChart.ts` needs, plus its printed {@link formatChartCaption}
 * caption.
 */
function buildChartBlocks(
  cells: readonly ScannedCell[],
  markdown: string,
  chartChannelData: ReadonlyMap<string, ReadonlyMap<string, CombinedChannelPayload>>,
  xMode: XMode,
  entries: string[],
): ReportBlock[] {
  const blocks: ReportBlock[] = [];

  for (const cell of cells) {
    if (cell.id === null || cell.kind !== "js") continue;
    const cellId = cell.id;

    const props = parse(decodeByteRange(markdown, cell.bodyRange));
    if (props === null) {
      const reason = customCodeReason(cellId);
      entries.push(reason);
      blocks.push({ kind: "absence", cellId, reason });
      continue;
    }
    if (props.chart !== "time") {
      const reason = NON_TIME_CHART_ABSENCE_REASONS[props.chart];
      entries.push(`Cell ${cellId}: ${reason}`);
      blocks.push({ kind: "absence", cellId, reason });
      continue;
    }

    const channelData = chartChannelData.get(cellId);
    if (channelData === undefined || channelData.size === 0) {
      const reason = noChartDataReason(cellId);
      entries.push(reason);
      blocks.push({ kind: "absence", cellId, reason });
      continue;
    }
    const missingChannel = props.marks.find((mark) => !channelData.has(mark.channel));
    if (missingChannel !== undefined) {
      const reason = missingChannelReason(missingChannel.channel);
      entries.push(`Cell ${cellId}: ${reason}`);
      blocks.push({ kind: "absence", cellId, reason });
      continue;
    }

    const windowLabels = [...new Set(Array.from(channelData.values()).flatMap((payload) => payload.windows.map((w) => w.label)))];
    const caption = formatChartCaption(windowLabels, xMode, chartPointCount(channelData));
    blocks.push({ kind: "chartSlot", cellId, props, channelData, windowLabels, caption });
  }

  return blocks;
}

/** A "scalar" definition, per plan §4: no sample rate at all, or a value
 *  that carries no time axis — the two independent signals a reduction
 *  (rather than a still-time-indexed series) produced. A def whose own
 *  evaluation failed (`value === null`) has no `has_t` to read, so it
 *  qualifies only via `sample_rate_hz === null`. */
function isScalarDef(def: CellOutput["defs"][number]): boolean {
  return def.sample_rate_hz === null || (def.value !== null && !def.value.has_t);
}

/** Builds the comparison table (plan §4/§3.1 item 5): one row per scalar
 *  definition `name`, one column per selected window, matched across every
 *  window that evaluated it. `null` when fewer than two windows are
 *  selected — the table has nothing to compare. */
function buildComparisonTable(
  windows: readonly SelectionWindow[],
  evals: readonly (WindowEval | undefined)[],
  sessions: readonly SessionSummary[],
): ComparisonBlock | null {
  if (windows.length <= 1) return null;

  const rowOrder: string[] = [];
  const rowsByName = new Map<string, { label: string | null; cells: (string | null)[] }>();

  windows.forEach((_w, i) => {
    const ev = evals[i];
    if (ev === undefined || !("ok" in ev)) return;
    for (const output of ev.ok) {
      if (output.kind !== "math") continue;
      for (const def of output.defs) {
        if (!isScalarDef(def)) continue;
        let row = rowsByName.get(def.name);
        if (row === undefined) {
          row = { label: def.label, cells: windows.map(() => null) };
          rowsByName.set(def.name, row);
          rowOrder.push(def.name);
        }
        const unit = formatUnit(def.unit);
        row.cells[i] = unit.text === "" ? defValueText(def) : `${defValueText(def)} ${unit.text}`;
      }
    }
  });

  return {
    kind: "comparison",
    columns: buildSelectionBlock(windows, sessions).windows,
    rows: rowOrder.map((name) => {
      const row = rowsByName.get(name);
      // rowOrder and rowsByName are built together above -- every name in
      // rowOrder has a corresponding map entry by construction.
      return { name, label: row!.label, cells: row!.cells };
    }),
  };
}

function proseToBlock(block: ProseBlockData): ReportProseBlock {
  if (block.content.kind === "html") {
    return { kind: "prose", cellId: block.cellId, position: block.position, html: block.content.html };
  }
  return { kind: "prose", cellId: block.cellId, position: block.position, text: block.content.text };
}

/**
 * {@link buildReportDocument}'s parameters, as one options object rather
 * than seven positional ones (task R6 review finding — three same-shaped
 * `Map`s among them, `proseBlocks`/`chartChannelData` plus the implicit
 * per-index alignment of `evals`/`windows`; transposing two same-shaped
 * positional arguments is a silent bug that typechecks, and there is
 * exactly one caller, `Notebook/index.tsx`).
 */
export interface BuildReportDocumentInput {
  cells: readonly ScannedCell[];
  /** The whole workbook source — the one place a `js` cell's own code text
   *  comes from (task R6): `ScannedCell.bodyRange` is a byte range into
   *  this string, not a string itself. */
  markdown: string;
  proseBlocks: ReadonlyMap<string, ProseBlockData>;
  /** `windows[i]`'s own `evalWorkbookV2` result (`ruling R121`'s
   *  `WindowEval`), aligned 1:1 with `windows` by index. A window with no
   *  corresponding entry (still pending) contributes no section, only an
   *  appendix note — the caller is expected to wait for a settled
   *  evaluation before building a report at all (plan §3.4). */
  evals: readonly (WindowEval | undefined)[];
  windows: readonly SelectionWindow[];
  sessions: readonly SessionSummary[];
  /** One entry per `js`-kind cell this build has channel data for —
   *  `channelId` -> {@link CombinedChannelPayload}, already combined
   *  across every selected window (task R6, ruling R173). A cell absent
   *  from this map, or present with an empty inner map, is not renderable
   *  this build (`buildChartBlocks`'s own doc comment names the resulting
   *  absence reason). */
  chartChannelData: ReadonlyMap<string, ReadonlyMap<string, CombinedChannelPayload>>;
  /** Decision 54's worksheet-level X-axis mode, for every chart's printed
   *  caption ({@link formatChartCaption}, plan §3.4) — one value for the
   *  whole document, matching the worksheet setting it names (never
   *  per-chart, `model/xMode.ts`'s own doc comment). */
  xMode: XMode;
  /** This build's own app version (`@tauri-apps/api/app`'s `getVersion`) — read by the caller, not here, so this function stays pure. */
  appVersion: string;
  /** i64, Unix epoch ms — when this document was built (`Date.now()`, read by the caller for the same reason). */
  generatedAtMs: number;
}

/**
 * Builds a {@link ReportDocument} from a settled evaluation of every
 * selected window (task R4 — plan §4: "two laps is the normal case, not
 * an edge case"). `input.evals: []`/`input.windows: []` (nothing selected)
 * still returns a document — cover and an empty selection block, no window
 * sections, no comparison table.
 */
export function buildReportDocument(input: BuildReportDocumentInput): ReportDocument {
  const { cells, markdown, proseBlocks, evals, windows, sessions, chartChannelData, xMode, appVersion, generatedAtMs } = input;
  const entries: string[] = [];
  const primaryWindow = windows[0] ?? null;
  const primarySession = primaryWindow === null ? null : findSession(primaryWindow.sessionId, sessions);

  const blocks: ReportBlock[] = [buildCover(primarySession, appVersion, generatedAtMs)];

  const distinctSessionIds = [...new Set(windows.map((w) => w.sessionId))];
  for (const sessionId of distinctSessionIds) {
    const session = findSession(sessionId, sessions);
    if (session !== null) blocks.push(buildSessionBlock(session));
  }

  blocks.push(buildSelectionBlock(windows, sessions));

  windows.forEach((window, i) => {
    const label = describeWindow(window, windowSessionLabel(findSession(window.sessionId, sessions)));
    const ev = evals[i];
    if (ev === undefined) {
      entries.push(`Window ${label}: not evaluated.`);
      return;
    }
    if ("ok" in ev) {
      blocks.push({ kind: "windowSection", label, colour: window.colour });
      blocks.push(...buildContentBlocks(cells, proseBlocks, ev.ok, entries));
    } else {
      blocks.push({ kind: "windowFailure", label, colour: window.colour, error: ev.error });
      entries.push(`Window ${label}: ${ev.error.kind}: ${ev.error.message}`);
    }
  });

  blocks.push(...buildChartBlocks(cells, markdown, chartChannelData, xMode, entries));

  const comparison = buildComparisonTable(windows, evals, sessions);
  if (comparison !== null) blocks.push(comparison);

  blocks.push({ kind: "appendix", entries });

  return { blocks };
}
