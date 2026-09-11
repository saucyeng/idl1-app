import { useState } from "react";

import type { ChartTypeId } from "./chartTypeCatalog";
import { CHART_TYPE_CATALOG } from "./chartTypeCatalog";
import { CHART_TYPE_ICONS } from "./chartTypeIcons";

/** Props for {@link ChartTypePicker}. */
export interface ChartTypePickerProps {
  /** Fired once with the chosen chart type; the picker closes itself right
   *  after (`GraphCanvas.tsx`'s `handleChart` inserts the cell). */
  onSelect: (chartType: ChartTypeId) => void;
}

/**
 * The card's chart-type picker (decision 83, "idl0 pictograms carry
 * over"): a row of small pictogram buttons, one per `CHART_TYPE_IDS`
 * entry (`chartTypeCatalog.ts`) — C2 §5.3's five time-cell marks plus one
 * per whole-cell chart kind the grammar has a production for (ruling
 * R215) — replacing `NodeCard.tsx`'s previous single "Chart" button that
 * always inserted a fixed `lineY` mark. A click opens the row; a click on
 * a pictogram commits that chart type and closes it again. Rendering only;
 * not unit-tested (CLAUDE.md §4) — the catalog itself (which chart types
 * exist, their labels) is tested on `CHART_TYPE_CATALOG`.
 */
export default function ChartTypePicker({ onSelect }: ChartTypePickerProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 w-full rounded-[var(--radius-structural)] border border-rule px-2 py-0.5 text-label-2 text-fg-dim hover:text-fg"
        onClick={(e) => {
          e.stopPropagation(); // a click here opens the picker, not "select this node" (onNodeClick)
          setOpen(true);
        }}
      >
        Chart
      </button>
    );
  }

  return (
    // `flex-wrap`: the row grew past the original five marks (ruling R215
    // adds one entry per whole-cell chart kind), and a graph card is
    // narrow — wrapping keeps every pictogram reachable instead of
    // overflowing the card's own box.
    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 rounded-[var(--radius-structural)] border border-rule bg-control px-1 py-0.5">
      {CHART_TYPE_CATALOG.map(({ id, label, blurb }) => {
        const Icon = CHART_TYPE_ICONS[id];
        return (
          <button
            key={id}
            type="button"
            title={blurb}
            aria-label={label}
            className="rounded-[var(--radius-structural)] p-0.5 text-fg-dim hover:bg-control-active hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onSelect(id);
            }}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
