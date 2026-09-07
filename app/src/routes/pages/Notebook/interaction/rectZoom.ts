import { panBy, zoomAt, type Viewport } from "../model/viewport";

/**
 * Drag-rectangle zoom (decision 27): the viewport that shows exactly the
 * time range under `[x0, x1]` CSS px of `viewport`'s own plotted area.
 * Built by composing `model/viewport.ts`'s own {@link zoomAt} (scale about
 * the rectangle's left edge, `x0`, until the rectangle's width fills the
 * whole plotted width) and {@link panBy} (slide that now-full-width picture
 * left by `x0` px so the rectangle's left edge lands at pixel `0`) — the
 * brief's "reuses `zoomAt`/`clampTo`; do not write a second transform" —
 * rather than re-deriving the pixel/time arithmetic directly. The caller
 * applies `clampTo` afterward, as every other `zoomAt`/`panBy` caller does.
 *
 * @param viewport The chart's viewport the rectangle was dragged within.
 * @param x0 The rectangle's left edge, in CSS px (must be `< x1`).
 * @param x1 The rectangle's right edge, in CSS px.
 */
export function zoomToRect(viewport: Viewport, x0: number, x1: number): Viewport {
  const factor = viewport.pixelWidth / (x1 - x0);
  const zoomed = zoomAt(viewport, x0, factor);
  return panBy(zoomed, -x0);
}
