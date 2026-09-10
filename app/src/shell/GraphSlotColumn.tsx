import { useEffect, useRef } from "react";

import { setGraphSlotNode } from "./graphSlot";

/**
 * The wide-layout studio's maths-graph column. Renders an empty container
 * and publishes its DOM node into {@link setGraphSlotNode} for as long as
 * this component is mounted (the wide/studio layout); publishes `null` on
 * unmount, so a layout change back to medium/narrow (which drops
 * `ColumnFrame` entirely, `RouteHost.tsx`) reliably clears the slot rather
 * than leaving a stale node nothing will ever portal into again.
 *
 * `routes/pages/Notebook/index.tsx` owns everything rendered inside this
 * node (the real `GraphCanvas`, with its own source-palette rail and chart
 * type pickers, or the hidden/no-workbook placeholder) via `createPortal`
 * — this component never renders graph content itself, since the workbook
 * and its evaluation live in the Notebook page, not here. Exactly
 * `EditorSlotColumn.tsx`'s arrangement for the properties column (R109).
 */
export function GraphSlotColumn() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setGraphSlotNode(ref.current);
    return () => setGraphSlotNode(null);
  }, []);

  return <div ref={ref} className="h-full" />;
}
