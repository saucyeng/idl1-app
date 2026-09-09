import { useState } from "react";

import type { MarkProps } from "../plotForm/types";
import { CHART_TYPE_CATALOG } from "./chartTypeCatalog";
import { CHART_TYPE_ICONS } from "./chartTypeIcons";

/** Props for {@link ChartTypePicker}. */
export interface ChartTypePickerProps {
  /** Fired once with the chosen mark; the picker closes itself right
   *  after (`GraphCanvas.tsx`'s `handleChart` inserts the cell). */
  onSelect: (mark: MarkProps["mark"]) => void;
}

/**
 * The card's chart-type picker (decision 83, "idl0 pictograms carry
 * over"): a row of five small pictogram buttons, one per `MARK_NAMES`
 * value (`chartTypeCatalog.ts`), replacing `NodeCard.tsx`'s previous
 * single "Chart" button that always inserted a fixed `lineY` mark. A click
 * opens the row; a click on a pictogram commits that mark and closes it
 * again. Rendering only; not unit-tested (CLAUDE.md §4) — the catalog
 * itself (which marks exist, their labels) is tested on
 * `CHART_TYPE_CATALOG`.
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
    <div className="mt-1 flex items-center justify-between gap-1 rounded-[var(--radius-structural)] border border-rule bg-control px-1 py-0.5">
      {CHART_TYPE_CATALOG.map(({ mark, label, blurb }) => {
        const Icon = CHART_TYPE_ICONS[mark];
        return (
          <button
            key={mark}
            type="button"
            title={blurb}
            aria-label={label}
            className="rounded-[var(--radius-structural)] p-0.5 text-fg-dim hover:bg-control-active hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onSelect(mark);
            }}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
