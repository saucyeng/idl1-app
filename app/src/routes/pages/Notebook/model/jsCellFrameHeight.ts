/**
 * Default height reserved for a plain-mount `js` cell before its first
 * `cellRendered` (`ChartCellProps.heightPx`'s doc comment gives
 * `ChartCell`'s own equivalent). No spec number is given; matches the
 * fallback height any bound cell starts at.
 *
 * Lives in this pure module, not in `components/JsCellFrame.tsx`: that
 * component imports {@link resolveJsCellFrameHeightPx} from here, so the
 * constant living there made an import cycle, and under Vite's ES-module
 * evaluation order this file ran first and read the constant in its
 * temporal dead zone ("Cannot access before initialization" on every page
 * load, 2026-09-14). `JsCellFrame.tsx` re-exports it for its importers.
 */
export const DEFAULT_JS_CELL_HEIGHT_PX = 240;

/**
 * Minimum height, in pixels, reserved for a plain-mount `js` cell's frame
 * when it carries a visible note or error. A cell with no session channel
 * to chart (e.g. no session selected) reports a near-zero `cellRendered`
 * height from its empty Plot, which would otherwise clip the note/error
 * text this frame overlays on top of it.
 *
 * **Decision 58: this is the height the chart would have been**, not the
 * smallest height the text fits in. It was 96 px — enough for one line of
 * note plus padding — which satisfied "never clipped" but not "an empty
 * slot **the size the chart would be**": a cell that is a 240 px chart
 * with a session selected and a 96 px note without one moves everything
 * below it up the page the moment the selection changes, which is the
 * layout jump decision 58 exists to prevent. `model/plotChrome.ts` already
 * refuses to let the same cell gain and lose a header row for the same
 * reason.
 *
 * No spec number governs the value; it tracks {@link DEFAULT_JS_CELL_HEIGHT_PX}
 * so the two can never drift apart.
 */
export const JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX = DEFAULT_JS_CELL_HEIGHT_PX;

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
