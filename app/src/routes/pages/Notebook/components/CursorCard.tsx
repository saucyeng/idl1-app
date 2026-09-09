import type { CursorCardRow } from "../model/cursorCard";
import { unitLabelText } from "../model/unitLabel";

/** Props for {@link CursorCard}. */
export interface CursorCardProps {
  /** CSS px position (relative to the chart's own plotted area) to anchor the card at -- the cursor's own pixel, same coordinate space as `ChartCell`'s existing hover tooltip. */
  pixelX: number;
  /** One row per overlaid window (`model/cursorCard.ts`'s `cursorCardRows`, ruling R139) -- never empty; `ChartCell.tsx` renders no `CursorCard` at all when there are no rows. */
  rows: CursorCardRow[];
}

/**
 * The cursor value card (decision 55): a small card at the cursor showing
 * each overlaid window's own value for this chart's series at the cursor's
 * X, positioned by its caller (`ChartCell.tsx`) exactly like the existing
 * per-cell hover tooltip. Renders `"no data"` for a `null` value (R31's own
 * convention, `model/cursor.ts`'s `formatReadout` doc comment) -- never `0`
 * or a blank cell indistinguishable from a real reading of zero. A row's
 * own `windowLabel` is shown only when set (more than one window
 * selected, R132) -- a single-window card shows no window text at all,
 * byte-identical to the pre-multi-window shape (R127 item 3).
 *
 * Not unit-tested (CLAUDE.md §4: rendering is not unit-tested) -- every row
 * decision this renders is `model/cursorCard.ts`'s own tested pure
 * function.
 */
export default function CursorCard({ pixelX, rows }: CursorCardProps) {
  return (
    <div className="chart-cell-cursor-card pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-[var(--radius-structural)] border border-rule bg-bg-raised px-1.5 py-1 font-mono text-label-2" style={{ left: pixelX }}>
      {rows.map((row, i) => {
        // R154 item 6: only a `known` unit prints a suffix -- `dimensionless`
        // prints nothing (a count genuinely has no unit to append) and
        // `unknown` also prints nothing here rather than a "?" marker, since
        // this small inline card has no room for a tooltip explaining why;
        // the explicit `unknown` marker belongs to the graph node card and
        // source palette (Task 3), which have space for one.
        const unitText = unitLabelText(row.unit);
        return (
          <div key={i} className="flex items-center gap-1" style={{ borderLeft: `2px solid var(${row.colour})`, paddingLeft: 4 }}>
            {row.windowLabel !== null && <span className="text-fg-dim">{row.windowLabel}</span>}
            <span className="text-fg">
              {row.seriesLabel}: {row.value === null ? "no data" : row.value}
              {row.value !== null && unitText !== "" ? ` ${unitText}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
