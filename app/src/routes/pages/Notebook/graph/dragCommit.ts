/**
 * Commits a settled drag on the maths graph canvas to the document's
 * `graph` front-matter key (C2 §3.7.1) — the only piece of `GraphCanvas.tsx`
 * this lane unit-tests (rendering is not unit-tested, CLAUDE.md §4); the
 * canvas itself only needs to call {@link commitDrag} once per drag-stop
 * and hand the result to the existing save flow. Pure: no React, no
 * `@xyflow/react`, no IPC — a drag is local while it moves (no IPC on the
 * interaction path) and this module only runs on settle.
 */

import { readGraphLayout, writeGraphLayout } from "../model/graphLayout";

/** What was dragged — a `"definition"` node (keyed by name, `graph.nodes`)
 *  or a math cell's subgraph frame (keyed by `hex8` id, `graph.cells`). A
 *  `"channel"` node has no stored-position home at all (§3.7.1: `graph.
 *  nodes` is definition-name keyed only) and is deliberately not a value
 *  this type can express — `GraphCanvas.tsx` never calls {@link commitDrag}
 *  for one; its drag stays purely local and re-lays-out on the next
 *  render, exactly like any other unstored node. */
export type DragTarget = { kind: "node"; name: string } | { kind: "group"; cellId: string };

/**
 * Writes `target`'s new position into the document's `graph` key, returning
 * the updated markdown. `x`/`y` are rounded to the nearest integer before
 * writing — §3.7.1's EBNF `position_entry` is integer-only; writing a raw
 * canvas float would round-trip as a decimal point `ENTRY_LINE_RE` doesn't
 * match, malforming the whole key on the very next read (§3.7.1: malformed
 * ⇒ absent). Every other stored position, and every other front-matter
 * byte, is untouched (`writeGraphLayout`'s own guarantee).
 */
export function commitDrag(markdown: string, target: DragTarget, x: number, y: number): string {
  const layout = readGraphLayout(markdown);
  const position: [number, number] = [Math.round(x), Math.round(y)];

  const next =
    target.kind === "node"
      ? { nodes: { ...layout.nodes, [target.name]: position }, cells: layout.cells }
      : { nodes: layout.nodes, cells: { ...layout.cells, [target.cellId]: position } };

  return writeGraphLayout(markdown, next);
}

/**
 * Writes a whole freshly computed auto-layout into the document's `graph`
 * key in **one** settle — the "Tidy" button's commit (ruling R212 item 3,
 * as amended 2026-09-11: positions are schematic, they live in the file and
 * travel with it). One `writeGraphLayout` call, not one per node, because
 * §3.7.1 specifies the writer as a byte-range replacement of the whole
 * `graph:` block; running it once per card would rewrite that block N times
 * for a single gesture.
 *
 * Existing entries are **merged over, never dropped**: an entry naming a
 * definition this model no longer has is an orphan, and §3.7.1 requires it
 * be "preserved on write, never pruned" so that a commented-out definition
 * keeps its position when it is restored. Tidy therefore overwrites every
 * position it computes and leaves every position it cannot.
 *
 * @param markdown The document to write into.
 * @param positions `graphAutoLayout.ts`'s `computeAutoLayoutPositions` result, keyed by node id.
 * @param nodeNameById Definition node id → its §3.1 `identifier`. A node absent from this map (a `"channel"` node) has no stored-position home (§3.7.1) and is skipped.
 */
export function commitTidy(markdown: string, positions: Record<string, [number, number]>, nodeNameById: Map<string, string>): string {
  const layout = readGraphLayout(markdown);
  const nodes = { ...layout.nodes };

  for (const [id, [x, y]] of Object.entries(positions)) {
    const name = nodeNameById.get(id);
    if (name !== undefined) nodes[name] = [Math.round(x), Math.round(y)];
  }

  // `cells` is left exactly as it was: a subgraph frame's box is derived
  // from its members' positions every render (`graphSubgraphFrame.ts`), so
  // Tidy has no frame position of its own to write, and clearing the
  // sub-key would prune entries §3.7.1 says to preserve.
  return writeGraphLayout(markdown, { nodes, cells: layout.cells });
}
