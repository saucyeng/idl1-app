import { useEffect, useRef } from "react";

import { setEditorSlotNode } from "./editorSlot";

/**
 * The wide-layout studio's properties column (R108/R109). Renders an empty
 * container and publishes its DOM node into {@link setEditorSlotNode} for
 * as long as this component is mounted (the wide/studio layout); publishes
 * `null` on unmount, so a layout change back to medium/narrow (which drops
 * `ColumnFrame` entirely, `RouteHost.tsx`) reliably clears the slot rather
 * than leaving a stale node nothing will ever portal into again.
 *
 * `routes/pages/Notebook/index.tsx` owns everything rendered inside this
 * node (the real `EditorPanes`, or its own no-cell-selected empty state)
 * via `createPortal` — this component never renders cell content itself,
 * since selection state lives in the Notebook page, not here.
 */
export function EditorSlotColumn() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditorSlotNode(ref.current);
    return () => setEditorSlotNode(null);
  }, []);

  return <div ref={ref} className="h-full" />;
}
