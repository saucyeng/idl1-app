import { useCallback, useEffect, useMemo, useState } from "react";
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
  type OnReconnect,
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
import { subgraphsFor, searchNodeIds, visibleNodeIds } from "../model/graphSubgraph";
import { editLiteralArg, renameDefinition, rewireInput, type UnresolvedRenameRef } from "../model/graphEdits";
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

/** R145's "renamed; N reference(s) in cell(s) X were not updated" line —
 *  named cells, not a bare count, so the note is enough to go find them. */
function describeUnresolved(oldName: string, newName: string, unresolved: UnresolvedRenameRef[]): string {
  const cellIds = [...new Set(unresolved.map((u) => u.cellId))];
  return `Renamed ${oldName} → ${newName}. ${unresolved.length} reference(s) in cell(s) ${cellIds.join(", ")} could not be updated automatically (custom code or prose) — check them by hand.`;
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

  // Rename (decision 45a): the one gesture that writes both a cell body
  // and the `graph` key in a single dispatch (§3.7.3's deliberate
  // exception) -- `renameDefinition` already does both in one pass. R145's
  // "report what could not be rewritten" surfaces here as `renameNotice`,
  // a plain dismissible line rather than a silent success: a rename must
  // never present itself as complete when a js cell's custom code or a
  // prose span still names the old identifier.
  const [renameNotice, setRenameNotice] = useState<string | null>(null);
  const handleRename = useCallback(
    (oldName: string, newName: string) => {
      const result = renameDefinition(markdown, oldName, newName);
      if (result.markdown !== markdown) onCommit(result.markdown);
      setRenameNotice(result.unresolved.length > 0 ? describeUnresolved(oldName, newName, result.unresolved) : null);
    },
    [markdown, onCommit]
  );

  // Edit a literal argument on the card (decision 45a) -- `editLiteralArg`
  // re-serialises just that one call, verbatim text, no validation beyond
  // what that pure function already does (see its own doc comment).
  const handleEditArg = useCallback(
    (cellId: string, defName: string, argIndex: number, newText: string) => {
      const next = editLiteralArg(markdown, cellId, defName, argIndex, newText);
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

  // Subgraph collapse/expand (decision 42) -- a list of collapsed cell ids
  // is enough state to drive `visibleNodeIds`; which cell frame each
  // definition belongs to on the canvas itself is `model/graphSubgraph.ts`'s
  // job, not this component's.
  const [collapsedCellIds, setCollapsedCellIds] = useState<Set<string>>(new Set());
  const subgraphs = useMemo(() => subgraphsFor(model), [model]);
  const visibleIds = useMemo(() => visibleNodeIds(model, subgraphs, collapsedCellIds), [model, subgraphs, collapsedCellIds]);

  // Canvas search (decision 42) -- matched node ids are passed through to
  // each card as a `highlighted` flag (`MathNodeData`) rather than this
  // component reaching into xyflow's own selection/viewport state, so the
  // decision of *which* nodes match stays in `model/graphSubgraph.ts`'s
  // pure `searchNodeIds`.
  const [searchQuery, setSearchQuery] = useState("");
  const matchedIds = useMemo(() => new Set(searchNodeIds(model, searchQuery)), [model, searchQuery]);

  const flowNodes = useMemo<Node<MathNodeData, "mathNode">[]>(() => {
    return model.nodes
      .filter((graphNode) => visibleIds.has(graphNode.id))
      .map((graphNode) => {
        const call: MathExprCall | null = graphNode.exprText !== null ? scanMathExpr(graphNode.exprText).call : null;
        const result = statuses.get(graphNode.id) ?? { status: "pending" as const, split: null };
        const position = positions[graphNode.id] ?? [0, 0];
        return {
          id: graphNode.id,
          type: "mathNode",
          position: { x: position[0], y: position[1] },
          data: {
            graphNode,
            status: result.status,
            split: result.split,
            shape: shapeOf(valueFor(graphNode, outputs)),
            call,
            onChart: handleChart,
            onRename: handleRename,
            onEditArg:
              graphNode.kind === "definition" && graphNode.cellId !== null
                ? (argIndex: number, newText: string) => handleEditArg(graphNode.cellId as string, graphNode.name, argIndex, newText)
                : undefined,
            highlighted: matchedIds.has(graphNode.id),
          },
        };
      });
  }, [model.nodes, positions, statuses, outputs, handleChart, handleRename, handleEditArg, visibleIds, matchedIds]);

  const flowEdges = useMemo<Edge[]>(
    () => model.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    [model.edges, visibleIds]
  );

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

  // Drag-a-port-to-rewire (decision 45a's third gesture): dragging an
  // edge's own endpoint onto a different node reconnects it — xyflow's
  // native edge-reconnection gesture, not a fresh connection (`onConnect`
  // is intentionally not wired: this graph's edges are derived entirely
  // from the document's own `[Name]` references, so "connect" only ever
  // makes sense as "replace the reference an existing edge already
  // names"). `oldEdge.source`/`newConnection.source` are node ids; the old
  // and new *reference names* `rewireInput` needs are each that node's own
  // `GraphNode.name` — a `"channel"` node's `id` and `name` differ
  // (`channel:x` vs `x`), so this never passes a raw node id where the
  // document expects an identifier or a channel id.
  const nodesById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const handleReconnect = useCallback<OnReconnect<Edge>>(
    (oldEdge, newConnection) => {
      const target = nodesById.get(oldEdge.target);
      const oldSource = nodesById.get(oldEdge.source);
      const newSource = newConnection.source !== null ? nodesById.get(newConnection.source) : undefined;
      if (target?.cellId === undefined || target?.cellId === null || oldSource === undefined || newSource === undefined) return;
      const next = rewireInput(markdown, target.cellId, target.name, oldSource.name, newSource.name);
      if (next !== markdown) onCommit(next);
    },
    [markdown, onCommit, nodesById]
  );

  function toggleCollapsed(cellId: string): void {
    setCollapsedCellIds((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  }

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="flex items-center gap-3 border-b border-rule px-3 py-2">
        <input
          type="text"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-[var(--radius-structural)] border border-rule bg-control px-2 py-1 text-label-2 text-fg"
        />
        {subgraphs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {subgraphs.map((sg) => (
              <button
                key={sg.cellId}
                type="button"
                onClick={() => toggleCollapsed(sg.cellId)}
                aria-pressed={collapsedCellIds.has(sg.cellId)}
                className="rounded-[var(--radius-structural)] border border-rule px-2 py-0.5 text-label-2 text-fg-dim hover:text-fg"
              >
                {collapsedCellIds.has(sg.cellId) ? "▸" : "▾"} {sg.label ?? sg.cellId}
              </button>
            ))}
          </div>
        )}
      </div>
      {renameNotice !== null && (
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-2 px-3 py-1 text-label-2 text-fg-dim">
          <span>{renameNotice}</span>
          <button type="button" onClick={() => setRenameNotice(null)} className="text-fg-faint hover:text-fg">
            Dismiss
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onReconnect={handleReconnect}
          edgesReconnectable
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
