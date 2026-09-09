/**
 * Turns a source-palette drag (`sourcePalette.ts`'s {@link PaletteRow})
 * into the one document edit that mints a node from it (R160: "drag onto
 * the canvas mints the node, through `graphEdits.ts`'s already-tested
 * `addNodeFromChannel` — do not write a second path"). Pure — no
 * `@xyflow/react`, so `GraphCanvas.tsx`'s drop handler stays a thin call
 * into this module rather than growing its own naming/target-cell logic
 * inline.
 *
 * **Target cell — a judgment call, not a ruling.** R160 says where the
 * three source kinds come from; it does not say which math cell a dropped
 * source's `def_line` lands in, and the canvas overlays every math cell's
 * nodes on one surface (§3.7.3), so there is no single "the" cell to pick
 * from geometry alone without hit-testing each subgraph frame — out of
 * this task's scope. This module targets the **last math cell in document
 * order** (`GraphModel.groups`'s own order, itself `scanCells`' document
 * order) — simple, deterministic, and consistent with `addNodeFromChannel`
 * itself always appending to a body's end. A document with no math cell at
 * all is a no-op ({@link DropResult.newDefName} is `null`) — creating one
 * is a different gesture this task doesn't add.
 *
 * **Name — reuse the source's own name, sanitised, deduplicated against
 * existing definitions only.** A dropped channel/constant keeps its own
 * name as the new definition's identifier wherever that name is already a
 * valid C2 §3.1 identifier (the common case — `IMU1_AccelZ` needs no
 * change) so the card on the canvas reads exactly like the source it came
 * from; an invalid character (a constant name may contain spaces, e.g.
 * `constants["rider mass"]`) becomes `_`. Collision is checked only
 * against existing **definition** names — colliding with a `"channel"`
 * node of the same name is the ordinary, intended shape of a channel drag
 * (`accel_z = [accel_z]` relabels a raw channel as a graph node), not a
 * conflict to avoid.
 */

import { addNodeFromChannel, addNodeFromConstant } from "./graphEdits";
import type { GraphModel } from "./graphModel";
import type { PaletteRow } from "./sourcePalette";

/** Everything a drop needs to know about the row that was dragged —
 *  `PaletteRow`'s discriminant and name, nothing else. Narrower than
 *  `PaletteRow` on purpose: this is also the shape a native HTML5 drag's
 *  `dataTransfer` payload carries (`SourcePaletteRail.tsx`), and a
 *  drag-start handler shouldn't have to fabricate a row's `rateHz`/`value`/
 *  `cellId` fields just to satisfy a type this module never reads. */
export type PaletteDragSource = Pick<PaletteRow, "kind" | "name">;

/** Not a valid C2 §3.1 identifier leading/continuing character. */
const INVALID_IDENTIFIER_CHAR_RE = /[^A-Za-z0-9_]/g;

/** Sanitises `name` into a valid C2 §3.1 identifier: any non-`[A-Za-z0-9_]`
 *  character becomes `_`, and a leading digit gets a `_` prefix (an
 *  identifier's first character must be a letter or `_`). Already-valid
 *  input (the common case) round-trips unchanged. */
function sanitiseIdentifier(name: string): string {
  const replaced = name.replace(INVALID_IDENTIFIER_CHAR_RE, "_");
  return /^[0-9]/.test(replaced) ? `_${replaced}` : replaced;
}

/** `base`, or `base` with the smallest `_2`, `_3`, … suffix not already in
 *  `taken` — never `base` itself when `taken` already holds it. */
function dedupe(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** {@link dropPaletteSource}'s result. */
export interface DropResult {
  markdown: string;
  /** The new definition's identifier, or `null` when the drop was a no-op
   *  (no math cell exists to add to — see the module doc comment). */
  newDefName: string | null;
}

/**
 * Mints a node from a dropped palette row (see the module doc comment for
 * the target-cell and naming rules). `row.kind === "definition"` reuses
 * the bracket-reference path exactly as `"channel"` does (C2 §3.1: both
 * are bracket references, only a constant is bare).
 */
export function dropPaletteSource(markdown: string, model: GraphModel, row: PaletteDragSource): DropResult {
  const targetCellId = model.groups.length > 0 ? model.groups[model.groups.length - 1].id : undefined;
  if (targetCellId === undefined) return { markdown, newDefName: null };

  const existingDefNames = new Set(model.nodes.filter((n) => n.kind === "definition").map((n) => n.name));
  const newDefName = dedupe(sanitiseIdentifier(row.name), existingDefNames);

  const nextMarkdown =
    row.kind === "constant" ? addNodeFromConstant(markdown, targetCellId, row.name, newDefName) : addNodeFromChannel(markdown, targetCellId, row.name, newDefName);

  return { markdown: nextMarkdown, newDefName };
}
