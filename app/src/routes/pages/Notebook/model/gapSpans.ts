/**
 * Decision 60 (`runs/2026-09-07/ui/UI-DIRECTION-2.md` §D): "Gaps and
 * burst-seam corrections are visible on charts as a faint hatched band
 * over the affected X span, **if the tile stats make it cheap**; otherwise
 * a diagnostics view carries it." Isaac: "assume a soft yes for now if
 * it's not too complicated".
 *
 * The tile stats do make the **gap** half cheap. C3 §3.5's decoded tile
 * already carries `columnTUs` with the `COLUMN_T_US_EMPTY` sentinel at
 * every pixel column whose bucket range contains no sample at all
 * (`ipc/tiles.ts`), so a run of consecutive sentinel columns *is* a
 * recorded gap, read off data the chart has already fetched. No new C3
 * field, no second round trip, no engine change: this module walks the
 * same tiles `model/channelData.ts` walks and reports where the sentinels
 * were, instead of silently dropping them as that module does.
 *
 * **Burst seams are not covered by this pass.** C1 §3.3's seam correction
 * records *which algorithm version* ran (`seam_correction_version`, on
 * session detail) but nothing about *where* it moved samples: no per-seam
 * span reaches the app, and none of the tile stats imply one — a corrected
 * seam has samples on both sides, so it leaves no sentinel behind. Making
 * seams visible needs a C3 field (a `seams: {start_us, end_us}[]` on the
 * session-detail response, or a seam region in the tile payload), which is
 * a contract change and therefore not this lane's to invent. The half that
 * is knowable ships now — the same split `model/engineVersionBanner.ts`
 * made for decision 62's importer half.
 *
 * Pure: no React, no DOM, no IPC. `components/ChartCell.tsx` renders the
 * bands this module returns as absolutely positioned overlays, the same
 * host-side overlay shape its drag-selection rectangle already uses.
 */
import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";

/** One span of recorded time with no samples in it. */
export interface GapSpan {
  /** The time of the last column that *did* have samples, in µs since
   *  session start — the gap's left edge. */
  startUs: number;
  /** The time of the first column that has samples again, in µs since
   *  session start — the gap's right edge. */
  endUs: number;
  /** How many consecutive empty pixel columns the span covers. Exposed so
   *  a caller can ignore hairline gaps at a coarse tier without this
   *  module guessing a threshold on its behalf. */
  columns: number;
}

/**
 * Finds every recorded gap across `tiles`, which are assumed sorted in
 * ascending time order (the caller's own tile-range fetch order,
 * `model/tiers.ts`) — the same assumption and the same walk as
 * {@link tileToChannelData}.
 *
 * A gap is a run of consecutive `COLUMN_T_US_EMPTY` columns **bounded on
 * both sides by a column that has samples**. Runs that reach the first or
 * last column of the whole tile set are deliberately dropped: those are
 * the edges of the fetched range, where emptiness means "we have not
 * looked past here", not "the device recorded nothing here". Hatching them
 * would draw a gap band down the side of every chart whose window starts
 * before the session's first sample.
 *
 * Sentinel comparison happens as `bigint`, before any conversion to
 * `Number`, so the exact `i64::MIN` value survives it — `ipc/tiles.ts`'s
 * own rule, shared with `channelData.ts`, `hover.ts` and `peak.ts`.
 *
 * @param tiles Decoded tiles in ascending time order.
 */
export function gapSpansFromTiles(tiles: readonly DecodedTile[]): GapSpan[] {
  const spans: GapSpan[] = [];
  let lastFilledUs: number | null = null;
  let emptyRun = 0;

  for (const tile of tiles) {
    for (let j = 0; j < tile.columnTUs.length; j++) {
      const tUs = tile.columnTUs[j];

      if (tUs === COLUMN_T_US_EMPTY) {
        // Only counted once a filled column has been seen: a leading run
        // is the fetched range's own edge, not a gap.
        if (lastFilledUs !== null) emptyRun += 1;
        continue;
      }

      const filledUs = Number(tUs);
      if (emptyRun > 0 && lastFilledUs !== null) {
        spans.push({ startUs: lastFilledUs, endUs: filledUs, columns: emptyRun });
      }
      emptyRun = 0;
      lastFilledUs = filledUs;
    }
  }

  // A trailing run is dropped by falling out of the loop without a closing
  // filled column — the same reasoning as the leading run.
  return spans;
}

/** One gap drawn on screen: a band's left edge and width, in CSS px from
 *  the plotted area's own left edge. */
export interface GapBand {
  leftPx: number;
  widthPx: number;
}

/**
 * Places `spans` within `viewport`'s plotted area, clipped to it.
 *
 * A span that straddles an edge is clamped rather than dropped — half a
 * gap is still a gap, and hiding it because its other end is off screen
 * would make the hatching appear and disappear as the reader pans. A span
 * entirely outside the viewport, or one that survives clipping at less
 * than `minWidthPx`, is dropped: a band thinner than a hatch stripe reads
 * as a rendering artefact rather than as missing data.
 *
 * @param spans Gap spans, from {@link gapSpansFromTiles}.
 * @param viewport The chart's current viewport (time range and pixel width).
 * @param minWidthPx Narrowest band worth drawing, in CSS px. Defaults to 2.
 */
export function gapBandsPx(
  spans: readonly GapSpan[],
  viewport: { startUs: number; endUs: number; pixelWidth: number },
  minWidthPx = 2
): GapBand[] {
  const span = viewport.endUs - viewport.startUs;
  if (span <= 0 || viewport.pixelWidth <= 0) return [];

  const bands: GapBand[] = [];
  for (const gap of spans) {
    const clippedStart = Math.max(gap.startUs, viewport.startUs);
    const clippedEnd = Math.min(gap.endUs, viewport.endUs);
    if (clippedEnd <= clippedStart) continue;

    const leftPx = ((clippedStart - viewport.startUs) / span) * viewport.pixelWidth;
    const widthPx = ((clippedEnd - clippedStart) / span) * viewport.pixelWidth;
    if (widthPx < minWidthPx) continue;

    bands.push({ leftPx, widthPx });
  }

  return bands;
}
