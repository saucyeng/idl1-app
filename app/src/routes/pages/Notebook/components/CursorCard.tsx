import type { CursorCardRow } from "../model/cursorCard";

/** Props for {@link CursorCard}. */
export interface CursorCardProps {
  /** CSS px position (relative to the chart's own plotted area) to anchor the card at -- the cursor's own pixel, same coordinate space as `ChartCell`'s existing hover tooltip. */
  pixelX: number;
  row: CursorCardRow;
}

/**
 * The cursor value card (decision 55): a small card at the cursor showing
 * one series' Y value at that X, positioned by its caller (`ChartCell.tsx`)
 * exactly like the existing per-cell hover tooltip. Renders `"no data"` for
 * a `null` value (R31's own convention, `model/cursor.ts`'s
 * `formatReadout` doc comment) -- never `0` or a blank cell indistinguishable
 * from a real reading of zero.
 *
 * Not unit-tested (CLAUDE.md §4: rendering is not unit-tested) -- every row
 * decision this renders is `model/cursorCard.ts`'s own tested pure
 * function.
 */
export default function CursorCard({ pixelX, row }: CursorCardProps) {
  return (
    <div
      className="chart-cell-cursor-card pointer-events-none absolute top-0 z-10 rounded-[var(--radius-structural)] border border-rule bg-bg-raised px-1.5 py-1 font-mono text-label-2"
      style={{ left: pixelX, borderLeft: `2px solid var(${row.colour})` }}
    >
      {row.windowLabel !== null && <div className="text-fg-dim">{row.windowLabel}</div>}
      <div className="text-fg">
        {row.seriesLabel}: {row.value === null ? "no data" : row.value}
        {row.value !== null && row.unit !== "" ? ` ${row.unit}` : ""}
      </div>
    </div>
  );
}
