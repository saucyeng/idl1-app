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
