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
 * **Algorithm.** Each node's depth is the length of its longest dependency
 * chain — 0 for a node with no incoming edge, otherwise one more than the
 * deepest of its dependencies (an edge's `source`, C2 §3.7's wire
 * direction: source is referenced by target). Nodes are placed in columns
 * by depth, left to right; within a column, rows follow `model.nodes`'
 * own order (`graphModel.ts`'s document order) — the one ordering this
 * module has that is itself deterministic, so two runs over the same
 * `GraphModel` always agree.
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

/** Canvas-unit spacing between depth columns. */
const LAYER_DX = 220;
/** Canvas-unit spacing between rows within one depth column. */
const ROW_DY = 90;

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

  for (const [depth, ids] of byDepth) {
    ids.forEach((id, row) => {
      positions[id] = [depth * LAYER_DX, row * ROW_DY];
    });
  }

  for (const node of model.nodes) {
    const stored = node.kind === "definition" ? layout.nodes[node.name] : undefined;
    if (stored !== undefined) positions[node.id] = stored;
  }

  return positions;
}
