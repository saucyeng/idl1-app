/**
 * The worksheet's one shared X range (direction-2 decision 52: "the X range
 * is shared by every chart"; plan `runs/2026-09-08/w32-time-plan.md` Task
 * 4). Before this task, `Notebook/index.tsx`'s `chartWindows` held one
 * independent `Viewport` per cell (`model/channelBindDriver.ts`'s
 * `ChartWindow`) -- a pan/zoom in one chart never moved any other. This
 * module is the pure half of promoting that to one shared value: a
 * {@link SharedViewport} is a `Viewport` with the chart's own pixel width
 * removed, since two charts of different widths reading the *same* shared
 * time range still need two different `Viewport`s (`viewport.pixelWidth`
 * feeds `panBy`/`zoomAt`'s µs-per-pixel math).
 *
 * `tiles` stay per cell (a `SharedViewport` says nothing about which
 * channel/tier a chart is showing) -- only the time range promotes.
 *
 * No React, no DOM.
 */
import type { Viewport } from "./viewport";

/**
 * The worksheet's shared visible time window, in µs since session start
 * (half-open, `viewport.ts`'s own convention). Carries no pixel width --
 * that is each chart's own, applied by {@link viewportForCell}.
 */
export interface SharedViewport {
  /** Start of the visible window, in µs since session start (inclusive). */
  startUs: number;
  /** End of the visible window, in µs since session start (exclusive). */
  endUs: number;
}

/**
 * Builds the `Viewport` a chart of `pixelWidth` CSS px should render, from
 * the worksheet's shared time range. Pure, never clamps (same convention as
 * `viewport.ts`'s `panBy`/`zoomAt`: a caller needing the result kept inside
 * the session span calls `clampTo` separately).
 */
export function viewportForCell(shared: SharedViewport, pixelWidth: number): Viewport {
  return { startUs: shared.startUs, endUs: shared.endUs, pixelWidth };
}

/**
 * Extracts the worksheet's new shared time range from one chart's own
 * just-settled `Viewport` -- the gesture that committed it. Drops that
 * chart's own `pixelWidth`: the shared range carries none, and a chart of a
 * different width reads the same range back through its own
 * {@link viewportForCell} call, at its own width.
 */
export function commitSharedViewport(viewport: Viewport): SharedViewport {
  return { startUs: viewport.startUs, endUs: viewport.endUs };
}

/**
 * Carries the shared time range across a change of primary window
 * (2026-11-23: a zoom settled on the whole ride stayed at `[0, …)` after
 * lap 1 was selected, so lap 1's charts drew from the ride's start to the
 * lap's end). The range is absolute in the *old* primary window's frame;
 * it moves to the new one as an offset from the window's start (ruling
 * R131 Q2's frame), so a zoom into the first corner of lap 1 shows the
 * first corner of lap 3.
 *
 * `null` (each chart opens on its binding's `initialSpan`, the new window)
 * when the offset range does not fit inside the new window: a range wider
 * than the window, or one starting before the old window's start, means
 * nothing about the new one. `null` too when either window is unresolved.
 * The same window in, the same range out.
 */
export function rebaseSharedViewport(
  shared: SharedViewport | null,
  previous: { startUs: number; endUs: number } | null,
  next: { startUs: number; endUs: number } | null
): SharedViewport | null {
  if (shared === null || previous === null || next === null) return null;
  if (previous.startUs === next.startUs && previous.endUs === next.endUs) return shared;
  const offsetStartUs = shared.startUs - previous.startUs;
  const offsetEndUs = shared.endUs - previous.startUs;
  const nextDurationUs = next.endUs - next.startUs;
  if (offsetStartUs < 0 || offsetEndUs > nextDurationUs || !(offsetStartUs < offsetEndUs)) return null;
  return { startUs: next.startUs + offsetStartUs, endUs: next.startUs + offsetEndUs };
}
