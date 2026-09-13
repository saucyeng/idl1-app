/**
 * The app-side view model for a `table` cell (C2 §4), and with it the lap
 * table (ruling R233): a mirror of `idl_rs::table::TableModel`'s camelCase
 * wire shape, plus the four things the grid needs that the wire does not
 * state — which row is the Main row, what each column is called, what unit
 * its numbers are in, and what each evaluated cell should read as.
 *
 * Pure: no React, no DOM, no IPC. `components/TableCell.tsx` draws what this
 * returns and decides nothing itself, so the notebook and any other reader
 * of a table cannot disagree about which row is Main.
 *
 * **Rows are the engine's, never re-derived here.** Under C2 §4's
 * `rowSource: "windowLaps"` the engine derives one row per lap of the
 * selected window and returns *the model as evaluated* (C3 §3.4, amended by
 * R233), so `model.rows` already is the derived row set and `results` is
 * indexed against it. This module reads that; it never expands a row source
 * of its own, which would give two orderings and no rule for reconciling
 * them.
 */

/** One column of `idl_rs::table::Column`. */
export interface TableColumn {
  id: string;
  /** The `{name}`/`{name[]}` reference target, when the author named it. */
  name?: string | null;
  /** The formula applied to every cell of this column lacking its own. */
  template?: string | null;
}

/** `idl_rs::table::RowContext` — which lap of which session a row stands
 *  for. `lapNumber` is **1-based** (C2 §4.4, ruling R217 item 2.4). */
export interface TableRowContext {
  sessionId: string;
  lapNumber: number;
}

/** One row of `idl_rs::table::Row`. Under `rowSource: "windowLaps"` the id
 *  is `"<sessionId>#<lapNumber>"` and `context` is always present. */
export interface TableRow {
  id: string;
  context?: TableRowContext | null;
}

/** One authored cell of `idl_rs::table::Cell`. A derived row carries none. */
export interface TableCellSource {
  formula?: string | null;
  literal?: number | null;
  name?: string | null;
}

/** C2 §4's `rowSource`. Absent means `"authored"`. */
export type TableRowSource = "authored" | "windowLaps";

/** `idl_rs::table::TableModel` as it crosses C3 §3.4 — the model **as
 *  evaluated**, so under `"windowLaps"` its `rows` are the derived ones. */
export interface TableModel {
  columns: TableColumn[];
  rows: TableRow[];
  cells: TableCellSource[][];
  rowSource?: TableRowSource;
  mainRowId?: string | null;
}

/** One evaluated grid cell — `idl_rs::table::CellResult`, serialized
 *  verbatim. `error` is table-evaluator text, not one of C3 §2's `IpcError`
 *  kinds. */
export interface TableCellResult {
  value: number | null;
  error: string | null;
}

/** A `table`-kind `CellOutput.value` on success (C3 §3.4). */
export interface TableCellValue {
  model: TableModel;
  results: TableCellResult[][];
}

/** C2 §4's reserved `mainRowId` naming the fastest derived row. */
export const MAIN_ROW_FASTEST = "fastest";

/** Narrows a `CellOutput.value` to {@link TableCellValue}. Checks both
 *  halves: a `results` grid with no `model` beside it cannot be given
 *  headers, and a reader that accepted one would render a grid with no
 *  column names rather than saying the payload was malformed. */
export function isTableCellValue(value: unknown): value is TableCellValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { model?: unknown; results?: unknown };
  return Array.isArray(candidate.results) && typeof candidate.model === "object" && candidate.model !== null;
}

/**
 * The unit a column's numbers are in, or `null` when it cannot be said.
 *
 * Derived from the column's own `template`, because that is the only place
 * a unit is available: C2 §4's `Column` carries no unit field and
 * `CellResult` is a bare `{value, error}`, so there is nothing on the wire
 * to read one from. Only the three lap builtins are recognised — C2 §3.3
 * states their output units and they are exactly the columns a lap table is
 * made of. **Anything else returns `null`**, including an arithmetic
 * expression over a channel: guessing "mm" for `max([Fork travel]) / 2`
 * would be worse than saying nothing, because a labelled-but-wrong unit
 * stops a reader checking (C2 §3.3.1's own reasoning, and R152's).
 */
export function columnUnit(template: string | null | undefined): string | null {
  if (template === null || template === undefined) return null;
  const trimmed = template.trim();
  if (/^lap_time\s*\(\s*\)$/.test(trimmed)) return "s";
  if (/^sector_time\s*\(\s*\d+\s*\)$/.test(trimmed)) return "s";
  return null;
}

/** One rendered column header. */
export interface TableHeader {
  /** Stable React key — the column id, unique within a table. */
  key: string;
  /** The column's name, falling back to its id (never blank: a nameless
   *  column still has to be pointed at). */
  label: string;
  /** {@link columnUnit}'s answer, shown beside the label. */
  unit: string | null;
}

/** Every column's header, in column order. */
export function tableHeaders(model: TableModel): TableHeader[] {
  return model.columns.map((column) => ({
    key: column.id,
    label: column.name !== null && column.name !== undefined && column.name !== "" ? column.name : column.id,
    unit: columnUnit(column.template),
  }));
}

/**
 * The index into `model.rows` of the table's Main row — the row
 * `main({col[]})` compares against — or `null` when none is designated.
 *
 * Mirrors `idl_rs::table::resolve_baseline_row` rather than inventing a
 * second rule, because the highlight has to be on the row the engine
 * actually used: a reader comparing a delta column against a differently
 * highlighted row would read every delta backwards.
 *
 * - `mainRowId` absent or `null` → `null`.
 * - The reserved `"fastest"` (legal only under `rowSource: "windowLaps"`;
 *   `"authored"` makes it a validation error the engine reports, so it is
 *   simply not resolved here) → the row with the smallest value in the
 *   `lap_time()` column. A row whose lap time is `NaN`, absent or errored is
 *   **skipped rather than compared**, and ties resolve to the lowest row
 *   index, so the answer never depends on iteration order.
 * - Anything else → the row whose `id` matches, or `null`.
 */
export function mainRowIndex(model: TableModel, results: TableCellResult[][]): number | null {
  const mainRowId = model.mainRowId;
  if (mainRowId === null || mainRowId === undefined || mainRowId === "") return null;

  if (mainRowId !== MAIN_ROW_FASTEST) {
    const index = model.rows.findIndex((row) => row.id === mainRowId);
    return index === -1 ? null : index;
  }

  if (model.rowSource !== "windowLaps") return null;
  const lapTimeColumn = model.columns.findIndex((column) => columnUnit(column.template) === "s" && /^lap_time\s*\(/.test((column.template ?? "").trim()));
  if (lapTimeColumn === -1) return null;

  let best: number | null = null;
  let bestIndex: number | null = null;
  for (let r = 0; r < model.rows.length; r++) {
    const cell = results[r]?.[lapTimeColumn];
    const value = cell?.value;
    if (cell === undefined || cell.error !== null || value === null || value === undefined || !Number.isFinite(value)) continue;
    if (best === null || value < best) {
      best = value;
      bestIndex = r;
    }
  }
  return bestIndex;
}

/**
 * One evaluated grid cell as the view draws it. `status` is R210's per-cell
 * state narrowed to what a table can actually be in: a grid cell is either
 * evaluated or it failed — the queued/evaluating states belong to the cell
 * as a whole, which `CellFrame` already shows.
 */
export interface TableViewCell {
  key: string;
  /** The number formatted, or the evaluator's own error text. */
  text: string;
  status: "settled" | "error";
  /** The evaluator's error text, for the cell's tooltip; `null` when settled. */
  error: string | null;
}

/** One rendered row. */
export interface TableViewRow {
  key: string;
  /** `"Lap 3"` for a row bound to a lap, the row id otherwise — the first
   *  thing a reader needs in a table whose rows are laps. */
  label: string;
  /** Whether this is the Main row ({@link mainRowIndex}). */
  isMain: boolean;
  cells: TableViewCell[];
}

/** Everything `components/TableCell.tsx` draws. */
export interface TableView {
  headers: TableHeader[];
  rows: TableViewRow[];
  /** Whether the rows follow the selection (C2 §4's `"windowLaps"`) — the
   *  view says so once, rather than a reader wondering why the rows moved
   *  when they picked another lap. */
  derived: boolean;
}

/**
 * Formats one evaluated number for the grid.
 *
 * Three decimal places for a fractional value (a lap time is read to the
 * millisecond and nothing in a lap table is read finer), an integer printed
 * whole, and a non-finite value printed as `"—"` rather than `"NaN"`: a lap
 * with no data is an absence, and C2 §3.5.B already rules that it must not
 * break the definition.
 */
export function formatCellValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3);
}

/** Builds the whole view for one evaluated table (C2 §4). */
export function tableView(value: TableCellValue): TableView {
  const { model, results } = value;
  const mainIndex = mainRowIndex(model, results);

  const rows = model.rows.map((row, r) => {
    const context = row.context;
    const label = context !== null && context !== undefined ? `Lap ${context.lapNumber}` : row.id;
    const cells = model.columns.map((column, c) => {
      const result = results[r]?.[c];
      if (result === undefined) {
        // The grid is short for this row — a malformed payload, not a cell
        // failure. Drawn as an absence so every other cell still renders
        // (C3 §3.4's per-cell rule, at this grain).
        return { key: column.id, text: "—", status: "settled" as const, error: null };
      }
      if (result.error !== null) {
        return { key: column.id, text: result.error, status: "error" as const, error: result.error };
      }
      return { key: column.id, text: formatCellValue(result.value), status: "settled" as const, error: null };
    });
    return { key: row.id, label, isMain: r === mainIndex, cells };
  });

  return { headers: tableHeaders(model), rows, derived: model.rowSource === "windowLaps" };
}
