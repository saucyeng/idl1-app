import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { StatusDot } from "@/components/brand/StatusDot";
import type { MathExprCall } from "../model/mathExpr";
import type { GraphNode } from "../model/graphModel";
import type { NodeStatus } from "../model/graphStatus";
import type { PortShape } from "./portShape";

/** Matches `CellFrame.tsx`'s own `STATUS_DOT_CLASS` mapping (pending →
 *  `--fg-faint`, ok → `--good`, error → `--accent`) — the same status dot
 *  convention every other run-state indicator in the app uses. `"grey"` has
 *  no entry: decision 44's downstream grey node shows no glyph at all, only
 *  the card's own muted styling (see the `status === "grey"` branch below). */
const STATUS_DOT_CLASS: Record<Exclude<NodeStatus, "grey">, string> = {
  pending: "text-fg-faint",
  ok: "text-good",
  error: "text-accent",
};

/** `NodeCard`'s own `data` shape — everything it renders is passed in, it
 *  derives nothing itself (`GraphCanvas.tsx` computes shape/status/call
 *  once per render, not once per node component instance). */
export interface MathNodeData extends Record<string, unknown> {
  graphNode: GraphNode;
  status: NodeStatus;
  /** R132's named split ("2 of 3 windows"), or `null`. */
  split: string | null;
  /** `"unknown"` for a `"channel"` node — a source node has no shape of its
   *  own (C2 §3.7.4 only defines a shape for a definition's evaluated
   *  value). */
  shape: PortShape;
  /** The definition's outer call (`mathExpr.ts`), or `null` for an opaque
   *  expression or a `"channel"` node. */
  call: MathExprCall | null;
}

/**
 * One graph node's card (C2 §3.7.4, decision 44, R132): name (falling back
 * to the identifier when there is no `# label:`), the status glyph, the
 * port shape, and — for a definition with a recognised outer call — its
 * name and literal arguments. Hover shows the full `def_line` (name,
 * expression, and — via the title attribute's own text — what it reads);
 * a `"channel"` source node renders as a plain stub with no call/shape row
 * (it has neither). Rendering only; not unit-tested (CLAUDE.md §4) — the
 * decision logic behind every value here lives in `model/graphStatus.ts`,
 * `model/mathExpr.ts`, and `graph/portShape.ts`.
 */
export default function NodeCard({ data }: NodeProps<Node<MathNodeData, "mathNode">>) {
  const { graphNode, status, split, shape, call } = data;
  const isChannel = graphNode.kind === "channel";
  const displayName = graphNode.label ?? graphNode.name;
  const hoverText = graphNode.exprText !== null ? `${graphNode.name} = ${graphNode.exprText}` : graphNode.name;

  return (
    <div
      className={`min-w-[160px] rounded-[var(--radius-card)] border border-rule bg-surface px-3 py-2 ${status === "grey" ? "opacity-50" : ""}`}
      title={hoverText}
    >
      {!isChannel && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-label-1 text-fg">{displayName}</span>
        {status !== "grey" && (
          <StatusDot className={STATUS_DOT_CLASS[status]}>{split ?? status}</StatusDot>
        )}
      </div>
      {!isChannel && (
        <div className="mt-1 flex items-center justify-between gap-2 text-label-2 text-fg-dim">
          <span className="truncate">{call !== null ? `${call.name}(${call.args.join(", ")})` : "…"}</span>
          <span className="font-mono text-fg-faint">{shape}</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
