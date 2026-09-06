import { DEFAULT_JS_CELL_HEIGHT_PX } from "../components/JsCellFrame";

/**
 * Minimum height, in pixels, reserved for a plain-mount `js` cell's frame
 * when it carries a visible note or error. A cell with no session channel
 * to chart (e.g. no session selected) reports a near-zero `cellRendered`
 * height from its empty Plot, which would otherwise clip the note/error
 * text this frame overlays on top of it. No spec number governs this
 * value — it is a rendering minimum, not a protocol constant — chosen as
 * enough vertical room for a one-line note plus its padding.
 */
export const JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX = 96;

/**
 * Resolves the height, in pixels, a {@link JsCellFrame} renders at.
 *
 * `null` (no `cellRendered` yet) falls back to
 * {@link DEFAULT_JS_CELL_HEIGHT_PX}. Otherwise the sandbox's own reported
 * height is used, except when a note or error is present: then the height
 * is floored at {@link JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX} so the note
 * or error text is never clipped by a tiny reported height.
 */
export function resolveJsCellFrameHeightPx(heightPx: number | null, hasNoteOrError: boolean): number {
  if (heightPx === null) return DEFAULT_JS_CELL_HEIGHT_PX;
  if (hasNoteOrError) return Math.max(heightPx, JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX);
  return heightPx;
}
