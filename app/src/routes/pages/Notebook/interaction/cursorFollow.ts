import { panBy, type Viewport } from "../model/viewport";

/**
 * "Given a cursor time and a chart's own viewport, what does the chart
 * show" (R99): the two pure conversions `Notebook/index.tsx`'s
 * playback/shared-cursor wiring needs and nothing else — no IPC, no
 * `postMessage`, no React. {@link pixelXForTUs} draws the shared cursor
 * line on a chart whose viewport may or may not currently show it;
 * {@link advanceViewportByTime} is what a playback tick applies to every
 * mounted chart's own committed viewport so "every plot pans" (decision 18)
 * without any chart owning its own playback clock.
 */

/**
 * The CSS-px position of `tUs` within `viewport`'s plotted area — the time
 * → pixel inverse of `model/cursor.ts`'s `cursorRequestFor`. Returns `null`
 * when `tUs` falls outside `[viewport.startUs, viewport.endUs]`, mirroring
 * `cursorRequestFor`'s own out-of-range `null` (the caller draws no cursor
 * line rather than one clamped to an edge that misrepresents the cursor's
 * real position).
 *
 * @param viewport The viewport to place `tUs` within.
 * @param tUs The shared cursor's time, in µs since session start.
 */
export function pixelXForTUs(viewport: Viewport, tUs: number): number | null {
  if (tUs < viewport.startUs || tUs > viewport.endUs) {
    return null;
  }
  const span = viewport.endUs - viewport.startUs;
  if (span <= 0) {
    return null;
  }
  return ((tUs - viewport.startUs) / span) * viewport.pixelWidth;
}

/**
 * Shifts `viewport` forward by `deltaUs` of session time — one playback
 * frame's worth of "every plot pans" (decision 18) applied to a single
 * chart. Calls `model/viewport.ts`'s own {@link panBy} (converting the time
 * delta to the CSS-px delta `panBy` expects) rather than re-deriving its
 * pixel/time arithmetic here, so the shared cursor's on-screen position
 * within `viewport` is unchanged after the shift — the picture scrolls
 * under a cursor that stays fixed on screen, not the other way around.
 * Pure — never clamps to a session span; the caller applies `clampTo`
 * itself, as every other `panBy`/`zoomAt` caller in this lane does.
 *
 * @param viewport The chart's viewport before this playback frame.
 * @param deltaUs How far the shared cursor advanced this frame, in µs (from `interaction/playback.ts`'s `tick`).
 */
export function advanceViewportByTime(viewport: Viewport, deltaUs: number): Viewport {
  const span = viewport.endUs - viewport.startUs;
  if (span === 0 || viewport.pixelWidth === 0) {
    return viewport;
  }
  const usPerPixel = span / viewport.pixelWidth;
  const pixelDx = -deltaUs / usPerPixel;
  return panBy(viewport, pixelDx);
}
