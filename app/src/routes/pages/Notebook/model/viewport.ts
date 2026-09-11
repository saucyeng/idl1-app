/**
 * Pure viewport-transform math for the Notebook chart's pan/zoom gesture
 * (design §6 interaction rules; C3 §4 "Interaction budget"). Nothing here
 * touches the DOM, a timer, or IPC — a gesture frame calls these functions to
 * update local state and a CSS/canvas transform only; `settle.ts` decides
 * when a gesture has stopped, and only its callback may then request new
 * tiles at a re-chosen tier (P3/P4).
 */

/** The visible time window and the chart's own pixel width. `startUs`/`endUs`
 *  are µs on the session's `t` axis (C1 §3.1, half-open: `[startUs, endUs)`);
 *  `pixelWidth` is the chart's plotting-area width in CSS px. */
export interface Viewport {
  /** Start of the visible window, in µs since session start (inclusive). */
  startUs: number;
  /** End of the visible window, in µs since session start (exclusive). */
  endUs: number;
  /** CSS px width of the chart's plotting area. */
  pixelWidth: number;
}

/**
 * Translates `viewport` by `pixelDx` CSS px of pointer/drag movement.
 *
 * Convention (direct-manipulation drag-to-pan, matching a map or a touch
 * scroll surface): a positive `pixelDx` is a drag to the right, which drags
 * the already-drawn picture to the right on screen. Since the picture is
 * fixed to the time axis, dragging it right reveals time that was previously
 * off-screen to the left — i.e. the visible window moves to **earlier**
 * time. `panBy(v, -pixelDx)` is the exact inverse of `panBy(v, pixelDx)`.
 *
 * Pure — never clamps. A caller that needs the result kept inside the
 * session span calls {@link clampTo} on the returned viewport separately, so
 * "this pan would have gone past the edge" stays distinguishable from "this
 * pan was applied as requested."
 *
 * @param viewport The viewport before the drag.
 * @param pixelDx CSS px the pointer moved this frame (positive = right).
 */
export function panBy(viewport: Viewport, pixelDx: number): Viewport {
  const usPerPixel = (viewport.endUs - viewport.startUs) / viewport.pixelWidth;
  const dtUs = pixelDx * usPerPixel;
  return {
    startUs: viewport.startUs - dtUs,
    endUs: viewport.endUs - dtUs,
    pixelWidth: viewport.pixelWidth,
  };
}

/**
 * Scales `viewport`'s window by `factor` (`>1` = zoom in, shrinking the
 * visible span; `<1` = zoom out) about the time instant currently under
 * `pixelX`, keeping that instant fixed under the pointer: the standard
 * scale-about-a-point construction — convert `pixelX` to a time instant
 * under the *current* viewport, scale the span by `1 / factor`, then
 * re-center so that instant maps back to the same `pixelX` fraction of the
 * *new* viewport's width.
 *
 * Pure — never clamps; see {@link clampTo}.
 *
 * @param viewport The viewport before the zoom.
 * @param pixelX CSS px position of the zoom's pointer/anchor, in the same coordinate space as `viewport.pixelWidth`.
 * @param factor Zoom factor; `>1` zooms in, `<1` zooms out.
 */
export function zoomAt(viewport: Viewport, pixelX: number, factor: number): Viewport {
  const usPerPixel = (viewport.endUs - viewport.startUs) / viewport.pixelWidth;
  const anchorUs = viewport.startUs + pixelX * usPerPixel;
  const newSpanUs = (viewport.endUs - viewport.startUs) / factor;
  const anchorFraction = pixelX / viewport.pixelWidth;
  const newStartUs = anchorUs - anchorFraction * newSpanUs;
  return {
    startUs: newStartUs,
    endUs: newStartUs + newSpanUs,
    pixelWidth: viewport.pixelWidth,
  };
}

/**
 * Clamps `viewport` to `[0, sessionSpanUs]`, preserving its span where
 * possible: a pan past either edge stops at that edge with the span
 * unchanged; a zoom-out whose span already exceeds `sessionSpanUs` cannot
 * preserve span (there is nowhere left to preserve it into) and instead
 * clamps to exactly `[0, sessionSpanUs]`.
 *
 * @param viewport The viewport to clamp.
 * @param sessionSpanUs Total session duration, in µs (the clampable range's upper bound).
 */
export function clampTo(viewport: Viewport, sessionSpanUs: number): Viewport {
  const span = viewport.endUs - viewport.startUs;
  if (span >= sessionSpanUs) {
    return { startUs: 0, endUs: sessionSpanUs, pixelWidth: viewport.pixelWidth };
  }

  let startUs = viewport.startUs;
  let endUs = viewport.endUs;
  if (startUs < 0) {
    endUs -= startUs;
    startUs = 0;
  }
  if (endUs > sessionSpanUs) {
    startUs -= endUs - sessionSpanUs;
    endUs = sessionSpanUs;
  }
  return { startUs, endUs, pixelWidth: viewport.pixelWidth };
}

/**
 * The CSS/canvas transform that makes the picture already drawn for
 * `rendered` appear, with no re-fetch, to be `current` (P3/P4): the
 * mechanism a gesture frame applies while `settle.ts` waits to see whether
 * the gesture has stopped.
 *
 * `translateXPx` moves the rendered picture in CSS px so the time instant at
 * `rendered`'s left edge lands at `current`'s corresponding pixel position
 * (positive = slide the picture right, mirroring {@link panBy}'s
 * drag-right-slides-picture-right convention). `scaleX` stretches the
 * picture horizontally **about its left edge** (`transformOrigin: "left"` on
 * the transformed element) — chosen as the origin because `translateXPx` is
 * computed relative to `rendered`'s own left edge, so translate-then-scale
 * about that same edge composes without a second correction term.
 *
 * **Derivation (review-task8.md's Critical fix).** The CSS transform list
 * `translateX(translateXPx) scaleX(scaleX)` composes, for a point at local
 * coordinate `x` (CSS px within `rendered`'s own already-drawn picture), as
 * `newPos = scaleX * x + translateXPx` (matrix-multiplication order — scale
 * applies to the picture's own local coordinates first, then the translate
 * shifts the whole scaled result). Requiring `current.startUs` to land at
 * pixel `0` of the chart (`x = 0` in `rendered`'s own coordinates is not
 * `current.startUs`'s position — only `rendered.startUs`'s is) gives
 * `newPos(rendered.startUs) = scaleX * 0 + translateXPx`, which must equal
 * `rendered.startUs`'s position in `current`'s own pixel space:
 * `(rendered.startUs - current.startUs) / (currentSpanUs / current.pixelWidth)`.
 * So `translateXPx` must be computed with **`current`'s own µs-per-pixel**
 * (`currentSpanUs / current.pixelWidth`), never `rendered`'s — dividing by
 * `rendered`'s µs-per-pixel (the pre-fix bug) only coincidentally matches
 * when `renderedSpanUs === currentSpanUs` (pure pan) or when
 * `current.startUs === rendered.startUs` (a zoom anchored at `pixelX = 0`);
 * any zoom anchored elsewhere (the ordinary case — a wheel zoom anchors at
 * the pointer) then visibly mispositions the live picture.
 *
 * @param rendered The viewport the currently-drawn picture was fetched/rendered for.
 * @param current The viewport the gesture has moved to so far.
 */
export function transformFor(rendered: Viewport, current: Viewport): { scaleX: number; translateXPx: number } {
  const renderedSpanUs = rendered.endUs - rendered.startUs;
  const currentSpanUs = current.endUs - current.startUs;
  const currentUsPerPixel = currentSpanUs / current.pixelWidth;

  const scaleX = renderedSpanUs / currentSpanUs;
  // `+ 0` normalises a `-0` result (e.g. when rendered and current are equal)
  // to `+0`, so callers doing exact equality checks never see the distinct
  // `-0` value arithmetic on a zero difference can otherwise produce.
  const translateXPx = (-(current.startUs - rendered.startUs) / currentUsPerPixel) + 0;

  return { scaleX, translateXPx };
}

/**
 * What a chart cell's gesture-local viewport and sandbox transform become
 * when the parent commits a newly rendered `committed` viewport (R209 item
 * 2).
 *
 * Idle (`gestureActive` false), this is the long-standing behaviour: the
 * committed viewport replaces whatever gesture-local window was live, and
 * the transform resets to identity, because the parent only commits once it
 * has re-rendered the picture for exactly that window — a leftover
 * non-identity transform would double-apply on top of it.
 *
 * Mid-gesture it must not: a settle fires 150 ms after the pointer last
 * moved and its tile fetch resolves later still, so a commit routinely
 * lands while the pointer is *still down and still panning*. Replacing the
 * live window there discards every pixel the user has panned since that
 * settle fired, and the picture snaps back to where it was when they
 * paused — the "charts jump around a little during a pan and snap back"
 * report. So the live window is kept as the user left it, and the transform
 * is re-based against the freshly rendered `committed` viewport instead:
 * the same picture stays under the pointer, and the gesture carries on from
 * where it actually is.
 *
 * Pure: the caller applies the returned viewport to its own state and sends
 * the returned transform to the sandbox.
 *
 * @param committed The viewport the parent has just rendered the picture for.
 * @param live The cell's gesture-local viewport immediately before this commit.
 * @param gestureActive `true` while a drag/zoom gesture is still in progress.
 */
export function commitViewport(
  committed: Viewport,
  live: Viewport,
  gestureActive: boolean
): { live: Viewport; transform: { scaleX: number; translateXPx: number } } {
  const next = gestureActive ? live : committed;

  return { live: next, transform: transformFor(committed, next) };
}
