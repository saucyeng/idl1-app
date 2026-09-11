import { useEffect, useRef } from "react";

import { setToolbarSlotNode } from "./toolbarSlot";

/**
 * The shell-owned row that hosts the full-width Notebook toolbar
 * (bug report fixed 2026-09-09, correcting R161). Renders an empty
 * container and publishes its DOM node into {@link setToolbarSlotNode} for
 * as long as this component is mounted — `AppShell.tsx` mounts it
 * unconditionally, at the top of the editor area, so it publishes for the whole
 * app's lifetime.
 *
 * Deliberately bare: no padding, border or background classes here. Those
 * live on the toolbar content itself (`routes/pages/Notebook/index.tsx`
 * still owns the toolbar's markup and handlers, only portaling it here), so
 * that when nothing is portaled in — every route but Notebook, per
 * `toolbarSlot.ts`'s doc comment — this row is a childless block with no
 * intrinsic size and renders as true zero height, not an empty bordered
 * strip.
 */
export function ToolbarSlotRow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setToolbarSlotNode(ref.current);
    return () => setToolbarSlotNode(null);
  }, []);

  return <div ref={ref} />;
}
