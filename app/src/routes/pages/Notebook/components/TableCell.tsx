import type { CellOutput } from "../../../../ipc/workbook";
import { isTableCellValue, tableView } from "../model/lapTable";

/**
 * Renders one `table`-kind `CellOutput` (C3 §3.4) as a grid — including the
 * lap table (C2 §4, ruling R233), which is this cell kind and not a chart
 * kind: one row per lap of the selected window under `rowSource:
 * "windowLaps"`, the Main row highlighted, columns named and united from the
 * model.
 *
 * Every decision about *what* to draw lives in `model/lapTable.ts`; this
 * component decides only how it looks. A cell-level failure (a single
 * `results[r][c].error`) never blanks the rest of the grid — every other cell
 * still renders (CLAUDE.md §5, C3 §3.4's per-cell failure rule, applied here
 * at the per-grid-cell grain), and the failing cell shows R210's error state:
 * a red ✕ whose tooltip carries the evaluator's own text, matching the
 * per-cell status glyph R216.2 settled on for charts rather than spilling a
 * paragraph of error text into a numeric column.
 *
 * `output.errors` (the whole cell's own structural/evaluation errors, e.g.
 * `workbook_invalid_table_json`) render above the grid, if any; `output.value`
 * is `null` when evaluation did not produce a grid at all (C3 §3.4).
 *
 * `windowNote` is `model/jsCellNote.ts`'s `primaryWindowNote` result —
 * `null` with zero or one window selected (no marker, byte-identical to
 * today), otherwise the primary window's label (ruling R132: this grid is
 * that window's own evaluated result, R131 Q1, and must say so once a
 * second window is selected).
 *
 * `dense` is ruling R216 item 3's dense stacking: the same grid at tighter
 * row padding, nothing removed — a lap table's numbers are the content, so
 * there is no chrome here to drop.
 */
export default function TableCell({
  output,
  windowNote = null,
  dense = false,
}: {
  output: CellOutput;
  windowNote?: string | null;
  dense?: boolean;
}) {
  const value = output.value;
  const view = isTableCellValue(value) ? tableView(value) : null;
  const cellPadding = dense ? "px-2 py-0.5" : "px-3 py-1.5";

  return (
    <div className="table-cell text-sm">
      {windowNote !== null && <div className="table-cell-window-note text-xs text-muted-foreground">Showing {windowNote}</div>}
      {output.errors.length > 0 && (
        <ul className="table-cell-errors text-xs text-destructive">
          {output.errors.map((error, i) => (
            <li key={i}>
              {error.kind}: {error.message}
            </li>
          ))}
        </ul>
      )}
      {view !== null && (
        <div className="table-cell-scroll overflow-x-auto">
          <table className="table-cell-grid w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-border">
                {/* The row label column has no model column behind it: a
                    derived row's identity is its lap, and a reader needs it
                    before any number. */}
                <th className={`table-cell-row-head text-left font-medium text-muted-foreground ${cellPadding}`} scope="col">
                  {view.derived ? "Lap" : "Row"}
                </th>
                {view.headers.map((header) => (
                  <th key={header.key} className={`text-right font-medium ${cellPadding}`} scope="col">
                    {header.label}
                    {header.unit !== null && <span className="table-cell-unit ml-1 font-normal text-muted-foreground">({header.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr
                  key={row.key}
                  className={
                    row.isMain
                      ? "table-cell-row table-cell-row-main border-b border-border bg-accent/40 font-medium"
                      : "table-cell-row border-b border-border/50"
                  }
                >
                  <th className={`table-cell-row-head text-left font-normal text-muted-foreground ${cellPadding}`} scope="row">
                    {row.label}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.key}
                      className={
                        cell.status === "error"
                          ? `table-cell-grid-error text-right text-destructive ${cellPadding}`
                          : `text-right ${cellPadding}`
                      }
                      title={cell.error ?? undefined}
                    >
                      {cell.status === "error" ? "✕" : cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
