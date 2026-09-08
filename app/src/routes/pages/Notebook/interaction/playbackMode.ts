import { advanceViewportByTime } from "./cursorFollow";
import type { Viewport } from "../model/viewport";

/**
 * Decision 57's two playback modes: which one applies to a mounted chart's
 * own viewport as the shared cursor advances (plan Task 11). Both are
 * ordinary panning arithmetic over `model/viewport.ts`'s `Viewport` — no
 * React, no DOM, no timer — so `ChartCell.tsx`'s shared-cursor effect can
 * call {@link advanceForMode} in place of the hard-coded
 * `advanceViewportByTime` call it used before this task, with its
 * dependency array staying data-only (operating brief §4).
 *
 * - `"cursor-fixed"` — the chart pans under a cursor that stays fixed on
 *   screen (decision 57's second mode, "I kind of want the option to have
 *   the cursor sit in the same spot and have the charts pass by"). This is
 *   exactly `cursorFollow.ts`'s existing `advanceViewportByTime`, unchanged.
 * - `"scroll-at-edge"` — decision 57's first (and default) mode: the
 *   viewport holds still while the cursor crosses it, then pages forward by
 *   exactly one viewport-width the instant the cursor reaches its right
 *   edge ("the window scrolls when the cursor reaches its edge") — the
 *   cursor itself moves across the screen between pages, the picture does
 *   not.
 */
export type PlaybackMode = "cursor-fixed" | "scroll-at-edge";

/**
 * Advances `viewport` for one playback frame under `mode`, per decision 57.
 *
 * @param viewport The chart's own viewport before this frame, in the same
 *   time coordinate frame as `cursorTUs` (session-absolute µs, matching
 *   `ChartCell.tsx`'s existing `cursorTUs`/`liveViewport` frame — this
 *   function does not itself care whether that frame is session-absolute or
 *   window-relative, only that both parameters share it).
 * @param cursorTUs The shared cursor's own current time, in `viewport`'s
 *   frame, *after* this frame's advance (`ChartCell.tsx`'s `tUsNum`).
 * @param deltaUs How far the cursor advanced this frame — `"cursor-fixed"`'s
 *   own pixel-preserving pan needs the delta; `"scroll-at-edge"` does not
 *   (a page jump depends only on where the cursor now is, not how far it
 *   just moved), but both branches take the same signature so the caller
 *   never branches on which parameters a given mode reads.
 * @param mode Which of decision 57's two modes to apply.
 */
export function advanceForMode(viewport: Viewport, cursorTUs: number, deltaUs: number, mode: PlaybackMode): Viewport {
  if (mode === "cursor-fixed") {
    return advanceViewportByTime(viewport, deltaUs);
  }

  const span = viewport.endUs - viewport.startUs;
  if (span <= 0) {
    return viewport;
  }

  // Page forward one viewport-width at a time until the cursor is back
  // within (or exactly at the left edge of) the visible range. A `while`,
  // not a single jump: a long frame gap (a stalled tab, a high speed
  // multiple) can advance the cursor by more than one page's worth in a
  // single tick, and the picture must still land on the page that actually
  // contains the cursor, not one page behind it.
  let next = viewport;
  while (cursorTUs >= next.endUs) {
    next = { ...next, startUs: next.startUs + span, endUs: next.endUs + span };
  }
  return next;
}
