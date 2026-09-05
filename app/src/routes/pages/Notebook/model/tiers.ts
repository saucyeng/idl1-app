/**
 * Pure tier-selection and point-budget math for the Notebook's chart tiles
 * (design §6 interaction rules; C3 §3.5). Nothing here calls `fetchTile` or
 * `invoke` — it only decides *which* tier/tile indices a caller should ask
 * for, and how many points a line mark may render.
 */

/** Raw samples per bucket at tier 0 (`TIER_BASE.pow(0) = 1`); bucket size at
 *  tier `k` is `TIER_BASE ** k`. Mirrors `TIER_BASE` in
 *  `rust/core/src/chart_decimation.rs` — duplicated here per that module's
 *  own `// TODO(idl0):` note in case it ever needs to come from the engine
 *  dynamically instead of being a literal on both sides. */
export const TIER_BASE = 8;

/** Number of decimation buckets spanned by one tile, at any tier. Mirrors
 *  `TILE_SIZE_BUCKETS` in `rust/core/src/chart_decimation.rs`. */
export const TILE_SIZE_BUCKETS = 1024;

/** Largest tier the engine will serve (C3 §3.5: "L5 rejects `tier >
 *  MAX_TIER` with `invalid_argument`"). Mirrors `MAX_TIER` in
 *  `rust/core/src/chart_decimation.rs`. */
export const MAX_TIER = 10;

/** Desktop line-mark point budget, in rendered points per pixel column per
 *  series (design §6, performance-budget statement P5: "the host caps line
 *  marks at ~2 points per pixel column per series"). */
const DESKTOP_POINTS_PER_PIXEL_COLUMN = 2;

/** Mobile line-mark point budget, in rendered points per pixel column per
 *  series — smaller than desktop per design §6 ("and lower on mobile").
 *  No spec number is given for the exact ratio; half of the desktop budget
 *  is a reasonable implementation-time default, named here rather than
 *  inlined at the call site. */
const MOBILE_POINTS_PER_PIXEL_COLUMN = 1;

/** Converts a µs time span to a raw-sample count at the channel's nominal
 *  rate (C1 §2). `sampleRateHz` is in Hz, `spanUs` in µs. */
function samplesInSpan(spanUs: number, sampleRateHz: number): number {
  return (spanUs * sampleRateHz) / 1_000_000;
}

/** Number of decimation buckets a raw-sample span occupies at tier `k`. */
function bucketsInSamples(rawSamples: number, tier: number): number {
  return rawSamples / TIER_BASE ** tier;
}

/** Chooses the tier whose bucket count over `visibleSpanUs` is nearest
 *  `pixelWidth` — i.e. the tier that best resolves the visible window at
 *  approximately one bucket per pixel column, scanning every tier in
 *  `[0, MAX_TIER]` for the minimum `|bucketsInWindow(tier) - pixelWidth|`
 *  (ties favour the lower/finer tier, since the scan visits tiers in
 *  ascending order and only replaces the current best on a strictly
 *  smaller difference). `sampleRateHz` is the channel's own nominal rate
 *  (C1 §2), used to convert the visible span from µs to a raw-sample count
 *  before dividing by tier bucket size. Clamped to `[0, MAX_TIER]` (C3
 *  §3.5).
 *
 *  @param visibleSpanUs Width of the visible time window, in µs.
 *  @param pixelWidth Width of the chart's plotting area, in CSS px.
 *  @param sampleRateHz The channel's nominal sample rate, in Hz.
 */
export function chooseTier(visibleSpanUs: number, pixelWidth: number, sampleRateHz: number): number {
  const rawSamples = samplesInSpan(visibleSpanUs, sampleRateHz);

  let bestTier = 0;
  let bestDiff = Math.abs(bucketsInSamples(rawSamples, 0) - pixelWidth);
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    const diff = Math.abs(bucketsInSamples(rawSamples, tier) - pixelWidth);
    if (diff < bestDiff) {
      bestTier = tier;
      bestDiff = diff;
    }
  }
  return bestTier;
}

/** The inclusive tile-index range covering `[visibleStartUs, visibleEndUs)`
 *  at the given tier. A tile's sample span is
 *  `TILE_SIZE_BUCKETS * TIER_BASE**tier` raw samples; converted to µs via
 *  `sampleRateHz` the same way `chooseTier` does. `first` is the tile
 *  containing `visibleStartUs`; `last` is the tile containing the last µs
 *  strictly inside the half-open window (`visibleEndUs - 1`), so a window
 *  that ends exactly on a tile boundary does not spuriously include the
 *  next tile.
 *
 *  @param visibleStartUs Start of the visible window, in µs (inclusive).
 *  @param visibleEndUs End of the visible window, in µs (exclusive).
 *  @param tier Decimation tier, `0` = raw.
 *  @param sampleRateHz The channel's nominal sample rate, in Hz.
 */
export function tileRange(
  visibleStartUs: number,
  visibleEndUs: number,
  tier: number,
  sampleRateHz: number
): { first: number; last: number } {
  const tileSpanRawSamples = TILE_SIZE_BUCKETS * TIER_BASE ** tier;
  const tileSpanUs = (tileSpanRawSamples / sampleRateHz) * 1_000_000;

  const first = Math.floor(visibleStartUs / tileSpanUs);
  const last = Math.floor((visibleEndUs - 1) / tileSpanUs);
  return { first, last };
}

/** Maximum points a line mark may render per series (design §6, "the host
 *  caps line marks at ~2 points per pixel column per series and lower on
 *  mobile" — performance-budget statement P5).
 *
 *  @param pixelWidth Width of the chart's plotting area, in CSS px.
 *  @param isMobile Whether the chart is rendering on a mobile viewport.
 */
export function pointBudget(pixelWidth: number, isMobile: boolean): number {
  const perColumn = isMobile ? MOBILE_POINTS_PER_PIXEL_COLUMN : DESKTOP_POINTS_PER_PIXEL_COLUMN;
  return pixelWidth * perColumn;
}
