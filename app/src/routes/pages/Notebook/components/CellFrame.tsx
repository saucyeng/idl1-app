import type { ReactNode } from "react";

import type { ScannedCell } from "../model/cells";

/** Props for {@link CellFrame}. */
export interface CellFrameProps {
  /** This cell's non-authoritative scan record (`model/cells.ts`) — read
   *  only for its `id` (for `data-cell-id`); `CellFrame` never re-derives
   *  or re-renders a cell's output itself, that is `children`. */
  cell: ScannedCell;
  /** Whether this is the currently open cell (`Notebook/index.tsx`'s
   *  `selectedCellId`, Task 13's own selection state — `CellFrame` keeps
   *  no selection state of its own, per the brief's "one source of truth"
   *  rule). */
  selected: boolean;
  /** Fired on click. `Notebook/index.tsx` decides what selecting this cell
   *  means (including doing nothing for a cell whose scan found no `id` —
   *  see its own call site's doc comment); this component only reports the
   *  gesture. */
  onSelect: () => void;
  /** This cell's already-rendered output — `CellList.tsx`'s per-kind
   *  renderer (`MathCell`/`TableCell`/the injected `renderJsCell`) or its
   *  pending placeholder. `CellFrame` only adds the selection chrome
   *  around it; it never builds this itself. */
  children: ReactNode;
}

/**
 * The per-cell chrome mounted through `CellList.tsx`'s `frame` hook
 * (Task 15, ruling R74): a click affordance that opens this cell in the
 * editor shell (`EditorPanes`), wrapping whatever `CellList` already
 * rendered for this cell so every kind (math/table/js alike) is
 * selectable, not only `js` cells. Carries `data-cell-id`/`data-selected`
 * for styling and possible future scroll-into-view/keyboard-nav hooks —
 * neither built here.
 */
export default function CellFrame({ cell, selected, onSelect, children }: CellFrameProps) {
  return (
    <div className="cell-frame" data-cell-id={cell.id ?? undefined} data-selected={selected} onClick={onSelect}>
      {children}
    </div>
  );
}
