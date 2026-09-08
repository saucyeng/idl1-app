/**
 * Subgraph collapse/expand and canvas search (decisions 42/43), over
 * `graphModel.ts`'s already-built `GraphModel` — pure, no `@xyflow/react`,
 * no rendering. A math cell's subgraph boundary is C2 §3.7.3's own
 * definition, computed here directly from `GraphModel.edges`' cell
 * membership rather than re-deriving it from the document a second time.
 *
 * **Inputs/outputs, as this module can see them.** §3.7.3 also counts a
 * `js` cell's chart binding and a prose `${…}` span as making a definition
 * an "output" — `graphModel.ts` does not track either (Task 5's own
 * scope), so `subgraphsFor` only sees the dependency-edge half of §3.7.3's
 * definition: a definition referenced by another cell's definition. A
 * definition charted only by a `js` cell, or interpolated only in prose,
 * is therefore classified `"internal"` here and hides when its cell
 * collapses even though §3.7.3 says it should count as an output and stay
 * visible — a real gap, flagged in the lane's report, not resolved here.
 */

import type { GraphModel } from "./graphModel";

/** One math cell's subgraph boundary (§3.7.3), as this module computes it
 *  — see the module doc comment for its known gap against the full
 *  contract definition of "output". */
export interface SubgraphInfo {
  /** The cell's `hex8` id — matches `GraphModel.groups[].id`. */
  cellId: string;
  label: string | null;
  /** Node ids referenced by this cell's definitions but not defined in it
   *  — another cell's definition, or a `"channel"` root. */
  inputIds: string[];
  /** This cell's own definition node ids that some other cell's
   *  definition references. */
  outputIds: string[];
  /** This cell's own definition node ids that are neither an input nor
   *  referenced from outside — decision 39's "intermediate datasets never
   *  appear unless the user names them", read at cell scope; these hide
   *  when the cell collapses. */
  internalIds: string[];
}

/** Computes every math cell's {@link SubgraphInfo} from `model`. */
export function subgraphsFor(model: GraphModel): SubgraphInfo[] {
  const cellIdByNodeId = new Map(model.nodes.filter((n) => n.cellId !== null).map((n) => [n.id, n.cellId as string]));

  const outputsByCell = new Map<string, Set<string>>();
  const inputsByCell = new Map<string, Set<string>>();

  const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key);
    if (set) set.add(value);
    else map.set(key, new Set([value]));
  };

  for (const edge of model.edges) {
    const sourceCellId = cellIdByNodeId.get(edge.source) ?? null; // null for a "channel" root
    const targetCellId = cellIdByNodeId.get(edge.target) ?? null; // always set — only a definition is ever an edge target

    if (targetCellId === null || sourceCellId === targetCellId) continue; // same-cell edge crosses no boundary

    addTo(inputsByCell, targetCellId, edge.source);
    if (sourceCellId !== null) addTo(outputsByCell, sourceCellId, edge.source);
  }

  return model.groups.map((group) => {
    const outputs = outputsByCell.get(group.id) ?? new Set<string>();
    const inputs = inputsByCell.get(group.id) ?? new Set<string>();
    return {
      cellId: group.id,
      label: group.label,
      inputIds: [...inputs],
      outputIds: [...outputs],
      internalIds: group.nodeIds.filter((id) => !outputs.has(id)),
    };
  });
}

/**
 * The node ids that should render given `collapsedCellIds` — every node
 * except a collapsed cell's `internalIds` (decision 39, read through
 * {@link SubgraphInfo}). A `"channel"` root and every input/output node
 * always renders, regardless of collapse state — collapsing a cell hides
 * only what is wholly internal to it.
 */
export function visibleNodeIds(model: GraphModel, subgraphs: readonly SubgraphInfo[], collapsedCellIds: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>();
  for (const sg of subgraphs) {
    if (!collapsedCellIds.has(sg.cellId)) continue;
    for (const id of sg.internalIds) hidden.add(id);
  }
  return new Set(model.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id));
}

/**
 * Canvas search (decision 42): every node id whose display name (`# label:`,
 * falling back to the identifier — the same precedence `NodeCard.tsx`
 * renders) contains `query`, case-insensitively. `[]` for a blank query —
 * search finds nothing until the user types something, never "everything".
 */
export function searchNodeIds(model: GraphModel, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return model.nodes.filter((n) => (n.label ?? n.name).toLowerCase().includes(q)).map((n) => n.id);
}
