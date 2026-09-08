import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
// Bundled from node_modules, like every other asset (offline-first: no CDN,
// CLAUDE.md §3) — not a network fetch.
import "@xyflow/react/dist/style.css";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { computeAutoLayoutPositions } from "../model/graphAutoLayout";
import { buildGraphModel, type GraphNode } from "../model/graphModel";
import { readGraphLayout } from "../model/graphLayout";
import { computeNodeStatuses } from "../model/graphStatus";
import { scanMathExpr, type MathExprCall } from "../model/mathExpr";
import type { WindowEvalState } from "../model/workbookState";
import { commitDrag } from "./dragCommit";
import { insertChartCell } from "./graphToChart";
import NodeCard, { type MathNodeData } from "./NodeCard";
import { shapeOf } from "./portShape";

const NODE_TYPES: NodeTypes = { mathNode: NodeCard };

/** Props for {@link GraphCanvas}. Every input is data the caller
 *  (`Notebook/index.tsx`, Task 10) already holds in `WorkbookState`/
 *  `AppState` — this component computes no number and fetches nothing of
 *  its own (CLAUDE.md §2: "Rust = numbers, JS = pictures"). */
export interface GraphCanvasProps {
  /** The open workbook's current markdown — the graph's source of truth
   *  (decision 40). */
  markdown: string;
  /** One representative window's `CellOutput[]` — feeds `buildGraphModel`'s
   *  `# label:` fallback and each definition's port shape. Multi-window
   *  port-shape display is out of this task's scope (§3.7.4 defines one
   *  shape per node, not one per selected window); the caller picks which
   *  window this is (typically the primary selection or `NO_WINDOW_KEY`'s
   *  result). `[]` before any evaluation has landed. */
  outputs: CellOutput[];
  /** The current selection, in order — `computeNodeStatuses`'s denominator
   *  (ruling R141 Q2). */
  selectedWindows: SelectedWindow[];
  /** `WorkbookState.windows`, unmodified. */
  windows: Map<string, WindowEvalState>;
  /** Each selected window's session's channel catalog, keyed by
   *  `session_id` — decision 44's grey-vs-red split. */
  sessionDetails: Map<string, SessionDetail>;
  /** Fired once a drag settles with a real position change — the new
   *  document markdown, ready for the existing debounced save flow
   *  (§3.7.1: no IPC on the interaction path; this fires only on drag
   *  stop, never while dragging). Not fired for a `"channel"` node (no
   *  stored-position home, §3.7.1) or a no-op drag. */
  onCommit: (markdown: string) => void;
  /** Fired when a card is clicked — the caller opens that node's owning
   *  cell in `EditorPanes` (Task 10's own "card click opens EditorPanes in
   *  the properties column", reusing `Notebook/index.tsx`'s existing
   *  `selectedCellId` mechanism, not a new one). Not fired for a
   *  `"channel"` node (it has no owning cell). */
  onSelectCell: (cellId: string) => void;
}

/** One node's `CellDefResult.value`, or `null` — looked up from `outputs`
 *  by the node's owning cell and definition name, for {@link shapeOf}. */
function valueFor(node: GraphNode, outputs: CellOutput[]) {
  if (node.kind !== "definition" || node.cellId === null) return null;
  const output = outputs.find((o) => o.cell_id === node.cellId);
  return output?.defs.find((d) => d.name === node.name)?.value ?? null;
}

/**
 * The maths graph canvas (C2 §3.7, decision 40/44, ruling R135): one React
 * Flow node per {@link import("../model/graphModel").GraphNode}, laid out
 * by the document's stored `graph` positions (falling back to
 * `graphAutoLayout.ts`'s deterministic layering), coloured by
 * `graphStatus.ts`'s per-node status. Dragging a node is entirely local
 * (`useNodesState`'s own change handler) — only `onNodeDragStop` calls
 * {@link commitDrag} and hands the caller the updated markdown, matching
 * §3.7.1's "no IPC on the interaction path".
 */
export default function GraphCanvas({ markdown, outputs, selectedWindows, windows, sessionDetails, onCommit, onSelectCell }: GraphCanvasProps) {
  const handleChart = useCallback(
    (nodeName: string) => {
      const next = insertChartCell(markdown, nodeName, "lineY");
      if (next !== markdown) onCommit(next);
    },
    [markdown, onCommit]
  );

  const model = useMemo(() => buildGraphModel(markdown, outputs), [markdown, outputs]);
  const layout = useMemo(() => readGraphLayout(markdown), [markdown]);
  const positions = useMemo(() => computeAutoLayoutPositions(model, layout), [model, layout]);
  const statuses = useMemo(
    () => computeNodeStatuses({ model, selectedWindows, windows, sessionDetails }),
    [model, selectedWindows, windows, sessionDetails]
  );

  const flowNodes = useMemo<Node<MathNodeData, "mathNode">[]>(() => {
    return model.nodes.map((graphNode) => {
      const call: MathExprCall | null = graphNode.exprText !== null ? scanMathExpr(graphNode.exprText).call : null;
      const result = statuses.get(graphNode.id) ?? { status: "pending" as const, split: null };
      const position = positions[graphNode.id] ?? [0, 0];
      return {
        id: graphNode.id,
        type: "mathNode",
        position: { x: position[0], y: position[1] },
        data: { graphNode, status: result.status, split: result.split, shape: shapeOf(valueFor(graphNode, outputs)), call, onChart: handleChart },
      };
    });
  }, [model.nodes, positions, statuses, outputs, handleChart]);

  const flowEdges = useMemo<Edge[]>(() => model.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })), [model.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // The document (or its evaluation) changed under us — resync the
  // controlled xyflow state. A user's in-flight drag is local state xyflow
  // itself owns between renders, so this does not fight a live gesture.
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  const handleNodeDragStop = useCallback<OnNodeDrag<Node<MathNodeData, "mathNode">>>(
    (_event, draggedNode) => {
      if (draggedNode.data.graphNode.kind !== "definition") return; // no stored-position home, §3.7.1
      const next = commitDrag(markdown, { kind: "node", name: draggedNode.data.graphNode.name }, draggedNode.position.x, draggedNode.position.y);
      if (next !== markdown) onCommit(next);
    },
    [markdown, onCommit]
  );

  const handleNodeClick = useCallback<NodeMouseHandler<Node<MathNodeData, "mathNode">>>(
    (_event, clickedNode) => {
      const cellId = clickedNode.data.graphNode.cellId;
      if (cellId !== null) onSelectCell(cellId);
    },
    [onSelectCell]
  );

  return (
    <div className="h-full w-full bg-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
