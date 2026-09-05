import type { ReadoutRow } from "../model/cursor";

/** Props for {@link CursorReadout}. */
export interface CursorReadoutProps {
  /** Rows to render, from `model/cursor.ts`'s `formatReadout` — one per
   *  channel present in the last settle's `cursorReadout` response. `null`
   *  (rather than an empty array) means "no settle has resolved a readout
   *  yet, or the pointer is off the chart" — nothing is rendered. */
  rows: ReadoutRow[] | null;
}

/**
 * Renders the cross-channel numeric readout panel at the settled cursor
 * position (C3 §3.7; ledger R31). A row whose `value` is `null` renders the
 * literal text "no data" rather than `0`, `"—"`, or a blank cell — R31's
 * whole point is that a dropped-out sensor must look dropped-out, not zero,
 * so this text is deliberately unambiguous rather than a symbol that could
 * be misread as a real reading. Not unit-tested (CLAUDE.md §4: UI rendering
 * is not unit-tested) — `model/cursor.test.ts` covers `formatReadout`'s
 * `value === null` case, this component only prints what it is given.
 *
 * @param props See {@link CursorReadoutProps}.
 */
export default function CursorReadout({ rows }: CursorReadoutProps) {
  if (rows === null || rows.length === 0) {
    return null;
  }

  return (
    <div className="chart-cell-cursor-readout" style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}>
      {rows.map((row) => (
        <div key={row.channel} className="chart-cell-cursor-readout-row">
          {`${row.label}: ${row.value === null ? "no data" : row.value}`}
        </div>
      ))}
    </div>
  );
}
