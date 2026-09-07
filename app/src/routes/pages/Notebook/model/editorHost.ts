import type { EditorPlacement } from "./editorPlacement";

/** Where the currently open cell's `EditorPanes` element actually renders:
 *  `"portal"` when the wide studio's properties column has published a
 *  slot node (`shell/editorSlot.ts`), or else the in-page placement the
 *  viewport width alone would give it (`editorPlacement.ts`). */
export type EditorHost = "portal" | EditorPlacement;

/**
 * Decides {@link EditorHost} from slot-node presence and the page's own
 * measured `placement` (R109 ruling 2). Slot presence wins unconditionally
 * — inside the wide studio, `Notebook/index.tsx`'s own width is the output
 * column's width, which can read as `"inline"` or `"sheet"` even though a
 * cell is selected and the properties column is right there hosting the
 * editor; `placement` must never re-inline or re-sheet an editor the
 * column already hosts. `placement` only decides the host when there is no
 * slot to publish into (every layout narrower than wide, or wide without
 * the studio's `ColumnFrame`).
 *
 * @param hasSlotNode - Whether the wide studio's properties column has a
 *   slot node published right now.
 * @param placement - The in-page placement `editorPlacement(widthPx)` would
 *   give the editor if there were no slot.
 */
export function resolveEditorHost(hasSlotNode: boolean, placement: EditorPlacement): EditorHost {
  return hasSlotNode ? "portal" : placement;
}
