/**
 * How tall a cell's slot is before its first output arrives (ruling R250,
 * the spec's §1.1).
 *
 * `components/CellList.tsx` used to render `<div
 * className="cell-list-pending">…</div>` for any cell with no `CellOutput`
 * yet — a one-line grey ellipsis. Every cell in a freshly opened workbook
 * is in that state, so the whole document was a column of ellipses that
 * became full-height charts the instant the first evaluation landed,
 * moving everything below every cell. Decision 58 already forbids exactly
 * that jump for the *note* case (`model/jsCellFrameHeight.ts`'s
 * `JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX`: "this is the height the chart
 * would have been"); this module applies the same rule one state earlier.
 *
 * Pure: one `kind` in, one number out.
 */
import { DEFAULT_JS_CELL_HEIGHT_PX } from "./jsCellFrameHeight";

/**
 * Height reserved for a pending `math` or `table` cell, in pixels.
 *
 * A `math` cell renders one line of value and a `table` cell a short grid,
 * so reserving a chart's 240 px for either would open a hole the result
 * never fills — the same jump in the other direction. Two body lines: the
 * cell's own value row, and the state line drawn over it.
 */
export const DEFAULT_TEXT_CELL_HEIGHT_PX = 48;

/**
 * The height, in pixels, to reserve for `kind`'s not-yet-rendered output.
 *
 * `js` gets {@link DEFAULT_JS_CELL_HEIGHT_PX} — the same constant
 * `JsCellFrame` falls back to before its first `cellRendered`, so a chart
 * cell is one height from the first frame to the last and never moves.
 * Every other kind gets {@link DEFAULT_TEXT_CELL_HEIGHT_PX}.
 *
 * @param kind A `ScannedCell.kind` — `"js"`, `"math"` or `"table"`.
 */
export function pendingSlotHeightPx(kind: string): number {
  return kind === "js" ? DEFAULT_JS_CELL_HEIGHT_PX : DEFAULT_TEXT_CELL_HEIGHT_PX;
}
