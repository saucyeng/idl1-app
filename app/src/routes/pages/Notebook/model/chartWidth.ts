/**
 * Pure chart-width model (ruling R221 item 4): turning a measured column
 * width into the width charts are fetched and plotted at.
 *
 * Charts used to be plotted at a fixed 640 CSS px whatever the notebook
 * column was — the bug Isaac reported as "charts aren't resizing to the
 * width of the notebook tab". The width is now measured from the rendered
 * chart frame, which fills its column, so it changes with the window, with
 * the editor placement and with every column toggle.
 *
 * A measured number cannot be used raw. It arrives from a `ResizeObserver`
 * as a fractional device-pixel-derived value that changes on every frame of
 * a window drag, and it is the `columnCount` tiles are cached under (R43) —
 * so a width of 812.7 px and one of 812.4 px would be two cache keys, two
 * fetches and two evaluations for one chart nobody resized. {@link
 * resolveChartWidthPx} is what makes the measurement usable: it clamps it to
 * a sane range and snaps it to {@link CHART_WIDTH_QUANTUM_PX}, so a drag
 * across a monitor produces tens of distinct widths rather than thousands.
 */

/**
 * Chart width used before anything has been measured — the first render, and
 * any environment with no layout (the paper view's own document build, a
 * test).
 *
 * Unchanged from the fixed width this module replaces, deliberately: a
 * notebook that flashed one width and settled at another would be a visible
 * regression on fast machines, and this is the value every stored tile cache
 * key was minted with.
 */
export const DEFAULT_CHART_WIDTH_PX = 640;

/**
 * Narrowest width a chart is ever fetched at. Below roughly this, Observable
 * Plot's own axis labels collide and a tile fetch returns fewer columns than
 * the axis needs; the chart is clipped by its column instead, which is the
 * better failure. No spec number — a UI-feel floor, named rather than left
 * to whatever a collapsing pane momentarily reports.
 */
export const MIN_CHART_WIDTH_PX = 240;

/**
 * Widest width a chart is fetched at. A column wider than this is plotted at
 * this width and centred by its own CSS rather than fetching thousands of
 * tile columns for a chart nobody can read that finely — and it bounds the
 * damage a mis-measurement (a container that momentarily reports the whole
 * scroll width) can do to the tile cache.
 */
export const MAX_CHART_WIDTH_PX = 2400;

/**
 * The step measured widths are snapped down to, CSS px. Eight is small
 * enough that no snap is visible (half a character cell) and large enough
 * that a slow drag across a 2000 px monitor mints at most a couple of
 * hundred distinct cache keys instead of one per frame.
 */
export const CHART_WIDTH_QUANTUM_PX = 8;

/**
 * The chart width to fetch and plot at, given what the frame measured.
 *
 * `null` (nothing measured yet) and any unusable measurement — zero, a
 * negative, a `NaN`, a hidden column reporting `0` — fall back to
 * {@link DEFAULT_CHART_WIDTH_PX} rather than to zero: a chart fetched at
 * zero columns is a blank cell, and a hidden tab must not throw away the
 * width it will have when it is shown again.
 *
 * Otherwise the measurement is clamped to
 * `[MIN_CHART_WIDTH_PX, MAX_CHART_WIDTH_PX]` and snapped **down** to
 * {@link CHART_WIDTH_QUANTUM_PX}, so the chart is never fetched wider than
 * the column that has to hold it.
 */
export function resolveChartWidthPx(measuredPx: number | null): number {
  if (measuredPx === null || !Number.isFinite(measuredPx) || measuredPx <= 0) return DEFAULT_CHART_WIDTH_PX;

  const clamped = Math.min(Math.max(measuredPx, MIN_CHART_WIDTH_PX), MAX_CHART_WIDTH_PX);
  const snapped = Math.floor(clamped / CHART_WIDTH_QUANTUM_PX) * CHART_WIDTH_QUANTUM_PX;
  return Math.max(snapped, MIN_CHART_WIDTH_PX);
}
