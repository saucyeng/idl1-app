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
