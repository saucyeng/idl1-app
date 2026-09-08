import type { CellOutput } from "../../../../ipc/workbook";

/** One grid cell of a table cell's evaluated result — `idl_rs::table::eval::evaluate_table`'s
 *  `CellResult` (C3 §3.4), serialized verbatim: `error` is a plain string here, unlike
 *  `CellOutput.errors`'s `IpcError[]` — the table evaluator's own per-cell error is not one of
 *  the `IpcError` kinds, it is table-specific evaluator text (C2 §4). */
interface TableCellResult {
  value: number | null;
  error: string | null;
}

/** A `table`-kind `CellOutput.value` on success (C3 §3.4): the parsed `TableModel`
 *  (opaque here — this component never interprets it, only threads it through
 *  for a caller that might) plus the evaluated grid, `results[r][c]`. */
interface TableCellValue {
  model: unknown;
  results: TableCellResult[][];
}

/** Narrows `value: unknown` to `TableCellValue` — true for anything with a `results` array,
 *  which is the only field this component reads. */
function isTableCellValue(value: unknown): value is TableCellValue {
  return typeof value === "object" && value !== null && Array.isArray((value as { results?: unknown }).results);
}

/**
 * Renders one `table`-kind `CellOutput` (C3 §3.4) as a grid: `value.results[r][c]`,
 * each cell showing its number or its own `error` text in place of a value. A
 * cell-level failure (a single `results[r][c].error`) never blanks the rest of
 * the grid — every other cell still renders (CLAUDE.md §5, C3 §3.4's per-cell
 * failure rule, applied here at the per-grid-cell grain).
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
 */
export default function TableCell({ output, windowNote = null }: { output: CellOutput; windowNote?: string | null }) {
  const value = output.value;

  return (
    <div className="table-cell">
      {windowNote !== null && <div className="table-cell-window-note">Showing {windowNote}</div>}
      {output.errors.length > 0 && (
        <ul className="table-cell-errors">
          {output.errors.map((error, i) => (
            <li key={i}>{error.kind}: {error.message}</li>
          ))}
        </ul>
      )}
      {isTableCellValue(value) && (
        <table className="table-cell-grid">
          <tbody>
            {value.results.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={cell.error !== null ? "table-cell-grid-error" : undefined}>
                    {cell.error !== null ? cell.error : cell.value ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
