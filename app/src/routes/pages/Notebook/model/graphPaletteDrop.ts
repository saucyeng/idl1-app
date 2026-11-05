/**
 * Turns a source-palette drag (`sourcePalette.ts`'s {@link PaletteRow})
 * into the one document edit that puts it on the canvas. Pure — no
 * `@xyflow/react`, so `GraphCanvas.tsx`'s drop handler stays a thin call.
 *
 * **A channel is placed, not wrapped** (Isaac, 2026-11-04). A dropped
 * session channel becomes its own source node through `graph.channels`
 * (C2 §3.7.1) — no math cell needed, which is what lets a new workbook be
 * started on the canvas. The author then charts it or builds math on it.
 *
 * **A definition or constant becomes a new definition** in the last math
 * cell in document order (`GraphModel.groups`' order) — R160's
 * `addNodeFromChannel`/`addNodeFromConstant` path. With no math cell at all
 * a constant drop creates one (id `newCellId`); a definition can't be
 * dropped onto a document with no math cell, since it lives in one.
 *
 * **Name — reuse the source's own name, sanitised, deduplicated against
 * existing definitions only.** An invalid character (a constant name may
 * contain spaces) becomes `_`.
 */

import { appendMathCell, dedupeName, sanitiseIdentifier } from "./canvasBuild";
import { addNodeFromChannel, addNodeFromConstant } from "./graphEdits";
import type { GraphModel } from "./graphModel";
import type { PaletteRow } from "./sourcePalette";

/** Everything a drop needs to know about the row that was dragged —
 *  `PaletteRow`'s discriminant and name, nothing else. This is also the
 *  shape a native HTML5 drag's `dataTransfer` payload carries
 *  (`SourcePaletteRail.tsx`). */
export type PaletteDragSource = Pick<PaletteRow, "kind" | "name">;

/** What the drop put on the canvas, for the caller to position at the drop
 *  point: a placed channel (`graph.channels`) or a new definition
 *  (`graph.nodes`). `null` when the drop did nothing. */
export type DropPlaced = { kind: "channel"; name: string } | { kind: "node"; name: string } | null;

/** {@link dropPaletteSource}'s result. */
export interface DropResult {
  markdown: string;
  placed: DropPlaced;
}

/**
 * Applies a dropped palette row (see the module doc comment). The caller
 * writes the drop position for `placed` (`dragCommit.ts`'s `commitDrag`);
 * for a channel that write *is* the placement, so a channel drop returns
 * `markdown` unchanged here.
 */
export function dropPaletteSource(markdown: string, model: GraphModel, row: PaletteDragSource, newCellId: string): DropResult {
  if (row.kind === "channel") return { markdown, placed: { kind: "channel", name: row.name } };

  const existingDefNames = new Set(model.nodes.filter((n) => n.kind === "definition").map((n) => n.name));
  const newDefName = dedupeName(sanitiseIdentifier(row.name), existingDefNames);
  const targetCellId = model.groups.length > 0 ? model.groups[model.groups.length - 1].id : undefined;

  if (targetCellId === undefined) {
    if (row.kind !== "constant") return { markdown, placed: null };
    return { markdown: appendMathCell(markdown, newCellId, `${newDefName} = ${row.name}\n`), placed: { kind: "node", name: newDefName } };
  }

  const nextMarkdown =
    row.kind === "constant" ? addNodeFromConstant(markdown, targetCellId, row.name, newDefName) : addNodeFromChannel(markdown, targetCellId, row.name, newDefName);
  return { markdown: nextMarkdown, placed: { kind: "node", name: newDefName } };
}
