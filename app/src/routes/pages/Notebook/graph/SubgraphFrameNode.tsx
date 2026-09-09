import { type Node, type NodeProps } from "@xyflow/react";

import type { SubgraphFrame } from "../model/graphSubgraphFrame";

/** `SubgraphFrameNode`'s own `data` shape. */
export interface SubgraphFrameData extends Record<string, unknown> {
  frame: SubgraphFrame;
  /** Fired when the frame's own header is clicked — collapses the cell
   *  (decision 43's KiCad-subsheet close gesture). */
  onCollapse: (cellId: string) => void;
}

/**
 * The KiCad-subsheet boundary box for one expanded math cell (decision 43):
 * a labelled rectangle drawn behind the cell's own member cards, sized by
 * `model/graphSubgraphFrame.ts`'s pure `subgraphFrameFor`. Rendered as an
 * ordinary xyflow node with `zIndex: -1` (`GraphCanvas.tsx` sets this) so
 * it sits behind every real card without needing a parent/child node
 * relationship. Pointer events pass through everywhere except the header
 * label, which is the click target for collapsing. Rendering only; not
 * unit-tested (CLAUDE.md §4) — the box geometry itself is tested on
 * `subgraphFrameFor`.
 */
export default function SubgraphFrameNode({ data }: NodeProps<Node<SubgraphFrameData, "subgraphFrame">>) {
  const { frame, onCollapse } = data;
  return (
    <div
      style={{ width: frame.width, height: frame.height, pointerEvents: "none" }}
      className="rounded-[var(--radius-card)] border border-dashed border-rule"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCollapse(frame.cellId);
        }}
        style={{ pointerEvents: "auto" }}
        className="-mt-[1px] ml-2 -translate-y-1/2 rounded-[var(--radius-structural)] border border-rule bg-surface px-2 py-0.5 text-label-2 text-fg-dim hover:text-fg"
      >
        ▾ {frame.label ?? frame.cellId}
      </button>
    </div>
  );
}
