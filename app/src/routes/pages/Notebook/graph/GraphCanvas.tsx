import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Background,
  MiniMap,
  Panel,
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
import type { CellOutput, UnitLabel, Window as SelectedWindow } from "../../../../ipc/workbook";
import { computeAutoLayoutPositions } from "../model/graphAutoLayout";
import { graphViewportAction, isTextEntry } from "../model/graphViewportKeys";
import { buildGraphModel, type GraphNode } from "../model/graphModel";
import { EMPTY_GRAPH_LAYOUT, readGraphLayout } from "../model/graphLayout";
import { computeNodeStatuses } from "../model/graphStatus";
import { scanMathExpr, type MathExprCall } from "../model/mathExpr";
import { rawUnitToLabel } from "../model/unitLabel";
import type { WindowEvalState } from "../model/workbookState";
import { subgraphsFor, searchNodeIds, visibleNodeIds } from "../model/graphSubgraph";
import { collapsedNodePosition, collapsedSubgraphNodesFor, subgraphFramesFor, FRAME_NODE_HEIGHT, FRAME_NODE_WIDTH } from "../model/graphSubgraphFrame";
import { editLiteralArg, renameDefinition, rewireInput, type UnresolvedRenameRef } from "../model/graphEdits";
import { dropPaletteSource, type PaletteDragSource } from "../model/graphPaletteDrop";
import { buildSourcePalette } from "../model/sourcePalette";
import { replaceCellBody, scanCells } from "../model/cells";
import { documentCellDisplayNames, setCellLabelLine } from "./cellDisplayName";
import { commitDrag, commitTidy } from "./dragCommit";
import type { ChartTypeId } from "./chartTypeCatalog";
import { insertChartCell } from "./graphToChart";
import NodeCard, { type MathNodeData } from "./NodeCard";
import { shapeOf } from "./portShape";
import SourcePaletteRail, { PALETTE_DRAG_MIME } from "./SourcePaletteRail";
import SubgraphCollapsedNode, { type SubgraphCollapsedData } from "./SubgraphCollapsedNode";
import SubgraphFrameNode, { type SubgraphFrameData } from "./SubgraphFrameNode";

const NODE_TYPES: NodeTypes = { mathNode: NodeCard, subgraphFrame: SubgraphFrameNode, subgraphCollapsed: SubgraphCollapsedNode };

/** How far out the canvas zooms — far enough to hold the ~50-definition
 *  workbook decision 42 plans for, where xyflow's own 0.5 default is not.
 *  A ruling-free number, chosen from that expected node count. */
const GRAPH_MIN_ZOOM = 0.05;
/** How far in the canvas zooms, so one card's arguments stay readable on a
 *  high-density display. */
const GRAPH_MAX_ZOOM = 4;
/** The zoom step Fit/Reset's neighbours apply, and what `+`/`-` do. */
const ZOOM_STEP_MS = 150;
/** Every button in the bottom-right corner cluster — one class, so the four
 *  of them cannot drift apart, sized entirely from the `--nb-*` density
 *  scale (`tokens.css`, R212 item 1). */
const CLUSTER_BUTTON_CLASS =
  "flex h-[var(--nb-control-h)] min-w-[var(--nb-control-h)] items-center justify-center rounded-[var(--radius-structural)] border border-rule bg-control px-[var(--nb-pad)] font-mono text-[length:var(--nb-text-label)] text-fg-dim hover:bg-control-active hover:text-fg";

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
  /** Fired with new document markdown whenever an edit on the canvas
   *  changes the document — a rename, a rewired input, an edited literal,
   *  a chart insertion, a palette drop's new definition, a settled node
   *  drag (C2 §3.7.1's `graph` key), or "Tidy". Ready for the existing
   *  debounced save flow; never fired mid-gesture. */
  onCommit: (markdown: string) => void;
  /** Fired when a card is clicked — the caller opens that node's owning
   *  cell in `EditorPanes` (Task 10's own "card click opens EditorPanes in
   *  the properties column", reusing `Notebook/index.tsx`'s existing
   *  `selectedCellId` mechanism, not a new one). Not fired for a
   *  `"channel"` node (it has no owning cell). */
  onSelectCell: (cellId: string) => void;
  /** The Settings preference "Colour-code graph nodes" (R214 item 1). Off
   *  by default; nothing on the canvas depends on it. */
  colourCodeNodes: boolean;
  /** The cell currently selected elsewhere in the Notebook (the Cells
   *  column, the whole-workbook code pane, an output chart) — its cards and
   *  its subgraph frame draw as selected, so the highlight R214 item 3 asks
   *  for follows selection both ways rather than only outwards from here.
   *  `null` when nothing is selected. */
  selectedCellId: string | null;
}

/** One node's `CellDefResult.value`, or `null` — looked up from `outputs`
 *  by the node's owning cell and definition name, for {@link shapeOf}. */
function valueFor(node: GraphNode, outputs: CellOutput[]) {
  if (node.kind !== "definition" || node.cellId === null) return null;
  const output = outputs.find((o) => o.cell_id === node.cellId);
  return output?.defs.find((d) => d.name === node.name)?.value ?? null;
}

/** One node's three-state unit (decision 45, R154/R164), for `NodeCard`'s
 *  own unit row. A `"channel"` node's `ChannelSummary.unit` (C1 §4.1) via
 *  `model/unitLabel.ts`'s `rawUnitToLabel` — read from any resolved
 *  session that carries it, the same "first resolved session decides"
 *  rule `sourcePalette.ts`'s `buildChannelGroups` uses; `null` when no
 *  resolved session has this channel yet. A `"definition"` node's
 *  `CellDefResult.unit` from `outputs`, mirroring {@link valueFor}'s own
 *  lookup; `null` only when neither `cellId` nor a matching `defs` entry
 *  exists yet (before the first evaluation) — distinct from `UnitLabel`'s
 *  own `unknown` state, which means "resolved, but no unit could be
 *  determined". */
function unitFor(node: GraphNode, outputs: CellOutput[], sessionDetails: Map<string, SessionDetail>): UnitLabel | null {
  if (node.kind === "channel") {
    for (const detail of sessionDetails.values()) {
      const channel = detail.channels.find((c) => c.channel_id === node.name);
      if (channel !== undefined) return rawUnitToLabel(channel.unit);
    }
    return null;
  }
  if (node.cellId === null) return null;
  const output = outputs.find((o) => o.cell_id === node.cellId);
  return output?.defs.find((d) => d.name === node.name)?.unit ?? null;
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
 * by the document's stored `graph` positions (§3.7.1), falling back to
 * `graphAutoLayout.ts`'s deterministic layering for any node that has none,
 * and coloured by `graphStatus.ts`'s per-node status.
 *
 * Dragging a node is entirely local (`useNodesState`'s own change handler)
 * — only `onNodeDragStop` calls {@link commitDrag} and hands the caller the
 * updated markdown, matching §3.7.1's "on drag settle rather than on every
 * pointer move (no IPC on the interaction path)". "Tidy" is that same write
 * for every node at once ({@link commitTidy}).
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

function GraphCanvasInner({ markdown, outputs, selectedWindows, windows, sessionDetails, onCommit, onSelectCell, colourCodeNodes, selectedCellId }: GraphCanvasProps) {
  // Task 5's own chart-type picker (decision 83, "idl0 pictograms carry
  // over") replaces the old fixed-"lineY" chart button — `chartType` now
  // comes from `NodeCard.tsx`'s `ChartTypePicker`, one of
  // `CHART_TYPE_IDS`' values (ruling R215: C2 §5.3's five time-cell marks
  // plus one per whole-cell chart kind), never guessed here.
  const handleChart = useCallback(
    (nodeName: string, chartType: ChartTypeId) => {
      const next = insertChartCell(markdown, nodeName, chartType);
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

  // One `useReactFlow()` call for the whole component -- `screenToFlowPosition`
  // (palette drop) and `setCenter` (search-hit centring, below) both need
  // it; calling the hook twice would work but reads as two unrelated
  // instances of the same handle.
  const reactFlow = useReactFlow();

  const model = useMemo(() => buildGraphModel(markdown, outputs), [markdown, outputs]);

  // R214 item 2: a cell's display name is its `# label:` (C2 §3.7.3),
  // falling back to "Cell N" by document order -- never the bare hex id,
  // which is what Isaac saw ("sub-blocks have weird names 1a000006"). The
  // id survives as each frame's tooltip. Every cell in the document counts
  // towards N, so the number matches the cell's place in the file.
  const scannedCells = useMemo(() => scanCells(markdown).cells, [markdown]);
  const displayNames = useMemo(() => documentCellDisplayNames(markdown), [markdown]);

  // R214 item 2's rename: writes `# label: <text>` as the cell's first line
  // through the ordinary cell-edit path (§3.7.3 -- an ordinary body edit,
  // touching no `graph` key and moving nothing). Math cells only: `#` is
  // not a comment in a `js` or `table` body, so those keep the "Cell N"
  // fallback and offer no rename gesture at all.
  const handleRenameCell = useCallback(
    (cellId: string, label: string) => {
      const cell = scannedCells.find((c) => c.id === cellId);
      if (cell === undefined || cell.kind !== "math") return;
      const bytes = new TextEncoder().encode(markdown);
      const body = new TextDecoder().decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
      const next = replaceCellBody(markdown, cellId, setCellLabelLine(body, label));
      if (next !== markdown) onCommit(next);
    },
    [markdown, onCommit, scannedCells]
  );

  // Positions live in the document's own `graph` front-matter key (C2
  // §3.7.1, ruling R135; ruling R212 item 3 as amended 2026-09-11 -- they
  // are schematic, meaningful, and travel with the file). The file is the
  // only store: there is no per-machine position state, so a workbook
  // opened on a second machine shows the arrangement its author drew.
  const layout = useMemo(() => readGraphLayout(markdown), [markdown]);
  const positions = useMemo(() => computeAutoLayoutPositions(model, layout), [model, layout]);

  /** The "Tidy" button: re-run the layered layout over every node and
   *  write the whole result through the §3.7.1 writer in **one** settle
   *  ({@link commitTidy}), not one write per card. Computed against the
   *  *empty* layout, so stored positions do not pin nodes in place --
   *  overwriting them is Tidy's whole job. */
  const handleTidy = useCallback(() => {
    const fresh = computeAutoLayoutPositions(model, EMPTY_GRAPH_LAYOUT);
    const names = new Map(model.nodes.filter((node) => node.kind === "definition").map((node) => [node.id, node.name]));
    const next = commitTidy(markdown, fresh, names);
    if (next !== markdown) onCommit(next);
  }, [model, markdown, onCommit]);
  const statuses = useMemo(
    () => computeNodeStatuses({ model, selectedWindows, windows, sessionDetails }),
    [model, selectedWindows, windows, sessionDetails]
  );

  // The source palette rail (ruling R160) -- scoped to the same selection
  // `statuses` already reads, so a channel greyed on the canvas and a
  // channel greyed in the palette agree for the same reason.
  const sourcePalette = useMemo(
    () => buildSourcePalette({ markdown, model, selectedWindows, sessionDetails, outputs }),
    [markdown, model, selectedWindows, sessionDetails, outputs]
  );

  // Drag-a-channel/constant/definition-to-add (decision 45a's fourth
  // gesture, R160): the drop target is the whole `<ReactFlow>` pane, not a
  // node -- `dropPaletteSource` picks the target cell and the new
  // definition's name (its own doc comment explains both judgment calls);
  // this handler only decodes the drag payload and then commits the two
  // this handler only decodes the drag payload and folds the resulting
  // markdown edit with a `commitDrag` at the drop point in one `onCommit`
  // call, so a fresh node appears roughly where it was dropped
  // rather than wherever auto-layout would otherwise place it. A document with no math
  // cell to add to is a no-op `dropPaletteSource` itself reports via a
  // `null` `newDefName` -- surfaced here exactly like `renameNotice`
  // (R153: a drop that does nothing must say so, not look like it worked).
  const { screenToFlowPosition } = reactFlow;
  const [paletteNotice, setPaletteNotice] = useState<string | null>(null);
  const handlePaletteDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(PALETTE_DRAG_MIME);
      if (raw === "") return;
      let source: PaletteDragSource;
      try {
        source = JSON.parse(raw) as PaletteDragSource;
      } catch {
        return; // not our own drag payload
      }
      const result = dropPaletteSource(markdown, model, source);
      if (result.newDefName === null) {
        setPaletteNotice(`No math cell to add "${source.name}" to yet -- add one first.`);
        return;
      }
      const { x, y } = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onCommit(commitDrag(result.markdown, { kind: "node", name: result.newDefName }, x, y));
    },
    [markdown, model, onCommit, screenToFlowPosition]
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
  const { setCenter } = reactFlow;
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
            unit: unitFor(graphNode, outputs, sessionDetails),
            onChart: handleChart,
            onRename: handleRename,
            onEditArg:
              graphNode.kind === "definition" && graphNode.cellId !== null
                ? (argIndex: number, newText: string) => handleEditArg(graphNode.cellId as string, graphNode.name, argIndex, newText)
                : undefined,
            highlighted: matchedIds.has(graphNode.id),
            displayName: graphNode.cellId !== null ? displayNames.get(graphNode.cellId) : undefined,
            colourCoded: colourCodeNodes,
            selected: graphNode.cellId !== null && graphNode.cellId === selectedCellId,
          },
        };
      });
  }, [model.nodes, positions, statuses, outputs, sessionDetails, handleChart, handleRename, handleEditArg, visibleIds, matchedIds, collapsedCellIdByMemberId, displayNames, colourCodeNodes, selectedCellId]);

  const frameFlowNodes = useMemo<Node<SubgraphFrameData, "subgraphFrame">[]>(
    () =>
      subgraphFrames.map((frame) => ({
        id: `frame:${frame.cellId}`,
        type: "subgraphFrame",
        position: { x: frame.x, y: frame.y },
        zIndex: -1,
        draggable: false,
        selectable: false,
        data: {
          frame,
          onCollapse: toggleCollapsed,
          displayName: displayNames.get(frame.cellId) ?? frame.cellId,
          renameable: scannedCells.find((c) => c.id === frame.cellId)?.kind === "math",
          onRename: handleRenameCell,
          onSelect: onSelectCell,
          selected: frame.cellId === selectedCellId,
        },
      })),
    [subgraphFrames, displayNames, scannedCells, handleRenameCell, onSelectCell, selectedCellId]
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
          data: { collapsed, onExpand: toggleCollapsed, displayName: displayNames.get(collapsed.cellId) ?? collapsed.cellId },
        };
      }),
    [collapsedSubgraphNodes, subgraphs, positions, displayNames]
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

  // The corner cluster and the keyboard reach the viewport through the same
  // four callbacks, so a key and its button can never mean different things
  // (R212 item 2's "Fit (F), Reset 100 % (0) … Keyboard: F / 0 / +/-").
  const { fitView, zoomIn, zoomOut, zoomTo } = reactFlow;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const handleFit = useCallback(() => void fitView({ duration: ZOOM_STEP_MS, padding: 0.15 }), [fitView]);
  // Reset is "100 %", not "fit": it restores scale 1 and leaves the pan
  // where it is, which is what a CAD user means by resetting zoom.
  const handleReset = useCallback(() => void zoomTo(1, { duration: ZOOM_STEP_MS }), [zoomTo]);
  const handleZoomIn = useCallback(() => void zoomIn({ duration: ZOOM_STEP_MS }), [zoomIn]);
  const handleZoomOut = useCallback(() => void zoomOut({ duration: ZOOM_STEP_MS }), [zoomOut]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const action = graphViewportAction({ key: event.key, fromTextField: isTextEntry(event.target) });
      if (action === null) return;
      // Only now, once the key is known to be ours: a bare `preventDefault`
      // on every key would eat typing and tabbing out of the canvas.
      event.preventDefault();
      if (action === "fit") handleFit();
      else if (action === "reset") handleReset();
      else if (action === "zoom-in") handleZoomIn();
      else handleZoomOut();
    },
    [handleFit, handleReset, handleZoomIn, handleZoomOut]
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
    <div className="idl-dense flex h-full w-full flex-col bg-bg">
      <div className="flex items-center gap-3 border-b border-rule px-3 py-2">
        <input
          type="text"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-[var(--radius-structural)] border border-rule bg-control px-2 py-1 text-label-2 text-fg"
        />
        <button type="button" onClick={handleTidy} title="Re-run the automatic layered layout (overwrites the arrangement on this machine)" className={CLUSTER_BUTTON_CLASS}>
          Tidy
        </button>
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
                {collapsedCellIds.has(sg.cellId) ? "▸" : "▾"} {displayNames.get(sg.cellId) ?? sg.cellId}
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
      {paletteNotice !== null && (
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-2 px-3 py-1 text-label-2 text-fg-dim">
          <span>{paletteNotice}</span>
          <button type="button" onClick={() => setPaletteNotice(null)} className="text-fg-faint hover:text-fg">
            Dismiss
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <SourcePaletteRail palette={sourcePalette} colourCoded={colourCodeNodes} />
        {/* Ruling R212 item 2: "the column is a viewport, not the world."
            `tabIndex` + `onKeyDown` rather than a `window` listener, so
            F/0/+/- only act while the canvas itself has focus — the
            Notebook has a cell list and a properties form on screen at the
            same time, and `f` is a letter in both. */}
        <div
          ref={canvasRef}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="idl-graph-canvas relative min-h-0 flex-1 outline-none"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePaletteDrop}
        >
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
            /* The infinite canvas (R212 item 2). Left-drag on empty space
               pans and space-drag pans from anywhere (xyflow's
               `panActivationKeyCode`, default Space); the wheel zooms about
               the pointer. No `translateExtent` and no `nodeExtent` is set
               at all — the world has no edge to hit, which is the whole
               point: "canvas space is cheap if we can reset the zoom
               easily" (Isaac, 2026-09-11), and Fit/Reset below are how it
               is reset. `minZoom`/`maxZoom` are widened well past xyflow's
               own 0.5–2 so a ~50-definition workbook (decision 42) can be
               seen whole and a single card can still be read close up. */
            panOnDrag
            panActivationKeyCode="Space"
            zoomOnScroll
            zoomOnPinch
            minZoom={GRAPH_MIN_ZOOM}
            maxZoom={GRAPH_MAX_ZOOM}
          >
            <Background />
            {/* The corner cluster (R212 item 2), bottom-right: Fit, Reset
                100 %, a zoom step pair, and the minimap — whose mask is the
                viewport rectangle drawn over the whole node extent. The
                stock `<Controls />` is gone: it carried a lock/interactivity
                button this canvas has no use for, and its buttons are not on
                the Notebook density scale. */}
            <Panel position="bottom-right" className="idl-dense flex items-end gap-[var(--nb-gap)]">
              <div className="flex flex-col gap-[var(--nb-pad)]">
                <button type="button" onClick={handleFit} title="Fit every node in view (F)" className={CLUSTER_BUTTON_CLASS}>
                  Fit
                </button>
                <button type="button" onClick={handleReset} title="Reset zoom to 100 % (0)" className={CLUSTER_BUTTON_CLASS}>
                  100%
                </button>
                <div className="flex gap-[var(--nb-pad)]">
                  <button type="button" onClick={handleZoomOut} title="Zoom out (-)" aria-label="Zoom out" className={CLUSTER_BUTTON_CLASS}>
                    −
                  </button>
                  <button type="button" onClick={handleZoomIn} title="Zoom in (+)" aria-label="Zoom in" className={CLUSTER_BUTTON_CLASS}>
                    +
                  </button>
                </div>
              </div>
              {/* `MiniMap` is itself an xyflow `Panel` (absolutely
                  positioned against the canvas). Forcing it `static` is
                  what lets it sit *inside* this cluster as an ordinary flex
                  item beside the buttons, instead of the two overlapping in
                  the same corner. */}
              <MiniMap pannable zoomable className="!static !m-0 !h-[120px] !w-[160px] rounded-[var(--radius-structural)] border border-rule" />
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
