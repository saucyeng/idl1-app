/**
 * The KiCad-subsheet visual for a math cell's subgraph (decision 43), over
 * `graphSubgraph.ts`'s already-computed `SubgraphInfo` — pure geometry and
 * port naming, no `@xyflow/react`, no rendering. `GraphCanvas.tsx` is the
 * only caller: an expanded cell gets a boundary box around its own member
 * nodes; a collapsed cell gets a single synthetic node showing the cell's
 * label with its named input/output ports on its edge, closing the way a
 * KiCad subsheet does, rather than reading as deletion (the gap this task
 * fixes — collapsing today merely drops the internal cards from the node
 * list).
 */

import type { GraphModel } from "./graphModel";
import type { SubgraphInfo } from "./graphSubgraph";

/** Approximates `NodeCard.tsx`'s rendered footprint for the boundary-box
 *  computation below. The card's actual DOM size is not known at layout
 *  time (`graphAutoLayout.ts` places nodes before anything renders) — this
 *  is the same kind of deliberate approximation that module's own
 *  `LAYER_DX`/`ROW_DY` spacing constants already are, just wide/tall enough
 *  that a real card never pokes outside the box it is estimated from. */
export const FRAME_NODE_WIDTH = 180;
export const FRAME_NODE_HEIGHT = 70;

/** Canvas-unit padding between a subgraph's member nodes and the boundary
 *  box drawn around them. */
export const FRAME_MARGIN = 32;

/** One expanded cell's on-canvas boundary box (top-left corner + size, in
 *  the same coordinate space as `computeAutoLayoutPositions`'s output). */
export interface SubgraphFrame {
  cellId: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes `subgraph`'s boundary box from `positions` — the smallest
 * rectangle (plus `FRAME_MARGIN`) covering every node this cell owns
 * (`internalIds` and `outputIds`; `inputIds` are never this cell's own
 * nodes, C2 §3.7.3). `null` when the cell owns no positioned node (an
 * empty math cell, or every member missing from `positions` — never drawn
 * rather than drawn at a made-up origin).
 */
export function subgraphFrameFor(subgraph: SubgraphInfo, positions: Record<string, [number, number]>): SubgraphFrame | null {
  const memberIds = [...subgraph.internalIds, ...subgraph.outputIds];
  const placed = memberIds.map((id) => positions[id]).filter((p): p is [number, number] => p !== undefined);
  if (placed.length === 0) return null;

  const left = Math.min(...placed.map(([x]) => x)) - FRAME_MARGIN;
  const top = Math.min(...placed.map(([, y]) => y)) - FRAME_MARGIN;
  const right = Math.max(...placed.map(([x]) => x)) + FRAME_NODE_WIDTH + FRAME_MARGIN;
  const bottom = Math.max(...placed.map(([, y]) => y)) + FRAME_NODE_HEIGHT + FRAME_MARGIN;

  return { cellId: subgraph.cellId, label: subgraph.label, x: left, y: top, width: right - left, height: bottom - top };
}

/** Computes every expanded cell's {@link SubgraphFrame} — `collapsedCellIds`
 *  filters out any cell currently collapsed (it gets {@link collapsedNodePorts}
 *  instead, not a boundary box). */
export function subgraphFramesFor(subgraphs: readonly SubgraphInfo[], positions: Record<string, [number, number]>, collapsedCellIds: ReadonlySet<string>): SubgraphFrame[] {
  return subgraphs
    .filter((sg) => !collapsedCellIds.has(sg.cellId))
    .map((sg) => subgraphFrameFor(sg, positions))
    .filter((f): f is SubgraphFrame => f !== null);
}

/** One named port on a collapsed subgraph node's edge. */
export interface SubgraphPort {
  /** The referenced node's own id (`def:name` or `channel:name`) — stable
   *  across renders, usable as a React `key` and a `Handle`'s `id`. */
  id: string;
  /** The display name shown on the port — the referenced node's own
   *  `label ?? name` (`NodeCard.tsx`'s same fallback), not the raw id. */
  name: string;
}

/** A collapsed cell's synthetic node: its label plus its input/output ports,
 *  named from `model.nodes` (a `SubgraphInfo`'s `inputIds`/`outputIds` are
 *  bare node ids, not display names). Ordered by `model.nodes`' own document
 *  order, matching every other list this lane derives from `GraphModel`. */
export interface CollapsedSubgraphNode {
  cellId: string;
  label: string | null;
  inputs: SubgraphPort[];
  outputs: SubgraphPort[];
}

/** Resolves `ids` to {@link SubgraphPort}s via `model.nodes`, in `model`'s
 *  own order (not `ids`' Set-derived order, which is insertion order of
 *  edges and not deterministic across a document's own layout). */
function namedPorts(ids: readonly string[], model: GraphModel): SubgraphPort[] {
  const idSet = new Set(ids);
  return model.nodes.filter((n) => idSet.has(n.id)).map((n) => ({ id: n.id, name: n.label ?? n.name }));
}

/** Computes {@link CollapsedSubgraphNode} for every currently-collapsed cell
 *  in `subgraphs`. */
export function collapsedSubgraphNodesFor(subgraphs: readonly SubgraphInfo[], model: GraphModel, collapsedCellIds: ReadonlySet<string>): CollapsedSubgraphNode[] {
  return subgraphs
    .filter((sg) => collapsedCellIds.has(sg.cellId))
    .map((sg) => ({
      cellId: sg.cellId,
      label: sg.label,
      inputs: namedPorts(sg.inputIds, model),
      outputs: namedPorts(sg.outputIds, model),
    }));
}

/** The canvas position for a collapsed cell's synthetic node: the centroid
 *  of its (now-hidden) own member nodes' positions, so collapsing a cell
 *  does not jump it somewhere else on the canvas. Falls back to `[0, 0]`
 *  when the cell owns no positioned node (mirrors {@link subgraphFrameFor}'s
 *  `null` case — there is nothing to average). */
export function collapsedNodePosition(subgraph: SubgraphInfo, positions: Record<string, [number, number]>): [number, number] {
  const memberIds = [...subgraph.internalIds, ...subgraph.outputIds];
  const placed = memberIds.map((id) => positions[id]).filter((p): p is [number, number] => p !== undefined);
  if (placed.length === 0) return [0, 0];
  const sumX = placed.reduce((acc, [x]) => acc + x, 0);
  const sumY = placed.reduce((acc, [, y]) => acc + y, 0);
  return [sumX / placed.length, sumY / placed.length];
}
