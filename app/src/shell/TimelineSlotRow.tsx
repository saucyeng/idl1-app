import { useEffect, useRef } from "react";

import { setTimelineSlotNode } from "./timelineSlot";

/**
 * The shell-owned band that hosts the Notebook's timeline / windowing strip
 * (ruling R221.1). Renders an empty container inside the chrome layer and
 * publishes its DOM node for the Notebook page to portal its existing
 * `TimelineStrip` into.
 *
 * Deliberately bare, exactly as `ToolbarSlotRow.tsx` is: no padding, border
 * or background of its own. Those belong to the strip, so that on every
 * route but Notebook — where nothing is portaled in — this row is a
 * childless block of true zero height rather than an empty bordered strip.
 */
export function TimelineSlotRow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTimelineSlotNode(ref.current);
    return () => setTimelineSlotNode(null);
  }, []);

  return <div ref={ref} className="shell-chrome" />;
}
