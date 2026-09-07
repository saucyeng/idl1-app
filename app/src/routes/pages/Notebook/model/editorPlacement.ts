/**
 * Where the Notebook's cell editor lives at a given viewport width
 * (UI-DIRECTION decision 29): IDE panes beside the output on wide, an
 * inline editor under the selected cell on medium, and a `Sheet` on narrow
 * where the output is read-only paper. Shares the shell's own 600/1200
 * breakpoints (`shell/layout.ts`'s `resolveLayout`) rather than restating
 * them, so the two can never drift apart (this module's own test asserts
 * that directly).
 */
import { resolveLayout } from "../../../../shell/layout";

/** The three places a cell's editor can render. */
export type EditorPlacement = "panes" | "inline" | "sheet";

/**
 * Resolves `widthPx` to an {@link EditorPlacement} via the shell's own
 * `resolveLayout` — wide gets `"panes"`, medium `"inline"`, narrow `"sheet"`.
 *
 * @param widthPx - The current viewport width, in CSS px.
 */
export function editorPlacement(widthPx: number): EditorPlacement {
  const layout = resolveLayout(widthPx);
  if (layout === "wide") return "panes";
  if (layout === "medium") return "inline";
  return "sheet";
}

/**
 * Whether `placement`'s output shows no editor affordances at all —
 * true only for `"sheet"` (narrow): the output is read-only paper there,
 * and the Properties form moves into a `Sheet` instead of sitting beside it.
 *
 * @param placement - The placement to check.
 */
export function outputIsReadOnly(placement: EditorPlacement): boolean {
  return placement === "sheet";
}
