import { outputIsReadOnly, type EditorPlacement } from "./editorPlacement";

/** Where the maths graph's `GraphCanvas` element renders:
 *  - `"portal"` — the wide studio's maths column has published a slot node
 *    (`shell/graphSlot.ts`) and hosts the canvas.
 *  - `"in-page"` — the Notebook page's own content area, as a pane beside
 *    the cell list or as its single content element.
 *  - `"none"` — nowhere; the canvas is a desktop-only surface (decision
 *    77) and never takes over a narrow layout's read-only paper output. */
export type GraphHost = "portal" | "in-page" | "none";

/**
 * Decides {@link GraphHost} from slot-node presence and the page's own
 * measured `placement`.
 *
 * Slot presence wins unconditionally, for R109 ruling 2's reason applied
 * to the graph: inside the wide studio the Notebook page's own width is
 * the *output column's* width, which can measure as `"inline"` or
 * `"sheet"` even though the maths column is right there hosting the
 * canvas — so `placement` must never put a second `GraphCanvas` in the
 * page's content area beside the one the column already holds, nor
 * suppress the column's canvas because the page beside it measured narrow.
 *
 * With no slot, `"sheet"` (narrow) has no graph at all — decision 77's
 * desktop-only canvas, the same predicate `model/paperView.ts` asks for
 * the read-only paper output, so the two can never disagree about which
 * widths are narrow.
 *
 * @param hasSlotNode - Whether the wide studio's maths column has a slot
 *   node published right now.
 * @param placement - The page's own in-page placement, from
 *   `editorPlacement(widthPx)`.
 */
export function resolveGraphHost(hasSlotNode: boolean, placement: EditorPlacement): GraphHost {
  if (hasSlotNode) return "portal";
  return outputIsReadOnly(placement) ? "none" : "in-page";
}
