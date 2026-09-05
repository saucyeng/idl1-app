import type { ReadoutPanelState } from "../model/cursor";

/** Props for {@link CursorReadout}. */
export interface CursorReadoutProps {
  /** The panel's full display state, from `model/cursorReadoutDriver.ts`'s
   *  dispatch (via `model/cursor.ts`'s `formatReadout`/
   *  `describeCursorReadoutError`): a set of rows, a fixed error message,
   *  or `null` (nothing to show — no settle has resolved a readout yet, or
   *  the pointer is off the chart). */
  state: ReadoutPanelState;
}

/**
 * Renders the cross-channel numeric readout panel at the settled cursor
 * position (C3 §3.7; ledger R31, R62). A row whose `value` is `null`
 * renders the literal text "no data" rather than `0`, `"—"`, or a blank
 * cell — R31's whole point is that a dropped-out sensor must look
 * dropped-out, not zero, so this text is deliberately unambiguous rather
 * than a symbol that could be misread as a real reading. A rejected fetch
 * (review-task10.md Minor, lead ruling) shows a fixed "readout unavailable"
 * message instead of silently keeping the panel's last rows. Not
 * unit-tested (CLAUDE.md §4: UI rendering is not unit-tested) —
 * `model/cursor.test.ts` covers `formatReadout`'s `value === null` case and
 * `describeCursorReadoutError`'s two branches; this component only prints
 * what it is given.
 *
 * @param props See {@link CursorReadoutProps}.
 */
export default function CursorReadout({ state }: CursorReadoutProps) {
  if (state === null) {
    return null;
  }

  if (state.kind === "error") {
    return (
      <div
        className="chart-cell-cursor-readout chart-cell-cursor-readout-error"
        style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}
      >
        {state.message}
      </div>
    );
  }

  if (state.rows.length === 0) {
    return null;
  }

  return (
    <div className="chart-cell-cursor-readout" style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}>
      {state.rows.map((row) => (
        <div key={row.channel} className="chart-cell-cursor-readout-row">
          {`${row.label}: ${row.value === null ? "no data" : row.value}`}
        </div>
      ))}
    </div>
  );
}
