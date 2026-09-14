/**
 * Ruling R237 (`runs/2026-09-13/BRIEF-seams-evaluated-with.md`): burst-seam
 * spans on the chart, the half `model/gapSpans.ts`'s own doc comment
 * flagged as needing a contract change ("Making seams visible needs a C3
 * field... a contract change and therefore not this lane's to invent").
 * `ipc/seams.ts`'s `fetch_seams` is that field; this module turns its
 * response into placed screen bands, the same two-step split
 * `gapSpans.ts` makes and for the same reason (CLAUDE.md §3): span
 * computation is settle-bound, placement is not.
 *
 * A seam is corrected data, not missing data (C1 §3.3 never drops a
 * sample at a seam, it only re-spaces the burst either side of it), so it
 * is drawn with a second tone (`--seam-hatch`, `styles/tokens.css`) rather
 * than `--gap-hatch` -- the same soft hatched-band language, a different
 * hue, so the two are never mistaken for each other at a glance.
 *
 * Pure: no React, no DOM, no IPC. `components/ChartCell.tsx` renders the
 * bands this module returns as absolutely positioned overlays, the same
 * host-side overlay shape `gapBands` already uses.
 */
import type { SeamsResult } from "../../../../ipc/seams";

/** One burst-seam boundary, in session time (C1 §3.3). */
export interface SeamSpan {
  /** The corrected time of the last sample before the seam, µs since
   *  session start. */
  startUs: number;
  /** The corrected time of the first sample after the seam, µs since
   *  session start. */
  endUs: number;
}

/** Converts `fetch_seams`'s wire pairs into {@link SeamSpan}s. Trivial --
 *  the engine has already done the detection (`idl_rs::session::
 *  seam_correction::seam_spans`) -- kept as its own function so
 *  `ChartCell.tsx` never destructures the tuple shape itself. */
export function seamSpansFromResult(result: SeamsResult): SeamSpan[] {
  return result.spans.map(([startUs, endUs]) => ({ startUs, endUs }));
}

/** One seam band on screen: a band's left edge and width, in CSS px from
 *  the plotted area's own left edge. */
export interface SeamBand {
  leftPx: number;
  widthPx: number;
}

/**
 * Places `spans` within `viewport`'s plotted area, clipped to it -- the
 * same clip/clamp/minimum-width rule `gapBandsPx` applies, so a seam band
 * and a gap band behave identically under pan/zoom and never flicker
 * differently at a shared edge.
 *
 * @param spans Seam spans, from {@link seamSpansFromResult}.
 * @param viewport The chart's current viewport (time range and pixel width).
 * @param minWidthPx Narrowest band worth drawing, in CSS px. Defaults to 2.
 */
export function seamBandsPx(
  spans: readonly SeamSpan[],
  viewport: { startUs: number; endUs: number; pixelWidth: number },
  minWidthPx = 2
): SeamBand[] {
  const span = viewport.endUs - viewport.startUs;
  if (span <= 0 || viewport.pixelWidth <= 0) return [];

  const bands: SeamBand[] = [];
  for (const seam of spans) {
    const clippedStart = Math.max(seam.startUs, viewport.startUs);
    const clippedEnd = Math.min(seam.endUs, viewport.endUs);
    if (clippedEnd <= clippedStart) continue;

    const leftPx = ((clippedStart - viewport.startUs) / span) * viewport.pixelWidth;
    const widthPx = ((clippedEnd - clippedStart) / span) * viewport.pixelWidth;
    if (widthPx < minWidthPx) continue;

    bands.push({ leftPx, widthPx });
  }

  return bands;
}
