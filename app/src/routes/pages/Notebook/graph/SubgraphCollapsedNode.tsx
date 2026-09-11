import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { CollapsedSubgraphNode } from "../model/graphSubgraphFrame";

/** `SubgraphCollapsedNode`'s own `data` shape. */
export interface SubgraphCollapsedData extends Record<string, unknown> {
  collapsed: CollapsedSubgraphNode;
  /** Fired when the node's header is clicked — expands the cell back open
   *  (decision 43's KiCad-subsheet open gesture). */
  onExpand: (cellId: string) => void;
  /** What the closed sheet titles itself with: the cell's `# label:`, else
   *  `"Cell N"` by document order (`cellDisplayName.ts`, R214 item 2) —
   *  never the bare `hex8`, which is the title's tooltip instead. */
  displayName: string;
}

/** Even vertical spacing (percent of the node's own height) for `n` stacked
 *  ports on one edge — same idea as `NodeCard.tsx`'s single centred
 *  target/source `Handle`, generalised to more than one. */
function portOffsetsPercent(n: number): number[] {
  return Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * 100);
}

/**
 * A collapsed math cell's KiCad-subsheet closed form (decision 43): one
 * node showing the cell's own label, with its named input ports down the
 * left edge and named output ports down the right edge — the shape
 * `graphSubgraphFrame.ts`'s `collapsedSubgraphNodesFor` already computed.
 * Replaces the pre-existing behaviour of simply dropping the cell's
 * internal cards from the node list, which read as deletion rather than
 * collapse. Rendering only; not unit-tested (CLAUDE.md §4) — the port list
 * itself is tested on `collapsedSubgraphNodesFor`.
 */
export default function SubgraphCollapsedNode({ data }: NodeProps<Node<SubgraphCollapsedData, "subgraphCollapsed">>) {
  const { collapsed, onExpand, displayName } = data;
  const inputOffsets = portOffsetsPercent(collapsed.inputs.length);
  const outputOffsets = portOffsetsPercent(collapsed.outputs.length);

  return (
    <div className="min-w-[180px] rounded-[var(--radius-card)] border border-rule bg-surface px-3 py-4">
      {collapsed.inputs.map((port, i) => (
        <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: `${inputOffsets[i]}%` }} />
      ))}
      {collapsed.outputs.map((port, i) => (
        <Handle key={port.id} id={port.id} type="source" position={Position.Right} style={{ top: `${outputOffsets[i]}%` }} />
      ))}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExpand(collapsed.cellId);
        }}
        title={collapsed.cellId}
        className="w-full truncate text-center text-label-1 text-fg hover:text-hivis"
      >
        ▸ {displayName}
      </button>

      <div className="mt-1 flex justify-between gap-2 text-label-2 text-fg-faint">
        <div className="flex flex-col items-start gap-0.5">
          {collapsed.inputs.map((port) => (
            <span key={port.id} className="truncate">
              {port.name}
            </span>
          ))}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {collapsed.outputs.map((port) => (
            <span key={port.id} className="truncate">
              {port.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
