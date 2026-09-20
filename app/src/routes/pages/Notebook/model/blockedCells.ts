/**
 * Which nodes and cells are **blocked** by an upstream failure (ruling
 * R250). Isaac, 2026-09-20: "if one of the steps has an error, which
 * branches won't calculate".
 *
 * Pure, over the dependency graph `model/graphModel.ts` already builds from
 * the document. Computes no number, reads no state, touches no IPC.
 *
 * **Blocked is not grey.** `model/graphStatus.ts` has a `"grey"` status and
 * it means something else: decision 44's *session gap* — a channel present
 * on one selected session and missing from another, which is not a mistake
 * and has no upstream cause. `blocked` means an upstream step **failed**,
 * which has a cause, a name and a place to go and fix it. The two are drawn
 * differently for that reason (the R250 spec's §3.2: a blocked subgraph's
 * edges are dashed, a grey one's are not), and this module deliberately
 * does not fold one into the other.
 *
 * **Nearest ancestor wins.** A node three steps downstream of a failure is
 * blocked by the *nearest* failing ancestor, not by every failure upstream
 * of it and not by the root of the chain. One cause, named once: a reader
 * following "blocked by" one hop at a time walks back to the root, whereas
 * a list of every ancestor is a list to read rather than a place to go.
 * Breadth-first from every failing node at once gives exactly that, since
 * the first walk to reach a node is the one that started nearest to it.
 *
 * **Ties are broken by node id, not by argument order.** Two failures the
 * same distance from one descendant are equally good answers, but a reader
 * watching a document evaluate must not see the blame move between them
 * because a caller happened to build its `failing` array in a different
 * order. The walk sorts its starting frontier once, so the same graph in
 * the same state always names the same cause.
 */
import type { CellOutput } from "../../../../ipc/workbook";
import type { GraphEdge, GraphModel, GraphNode } from "./graphModel";
import type { NodeStatusResult } from "./graphStatus";

/** Why a node or cell is blocked — the one line the frame and the map's
 *  hover card both render (the R250 spec's §2, §3.3). */
export interface BlockedBy {
  /** The failing cell's id, for the frame's "Go to Cell 3" affordance.
   *  `null` when the failing node belongs to no cell (a source node that
   *  resolves nowhere), in which case there is nothing to navigate to. */
  cellId: string | null;
  /** What the reader is told to go to — `"Cell 3"`, or a display name when
   *  the caller has one. Supplied by the caller: naming a cell is
   *  `graph/cellDisplayName.ts`'s job, not this module's. */
  cellLabel: string;
  /** The failing node's own error text, already trimmed to one line by the
   *  caller. Shown after the label: "blocked by Cell 3: unknown channel". */
  message: string;
}

/** One failing node, as the caller knows it. */
export interface FailingNode {
  /** The failing {@link GraphNode.id}. */
  nodeId: string;
  /** {@link BlockedBy.cellId} for everything this node blocks. */
  cellId: string | null;
  /** {@link BlockedBy.cellLabel} for everything this node blocks. */
  cellLabel: string;
  /** {@link BlockedBy.message} for everything this node blocks. */
  message: string;
}

/**
 * The failing nodes of a graph, from the statuses
 * `model/graphStatus.ts` already computes plus the outputs that carry the
 * messages — the input {@link blockedNodes} takes.
 *
 * Only `"error"` counts. Decision 44's `"grey"` is not a failure (the
 * module doc comment), and `"pending"` is a node that has not run yet,
 * which blocks nothing: everything downstream of it is equally pending, and
 * calling that "blocked" would dim a whole document every time a workbook
 * opens.
 *
 * @param model The graph.
 * @param statuses `computeNodeStatuses`' answer, keyed by node id.
 * @param outputs The primary window's `CellOutput`s, keyed by cell id —
 *   where a definition's and a chart's error text lives.
 * @param cellLabel Names a cell for the reader (`"Cell 3"`, or a display
 *   name). Passed in because naming a cell is `graph/cellDisplayName.ts`'s
 *   job, not this module's.
 */
export function failingNodes(
  model: GraphModel,
  statuses: ReadonlyMap<string, NodeStatusResult>,
  outputs: ReadonlyMap<string, CellOutput>,
  cellLabel: (cellId: string) => string
): FailingNode[] {
  const failing: FailingNode[] = [];
  for (const node of model.nodes) {
    if (statuses.get(node.id)?.status !== "error") continue;
    failing.push({
      nodeId: node.id,
      cellId: node.cellId,
      cellLabel: node.cellId === null ? node.name : cellLabel(node.cellId),
      message: nodeErrorMessage(node, outputs),
    });
  }
  return failing;
}

/**
 * The one-line reason a failing node failed.
 *
 * A `"channel"` node has no output of its own — it *is* the unresolved
 * name, which is the whole message. A `"definition"` node's own
 * `CellDefResult.error` is the most specific text available; when the
 * definition is missing from `defs` entirely (`CellDefResult`'s doc
 * comment: a structural problem keeps it out) the cell's own `errors` say
 * why. A `"chart"` node declares no definition, so its whole result is the
 * cell's `errors`.
 *
 * The fallback is deliberately vague rather than absent: a blocked cell
 * saying "blocked by Cell 3" with no reason is still a place to go, and an
 * empty string after a colon is not.
 */
function nodeErrorMessage(node: GraphNode, outputs: ReadonlyMap<string, CellOutput>): string {
  if (node.kind === "channel") return `unknown channel "${node.name}"`;

  const output = node.cellId === null ? undefined : outputs.get(node.cellId);
  if (node.kind === "definition") {
    const def = output?.defs.find((d) => d.name === node.name);
    if (def?.error != null) return def.error.message;
  }
  if (output !== undefined && output.errors.length > 0) return output.errors.map((e) => e.message).join("; ");

  return "evaluation failed";
}

/** Everything {@link blockedNodes} needs. */
export interface BlockedNodesInput {
  /** The graph's nodes — read only for their `id` and `cellId`. */
  nodes: readonly GraphNode[];
  /** The graph's edges, source feeding target. */
  edges: readonly GraphEdge[];
  /** Every node currently in a real error state, in any order. A node
   *  listed here is never itself reported as blocked: a failure is its own
   *  cause. */
  failing: readonly FailingNode[];
}

/**
 * Every node downstream of a failure, mapped to the nearest failure that
 * blocks it.
 *
 * Breadth-first over `edges` from all failing nodes at once, so the first
 * visit to a node is from the nearest failing ancestor (see the module doc
 * comment). Terminates on the visited set, so a cycle in the graph — which
 * `graphModel.ts` does not forbid — walks each node once and stops.
 *
 * A failing node is never in the result, even when another failure feeds
 * it: it reports its own error, which is the more specific answer and the
 * one with something to fix.
 */
export function blockedNodes(input: BlockedNodesInput): Map<string, BlockedBy> {
  const forward = new Map<string, string[]>();
  for (const edge of input.edges) {
    const list = forward.get(edge.source);
    if (list) list.push(edge.target);
    else forward.set(edge.source, [edge.target]);
  }

  const failingIds = new Set(input.failing.map((f) => f.nodeId));
  const blocked = new Map<string, BlockedBy>();

  // One shared frontier over every failure at once — the property that
  // makes the first visit the nearest cause. A per-failure walk would give
  // whichever failure happened to be listed first. Sorted by node id so a
  // tie at equal distance always resolves the same way (see the module doc
  // comment); the sort is over the failures only, not the whole graph.
  const startOrder = [...input.failing].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  let frontier: { id: string; cause: FailingNode }[] = startOrder.flatMap((cause) =>
    (forward.get(cause.nodeId) ?? []).map((id) => ({ id, cause }))
  );

  while (frontier.length > 0) {
    const next: { id: string; cause: FailingNode }[] = [];
    for (const { id, cause } of frontier) {
      if (failingIds.has(id) || blocked.has(id)) continue;
      blocked.set(id, { cellId: cause.cellId, cellLabel: cause.cellLabel, message: cause.message });
      for (const target of forward.get(id) ?? []) next.push({ id: target, cause });
    }
    frontier = next;
  }

  return blocked;
}

/**
 * Which **cells** are blocked, from {@link blockedNodes}' per-node answer.
 *
 * A cell is blocked when every node it owns is blocked or failing **and at
 * least one is blocked**. Both halves matter:
 *
 * - "every node" — a math cell declaring two definitions, one of which is
 *   perfectly fine, still has something to show, so dimming the whole cell
 *   would hide a working result behind someone else's failure.
 * - "at least one blocked" — a cell whose nodes are *all* failing is in
 *   `error`, not `blocked`; it is the cause, not a casualty.
 *
 * A cell owning no nodes at all (prose-only, or a cell the graph could not
 * scan) is never blocked: there is no dependency to be blocked by.
 *
 * The reported cause is the one from that cell's first blocked node in
 * `nodes` order, which is document order — the same ordering every other
 * per-cell reader in this page uses.
 */
export function blockedCells(nodes: readonly GraphNode[], blocked: ReadonlyMap<string, BlockedBy>, failingNodeIds: ReadonlySet<string>): Map<string, BlockedBy> {
  const byCell = new Map<string, { blockedCount: number; total: number; accountedFor: number; cause: BlockedBy | null }>();

  for (const node of nodes) {
    if (node.cellId === null) continue;
    const entry = byCell.get(node.cellId) ?? { blockedCount: 0, total: 0, accountedFor: 0, cause: null };
    entry.total += 1;
    const cause = blocked.get(node.id);
    if (cause !== undefined) {
      entry.blockedCount += 1;
      entry.accountedFor += 1;
      entry.cause ??= cause;
    } else if (failingNodeIds.has(node.id)) {
      entry.accountedFor += 1;
    }
    byCell.set(node.cellId, entry);
  }

  const result = new Map<string, BlockedBy>();
  for (const [cellId, entry] of byCell) {
    if (entry.blockedCount > 0 && entry.accountedFor === entry.total && entry.cause !== null) {
      result.set(cellId, entry.cause);
    }
  }

  return result;
}

/**
 * Every edge that runs inside or into the blocked subgraph — the edges the
 * map dashes (the R250 spec's §3.1), keyed by {@link GraphEdge.id}.
 *
 * An edge qualifies when its **target** is blocked. That includes the edges
 * leaving the failing node itself, which is what makes the dashing start at
 * the failure and run down rather than starting one hop late.
 */
export function blockedEdgeIds(edges: readonly GraphEdge[], blocked: ReadonlyMap<string, BlockedBy>): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (blocked.has(edge.target)) ids.add(edge.id);
  }
  return ids;
}
