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
 * Styled as token chips per `UI-DIRECTION`'s "Chart style rules for Plot"
 * ("readout chips mono tabular on `--surface-2` with hairline"): each row
 * is its own chip so a rejected/`null` reading looks like one broken chip
 * among otherwise-fine ones, not a broken panel.
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
        className="chart-cell-cursor-readout chart-cell-cursor-readout-error absolute top-1 right-1 flex flex-col items-end gap-1"
        style={{ pointerEvents: "none" }}
      >
        <span className="rounded-[var(--radius-structural)] border border-rule bg-surface-2 px-2 py-0.5 font-mono text-label-2 tabular-nums text-destructive">
          {state.message}
        </span>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return null;
  }

  return (
    <div className="chart-cell-cursor-readout absolute top-1 right-1 flex flex-col items-end gap-1" style={{ pointerEvents: "none" }}>
      {state.rows.map((row) => (
        <span
          key={row.channel}
          className="chart-cell-cursor-readout-row rounded-[var(--radius-structural)] border border-rule bg-surface-2 px-2 py-0.5 font-mono text-label-2 tabular-nums text-fg"
        >
          {`${row.label}: ${row.value === null ? "no data" : row.value}`}
        </span>
      ))}
    </div>
  );
}
