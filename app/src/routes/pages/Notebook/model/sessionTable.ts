/**
 * The view of one session-row table (C2 §4 `rowSource: "sessions"`,
 * session-sets spec §5.1): rows are the workbook's session-set members in set
 * order, drawn under one header per group, each row carrying its member's
 * status so a reader can tell a computed number from a cached one and see
 * which sessions are not on this device (ruling Q3, 2026-10-28).
 *
 * Pure: the page fetches the {@link SessionSetResult} (`eval_session_set`);
 * this module decides what to draw, `components/SessionTableCell.tsx` how.
 */

import type { SessionSetResult, SetMemberStatus, SetWarning } from "../../../../ipc/sessionSet";
import { columnUnit, formatCellValue, type TableHeader, type TableViewCell } from "./lapTable";

/** One member row. */
export interface SessionTableRow {
  /** The member's session id — the row's React key and its focus target. */
  sessionId: string;
  label: string;
  status: SetMemberStatus;
  /** The status chip's text; `null` for a freshly computed member, which
   *  needs no chip. */
  chip: string | null;
  cells: TableViewCell[];
}

/** One group's header and its rows, in set order. */
export interface SessionTableGroup {
  /** The group's name; `null` for the one unnamed group, drawn without a
   *  header. */
  name: string | null;
  rows: SessionTableRow[];
}

/** Everything `SessionTableCell` draws. */
export interface SessionTableView {
  headers: TableHeader[];
  groups: SessionTableGroup[];
  /** Q3 warnings for this table and for the whole set, in that order. */
  warnings: SetWarning[];
  /** Every session id the warnings name, once each, for the offer to fetch. */
  missing: string[];
}

/** The chip a member's status shows; `null` when there is nothing to say. */
export function statusChip(status: SetMemberStatus): string | null {
  switch (status) {
    case "computed":
      return null;
    case "cached":
      return "cached";
    case "cached_data_elsewhere":
      return "cached, data elsewhere";
    case "missing":
      return "not on this device";
    case "not_found":
      return "no such session";
    case "error":
      return "could not evaluate";
  }
}

/**
 * Builds the view of table `cellId` from a set result, or `null` when the
 * result has no such table (the workbook was edited and the set not yet
 * re-evaluated). Consecutive rows of one group share one header.
 */
export function sessionTableView(result: SessionSetResult, cellId: string): SessionTableView | null {
  const table = result.tables.find((t) => t.cell_id === cellId);
  if (table === undefined) return null;

  const headers = table.model.columns.map((column) => ({
    key: column.id,
    label: column.name !== null && column.name !== undefined && column.name !== "" ? column.name : column.id,
    unit: columnUnit(column.template),
  }));

  const groups: SessionTableGroup[] = [];
  table.row_members.forEach((memberIndex, r) => {
    const member = result.members[memberIndex];
    if (member === undefined) return;
    const cells = table.model.columns.map((column, c): TableViewCell => {
      const cell = table.results[r]?.[c];
      if (cell === undefined) return { key: column.id, text: "—", status: "settled", error: null };
      if (cell.error !== null) return { key: column.id, text: cell.error, status: "error", error: cell.error };
      return { key: column.id, text: formatCellValue(cell.value), status: "settled", error: null };
    });
    const row = { sessionId: member.session_id, label: member.label, status: member.status, chip: statusChip(member.status), cells };
    const name = result.groups[member.group]?.name ?? null;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.name === name) last.rows.push(row);
    else groups.push({ name, rows: [row] });
  });

  const warnings = [
    ...result.warnings.filter((w) => w.cell_id === cellId),
    ...result.warnings.filter((w) => w.cell_id === null),
  ];
  const missing = [...new Set(warnings.flatMap((w) => w.missing))];
  return { headers, groups, warnings, missing };
}

/**
 * Whether a workbook's front matter declares a session set (C2 §1
 * `sessions`): a top-level `sessions:` key between the opening and closing
 * `---`. Decides only whether to ask the engine; the engine parses the set.
 */
export function declaresSessionSet(markdown: string): boolean {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) return false;
  const lines = markdown.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return false;
    if (/^sessions\s*:/.test(lines[i])) return true;
  }
  return false;
}
