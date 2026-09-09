/**
 * The report's document model (decisions 85/89, `runs/2026-09-09/report-plan.md`
 * tasks R1/R4, ruling R166). Pure: no React, no DOM, no IPC import — this
 * module turns already-fetched data into a flat, typed, ordered block list
 * that `components/ReportView.tsx` (task R2) renders and
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
 * Charts (`js`-kind cells) are not renderable yet (task R5/R6 land the
 * host-side re-render); every one becomes a named {@link AbsenceBlock}
 * rather than a silent gap (R148/R150/R153).
 */
import type { CellOutput, IpcError, WindowEval } from "../../../../../ipc/workbook";
import type { SessionSummary } from "../../../../../ipc/catalog";
import { describeWindow, type SelectionWindow } from "../../../../../state/selection";
import type { ScannedCell } from "../cells";
import type { ProseBlock as ProseBlockData } from "../proseBlocks";
import { formatRate, formatUnit, type UnitDisplay } from "../unitText";

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
 *  dropped (R148/R150/R153) — today this is every `js`-kind cell (chart
 *  re-render is task R5/R6) plus any cell with no evaluated output at all. */
export interface AbsenceBlock {
  kind: "absence";
  cellId: string;
  reason: string;
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
  | ComparisonBlock
  | AppendixBlock;

export interface ReportDocument {
  blocks: ReportBlock[];
}

const CHART_ABSENCE_REASON =
  "Charts are not yet included in reports — this cell's chart could not be captured.";

/** `""`/`null` -> `"not recorded"`, the one shared rule for every "not set"
 *  field this document renders (C1 §2/§6, R148/R153). */
function recordedOr(value: string | null, fallback = "not recorded"): string {
  return value === null || value === "" ? fallback : value;
}

function findSession(sessionId: string, sessions: readonly SessionSummary[]): SessionSummary | null {
  return sessions.find((s) => s.session_id === sessionId) ?? null;
}

/** The bare display name `describeWindow` prefixes its label with — venue
 *  name when recorded, else a generic fallback. Deliberately minimal: it
 *  exists only to feed `describeWindow`, not as a general session-naming
 *  scheme (that is `shell/topBarSelection.ts`'s `sessionLabel`, a
 *  different layer this pure model does not import). */
function sessionDisplayName(session: SessionSummary | null): string {
  if (session === null) return "Unknown session";
  return session.venue_name !== "" ? session.venue_name : "Session";
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
      label: describeWindow(w, sessionDisplayName(findSession(w.sessionId, sessions))),
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

/** Builds the content blocks (prose/defTable/table/absence) for one
 *  window's already-succeeded evaluation, in document order, and appends
 *  every diagnostic it finds to `entries` (mutated in place — this
 *  function's one side effect, kept local to this file). */
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
      } else {
        entries.push(`Cell ${cell.id}: ${CHART_ABSENCE_REASON}`);
        blocks.push({ kind: "absence", cellId: cell.id, reason: CHART_ABSENCE_REASON });
      }
    }

    const after = proseBlocks.get(`${cell.id}::after`);
    if (after !== undefined) blocks.push(proseToBlock(after));
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
 * Builds a {@link ReportDocument} from a settled evaluation of every
 * selected window (task R4 — plan §4: "two laps is the normal case, not
 * an edge case"). `evals[i]` is `windows[i]`'s own `evalWorkbookV2` result
 * (`ruling R121`'s `WindowEval`); a window with no corresponding `evals`
 * entry (still pending) contributes no section, only an appendix note —
 * the caller is expected to wait for a settled evaluation before building
 * a report at all (plan §3.4). `evals: []`/`windows: []` (nothing
 * selected) still returns a document — cover and an empty selection block,
 * no window sections, no comparison table.
 *
 * `appVersion` and `generatedAtMs` are supplied by the caller rather than
 * read here (`@tauri-apps/api/app`'s `getVersion`, `Date.now()`) so this
 * function stays pure and its output deterministic under test.
 */
export function buildReportDocument(
  cells: readonly ScannedCell[],
  proseBlocks: ReadonlyMap<string, ProseBlockData>,
  evals: readonly (WindowEval | undefined)[],
  windows: readonly SelectionWindow[],
  sessions: readonly SessionSummary[],
  appVersion: string,
  generatedAtMs: number,
): ReportDocument {
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
    const label = describeWindow(window, sessionDisplayName(findSession(window.sessionId, sessions)));
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

  const comparison = buildComparisonTable(windows, evals, sessions);
  if (comparison !== null) blocks.push(comparison);

  blocks.push({ kind: "appendix", entries });

  return { blocks };
}
