/**
 * Deterministic layered auto-layout for the maths graph (C2 §3.7.1's
 * "the view's own fallback algorithm, out of scope for this contract") —
 * placement for any node the file doesn't already store a position for.
 * Pure and computes no number that feeds evaluation: a canvas position is
 * never an input to a value (C2 §3.7.1's advisory guarantee), so a bug
 * here can only misplace a node on screen.
 *
 * **Only definition nodes can have a stored position** (C2 §3.7.1: `graph.
 * nodes` is keyed by math-cell definition *name*; there is no stored-
 * position home for a `"channel"` source node at all) — so every
 * `"channel"` node is always auto-placed, and a `"definition"` node is
 * auto-placed exactly when {@link GraphLayout.nodes} has no entry for its
 * name.
 *
 * **Algorithm** (ruling R212 item 3: "simple longest-path layering plus
 * barycentre ordering, no new dependency").
 *
 * *Layering.* Each node's depth is the length of its longest dependency
 * chain — 0 for a node with no incoming edge, otherwise one more than the
 * deepest of its dependencies (an edge's `source`, C2 §3.7's wire
 * direction: source is referenced by target). Nodes are placed in columns
 * by depth, left to right. Raw session channels have no dependency of their
 * own, so they land in column 0 and derived datasets fan out to the right —
 * R212's "sources left, derived middle" falls out of the layering rather
 * than being a third rule. (Charts are not graph nodes: a chart is a cell,
 * not a definition, so "charts right" has nothing to place here.)
 *
 * *Ordering within a column.* One forward sweep of the barycentre
 * heuristic: layer 0 keeps `model.nodes`' own document order, and each
 * later layer sorts its nodes by the mean row of their already-placed
 * dependencies, so an edge runs roughly straight across instead of crossing
 * the whole column. A node whose dependencies are all in the same layer (or
 * has none) keeps its document-order position as its barycentre, and ties
 * break on document order — so two runs over the same `GraphModel` always
 * agree, which a randomised or iterated crossing-minimiser would not.
 *
 * **Cycles never hang this module.** `resolve.rs` is cycle-guarded and a
 * real evaluation rejects a dependency cycle, but this is a rendering
 * fallback and must degrade rather than recurse forever if it is ever
 * handed one anyway (e.g. mid-edit, before the next evaluation catches it)
 * — a node revisited while its own depth is still being computed is
 * treated as depth 0 for that edge, not recursed into again.
 */

import type { GraphLayout } from "./graphLayout";
import type { GraphModel } from "./graphModel";

/** A node card's nominal width in canvas units — `NodeCard.tsx`'s own
 *  `min-w-[160px]`. A card with a long name is wider; the gap below is a
 *  minimum, not a guarantee. */
const NODE_WIDTH = 160;
/** A node card's nominal height in canvas units: name row, unit row, call
 *  row and the chart picker, at the `--nb-*` density scale. */
const NODE_HEIGHT = 64;
/** Empty canvas between two depth columns (R212 item 3: "96 px layer gaps"). */
const LAYER_GAP = 96;
/** Empty canvas between two cards in the same column (R212 item 3: "32 px
 *  node gaps"). */
const NODE_GAP = 32;

/** Canvas-unit pitch between depth columns — a card plus the layer gap.
 *  Exported so a test asserts against the same number the layout uses,
 *  rather than a literal that rots when R212's gaps are retuned. */
export const GRAPH_LAYER_DX = NODE_WIDTH + LAYER_GAP;
/** Canvas-unit pitch between rows within one depth column. */
export const GRAPH_ROW_DY = NODE_HEIGHT + NODE_GAP;

/** Computes each node's dependency depth (see the module doc comment),
 *  keyed by {@link GraphModel.nodes}' own `id`. */
function computeDepths(model: GraphModel): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const node of model.nodes) incoming.set(node.id, []);
  for (const edge of model.edges) {
    incoming.get(edge.target)?.push(edge.source);
  }

  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  function depthOf(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard — see module doc comment

    visiting.add(id);
    const deps = incoming.get(id) ?? [];
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depthOf));
    visiting.delete(id);

    depths.set(id, depth);
    return depth;
  }

  for (const node of model.nodes) depthOf(node.id);
  return depths;
}

/**
 * Computes a canvas position for every node in `model`: `layout`'s stored
 * position for a `"definition"` node that has one, and a deterministic
 * layered placement (see the module doc comment) for every other node —
 * including every `"channel"` node, which never has a stored position at
 * all (C2 §3.7.1). Keyed by {@link GraphModel.nodes}' own `id`, so the
 * result is ready to hand to the canvas with no further lookup.
 */
export function computeAutoLayoutPositions(model: GraphModel, layout: GraphLayout): Record<string, [number, number]> {
  const depths = computeDepths(model);
  const positions: Record<string, [number, number]> = {};

  const byDepth = new Map<number, string[]>();
  for (const node of model.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const column = byDepth.get(depth);
    if (column) column.push(node.id);
    else byDepth.set(depth, [node.id]);
  }

  // Each node's dependencies, for the barycentre sweep below.
  const incoming = new Map<string, string[]>();
  for (const node of model.nodes) incoming.set(node.id, []);
  for (const edge of model.edges) incoming.get(edge.target)?.push(edge.source);

  // One forward sweep, shallowest column first, so every node's
  // dependencies already have a row by the time it is placed.
  const rowOf = new Map<string, number>();
  const orderedDepths = [...byDepth.keys()].sort((a, b) => a - b);
  for (const depth of orderedDepths) {
    const ids = byDepth.get(depth) ?? [];
    const documentOrder = new Map(ids.map((id, index) => [id, index]));
    const barycentre = (id: string): number => {
      const placed = (incoming.get(id) ?? []).map((source) => rowOf.get(source)).filter((row): row is number => row !== undefined);
      // No placed dependency (a source node, or a same-column edge): keep
      // where document order put it rather than collapsing to row 0.
      return placed.length === 0 ? (documentOrder.get(id) ?? 0) : placed.reduce((sum, row) => sum + row, 0) / placed.length;
    };
    const sorted = [...ids].sort((a, b) => {
      const delta = barycentre(a) - barycentre(b);
      return delta !== 0 ? delta : (documentOrder.get(a) ?? 0) - (documentOrder.get(b) ?? 0);
    });
    sorted.forEach((id, row) => {
      rowOf.set(id, row);
      positions[id] = [depth * GRAPH_LAYER_DX, row * GRAPH_ROW_DY];
    });
  }

  for (const node of model.nodes) {
    const stored = node.kind === "definition" ? layout.nodes[node.name] : undefined;
    if (stored !== undefined) positions[node.id] = stored;
  }

  return positions;
}
