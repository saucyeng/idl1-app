/**
 * The report's document model (decisions 85/89, `runs/2026-09-09/report-plan.md`
 * task R1, ruling R166). Pure: no React, no DOM, no IPC import — this module
 * turns already-fetched data into a flat, typed, ordered block list that
 * `components/ReportView.tsx` (task R2) renders and `model/report/toPdf.ts`
 * (task R7) will one day feed to a PDF writer. Every test in
 * `document.test.ts` exercises this module directly, with no jsdom.
 *
 * **R1's scope, deliberately narrow.** The screen only ever shows the
 * *primary* window (`index.tsx`'s `primaryWindow`, ruling R131 Q1) — this
 * first pass builds the report's content sections the same way, from
 * `evals[0]` alone. The plan's section 4 explicitly says the report must
 * not inherit that limit; lifting this to one section per `WindowEval`,
 * plus a scalar comparison table and named window failures, is task R4,
 * not this one. The **Selection block** is the one exception: it already
 * lists every selected window regardless of which window's content is
 * shown, because that block carries no evaluated content at all.
 *
 * Charts (`js`-kind cells) are not renderable yet (task R5/R6 land the
 * host-side re-render); every one becomes a named {@link ChartAbsenceBlock}
 * rather than a silent gap (R148/R150/R153).
 */
import type { CellOutput, WindowEval } from "../../../../../ipc/workbook";
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

/** One heading marking the start of a window's content sections (R1: the
 *  primary window only; R4 lifts this to every window). */
export interface WindowSectionBlock {
  kind: "windowSection";
  label: string;
  colour: string;
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
  | ReportProseBlock
  | DefTableBlock
  | TableBlock
  | AbsenceBlock
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

function proseToBlock(block: ProseBlockData): ReportProseBlock {
  if (block.content.kind === "html") {
    return { kind: "prose", cellId: block.cellId, position: block.position, html: block.content.html };
  }
  return { kind: "prose", cellId: block.cellId, position: block.position, text: block.content.text };
}

/**
 * Builds a {@link ReportDocument} from a settled evaluation of one
 * workbook's primary window (R1's scope — see this module's doc comment).
 * `evals[0]` (`ruling R121`'s `WindowEval`) is read; further entries are
 * left for R4. `evals: []` (nothing selected) still returns a document —
 * cover and an empty selection block, no content section.
 *
 * `appVersion` and `generatedAtMs` are supplied by the caller rather than
 * read here (`@tauri-apps/api/app`'s `getVersion`, `Date.now()`) so this
 * function stays pure and its output deterministic under test.
 */
export function buildReportDocument(
  cells: readonly ScannedCell[],
  proseBlocks: ReadonlyMap<string, ProseBlockData>,
  evals: readonly WindowEval[],
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

  const primaryEval = evals[0];
  if (primaryWindow !== null && primaryEval !== undefined) {
    if ("ok" in primaryEval) {
      blocks.push({ kind: "windowSection", label: describeWindow(primaryWindow, sessionDisplayName(primarySession)), colour: primaryWindow.colour });
      blocks.push(...buildContentBlocks(cells, proseBlocks, primaryEval.ok, entries));
    } else {
      entries.push(`Window ${describeWindow(primaryWindow, sessionDisplayName(primarySession))}: ${primaryEval.error.kind}: ${primaryEval.error.message}`);
    }
  }

  blocks.push({ kind: "appendix", entries });

  return { blocks };
}
