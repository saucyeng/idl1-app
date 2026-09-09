import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
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
// Themes the stock MiniMap/Controls from `tokens.css` (Task 4) — imported
// after xyflow's own stylesheet so its declarations win the cascade.
import "./graphCanvasTheme.css";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { computeAutoLayoutPositions } from "../model/graphAutoLayout";
import { buildGraphModel, type GraphNode } from "../model/graphModel";
import { readGraphLayout } from "../model/graphLayout";
import { computeNodeStatuses } from "../model/graphStatus";
import { scanMathExpr, type MathExprCall } from "../model/mathExpr";
import type { WindowEvalState } from "../model/workbookState";
import type { MarkProps } from "../plotForm/types";
import { subgraphsFor, searchNodeIds, visibleNodeIds } from "../model/graphSubgraph";
import { collapsedNodePosition, collapsedSubgraphNodesFor, subgraphFramesFor, FRAME_NODE_HEIGHT, FRAME_NODE_WIDTH } from "../model/graphSubgraphFrame";
import { editLiteralArg, renameDefinition, rewireInput, type UnresolvedRenameRef } from "../model/graphEdits";
import { commitDrag } from "./dragCommit";
import { insertChartCell } from "./graphToChart";
import NodeCard, { type MathNodeData } from "./NodeCard";
import { shapeOf } from "./portShape";
import SubgraphCollapsedNode, { type SubgraphCollapsedData } from "./SubgraphCollapsedNode";
import SubgraphFrameNode, { type SubgraphFrameData } from "./SubgraphFrameNode";

const NODE_TYPES: NodeTypes = { mathNode: NodeCard, subgraphFrame: SubgraphFrameNode, subgraphCollapsed: SubgraphCollapsedNode };

/** The three node shapes this canvas ever hands xyflow — a math node, an
 *  expanded cell's boundary box, or a collapsed cell's closed subsheet
 *  node (decision 43). `useNodesState`/`onNodeDragStop`/`onNodeClick` all
 *  see the union; only `"mathNode"` ever drags or opens `EditorPanes`
 *  (the frame and collapsed nodes gate on `type` before touching
 *  `MathNodeData`-only fields). */
type FlowNode = Node<MathNodeData, "mathNode"> | Node<SubgraphFrameData, "subgraphFrame"> | Node<SubgraphCollapsedData, "subgraphCollapsed">;

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
export default function GraphCanvas(props: GraphCanvasProps) {
  // `useReactFlow` (search-hit centring, below) only resolves inside a
  // `<ReactFlowProvider>` — this outer component exists solely to host
  // that provider around the search input *and* the `<ReactFlow>` tree,
  // since the two are siblings (the search input lives in this component's
  // own toolbar, not inside `<ReactFlow>`'s rendered subtree).
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({ markdown, outputs, selectedWindows, windows, sessionDetails, onCommit, onSelectCell }: GraphCanvasProps) {
  // Task 5's own chart-type picker (decision 83, "idl0 pictograms carry
  // over") replaces the old fixed-"lineY" chart button — `mark` now comes
  // from `NodeCard.tsx`'s `ChartTypePicker`, one of `MARK_NAMES`'s five
  // values, never guessed here.
  const handleChart = useCallback(
    (nodeName: string, mark: MarkProps["mark"]) => {
      const next = insertChartCell(markdown, nodeName, mark);
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

  // KiCad-subsheet frame (decision 43) -- an expanded cell draws a boundary
  // box behind its own member cards; a collapsed cell replaces every one of
  // its member cards (not just the internal ones `visibleNodeIds` hides —
  // see `memberNodeIdsByCollapsedCell` below) with one synthetic node
  // showing its name and named input/output ports, closing the way a
  // KiCad subsheet does rather than reading as deletion.
  const subgraphFrames = useMemo(() => subgraphFramesFor(subgraphs, positions, collapsedCellIds), [subgraphs, positions, collapsedCellIds]);
  const collapsedSubgraphNodes = useMemo(() => collapsedSubgraphNodesFor(subgraphs, model, collapsedCellIds), [subgraphs, model, collapsedCellIds]);
  const collapsedCellIdByMemberId = useMemo(() => {
    const map = new Map<string, string>();
    for (const sg of subgraphs) {
      if (!collapsedCellIds.has(sg.cellId)) continue;
      for (const id of [...sg.internalIds, ...sg.outputIds]) map.set(id, sg.cellId);
    }
    return map;
  }, [subgraphs, collapsedCellIds]);

  // Canvas search (decision 42) -- matched node ids are passed through to
  // each card as a `highlighted` flag (`MathNodeData`) rather than this
  // component reaching into xyflow's own selection/viewport state, so the
  // decision of *which* nodes match stays in `model/graphSubgraph.ts`'s
  // pure `searchNodeIds`.
  const [searchQuery, setSearchQuery] = useState("");
  const matchedIds = useMemo(() => new Set(searchNodeIds(model, searchQuery)), [model, searchQuery]);

  // A hit pans to it, not just highlights it (Task 3's own gap: with ~50
  // definitions expected a search that highlights without navigating is
  // barely better than none). Only the first match centres — this is a
  // "go there" gesture, not a multi-result carousel, which decision 42
  // never asked for. A match inside a collapsed cell centres on that
  // cell's own synthetic node (`collapsedNodePosition`) since the matched
  // node itself is not on the canvas.
  const { setCenter } = useReactFlow();
  const firstMatchId = matchedIds.size > 0 ? [...matchedIds][0] : null;
  useEffect(() => {
    if (firstMatchId === null) return;
    const collapsedInto = collapsedCellIdByMemberId.get(firstMatchId);
    const sg = collapsedInto !== undefined ? subgraphs.find((s) => s.cellId === collapsedInto) : undefined;
    const [x, y] = sg !== undefined ? collapsedNodePosition(sg, positions) : positions[firstMatchId] ?? [0, 0];
    setCenter(x + FRAME_NODE_WIDTH / 2, y + FRAME_NODE_HEIGHT / 2, { zoom: 1, duration: 300 });
  }, [firstMatchId, collapsedCellIdByMemberId, subgraphs, positions, setCenter]);

  const mathFlowNodes = useMemo<Node<MathNodeData, "mathNode">[]>(() => {
    return model.nodes
      .filter((graphNode) => visibleIds.has(graphNode.id) && !collapsedCellIdByMemberId.has(graphNode.id))
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
  }, [model.nodes, positions, statuses, outputs, handleChart, handleRename, handleEditArg, visibleIds, matchedIds, collapsedCellIdByMemberId]);

  const frameFlowNodes = useMemo<Node<SubgraphFrameData, "subgraphFrame">[]>(
    () =>
      subgraphFrames.map((frame) => ({
        id: `frame:${frame.cellId}`,
        type: "subgraphFrame",
        position: { x: frame.x, y: frame.y },
        zIndex: -1,
        draggable: false,
        selectable: false,
        data: { frame, onCollapse: toggleCollapsed },
      })),
    [subgraphFrames]
  );

  const collapsedFlowNodes = useMemo<Node<SubgraphCollapsedData, "subgraphCollapsed">[]>(
    () =>
      collapsedSubgraphNodes.map((collapsed) => {
        const sg = subgraphs.find((s) => s.cellId === collapsed.cellId);
        const [x, y] = sg !== undefined ? collapsedNodePosition(sg, positions) : [0, 0];
        return {
          id: `subgraph:${collapsed.cellId}`,
          type: "subgraphCollapsed",
          position: { x, y },
          data: { collapsed, onExpand: toggleCollapsed },
        };
      }),
    [collapsedSubgraphNodes, subgraphs, positions]
  );

  const flowNodes = useMemo<FlowNode[]>(() => [...frameFlowNodes, ...mathFlowNodes, ...collapsedFlowNodes], [frameFlowNodes, mathFlowNodes, collapsedFlowNodes]);

  // A collapsed cell's own member nodes (internal AND output — the whole
  // cell closes into one synthetic node, decision 43) are gone from the
  // canvas; an edge that touched one is rewired onto the synthetic node's
  // matching named `Handle` (`SubgraphCollapsedNode.tsx` gives every port a
  // handle id equal to the original node id) instead of being dropped. An
  // edge wholly inside one collapsed cell resolves to the same synthetic
  // node on both ends and is dropped — it is now internal wiring the closed
  // sheet no longer shows.
  const flowEdges = useMemo<Edge[]>(() => {
    const endpoint = (id: string): { node: string; handle: string | undefined } => {
      const cellId = collapsedCellIdByMemberId.get(id);
      return cellId !== undefined ? { node: `subgraph:${cellId}`, handle: id } : { node: id, handle: undefined };
    };
    return model.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => {
        const source = endpoint(edge.source);
        const target = endpoint(edge.target);
        return { id: edge.id, source: source.node, sourceHandle: source.handle, target: target.node, targetHandle: target.handle };
      })
      .filter((edge) => edge.source !== edge.target);
  }, [model.edges, visibleIds, collapsedCellIdByMemberId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // The document (or its evaluation) changed under us — resync the
  // controlled xyflow state. A user's in-flight drag is local state xyflow
  // itself owns between renders, so this does not fight a live gesture.
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  const handleNodeDragStop = useCallback<OnNodeDrag<FlowNode>>(
    (_event, draggedNode) => {
      if (draggedNode.type !== "mathNode" || draggedNode.data.graphNode.kind !== "definition") return; // no stored-position home, §3.7.1; frame/collapsed nodes never drag
      const next = commitDrag(markdown, { kind: "node", name: draggedNode.data.graphNode.name }, draggedNode.position.x, draggedNode.position.y);
      if (next !== markdown) onCommit(next);
    },
    [markdown, onCommit]
  );

  const handleNodeClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_event, clickedNode) => {
      if (clickedNode.type !== "mathNode") return; // frame/collapsed nodes have their own collapse/expand click target
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
      <div className="idl-graph-canvas min-h-0 flex-1">
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
