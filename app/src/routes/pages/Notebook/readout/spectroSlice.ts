/**
 * The scrolling spectrogram's geometry (2026-11-23, Isaac: "charts that can
 * scroll past, hopefully the spectrogram too"): one spectrogram raster is
 * fetched for the whole stretch shown (`fetch_raster_v2` over a range), and
 * each frame shows the part of it from `window_s` seconds before the cursor
 * up to the cursor, cut at `fmax`. Pure: which pixels of the raster to show
 * and where in the strip they go.
 */

/** A fetched raster's extent: columns span time, rows span frequency (row 0 the top, the highest frequency). */
export interface RasterExtent {
  /** Session µs of the raster's left and right edges. */
  t0Us: number;
  t1Us: number;
  /** Raster size, px. */
  width: number;
  height: number;
  /** Frequency of the bottom and top edges, Hz. */
  fLoHz: number;
  fHiHz: number;
}

/** The source rectangle to copy, in raster px, and where its left edge lands in the strip (0..1 of the strip's width). */
export interface SliceRect {
  sx: number;
  sw: number;
  sy: number;
  sh: number;
  /** Fraction of the strip's width left empty on the left (before the raster starts). */
  destX: number;
  /** Fraction of the strip's width the slice fills. */
  destW: number;
}

/**
 * The part of `r` from `tUs - windowS` to `tUs`, below `fmaxHz`, or `null`
 * when none of it overlaps the raster. The strip always spans `windowS`;
 * time before the raster's start is left empty on the left.
 */
export function sliceRect(r: RasterExtent, tUs: number, windowS: number, fmaxHz: number): SliceRect | null {
  const spanUs = r.t1Us - r.t0Us;
  if (!(spanUs > 0) || !(windowS > 0) || r.width < 1 || r.height < 1) return null;
  const fromUs = tUs - windowS * 1e6;
  const a = Math.max(fromUs, r.t0Us);
  const b = Math.min(tUs, r.t1Us);
  if (!(b > a)) return null;
  const sx = ((a - r.t0Us) / spanUs) * r.width;
  const sw = ((b - a) / spanUs) * r.width;
  const fTop = Math.min(fmaxHz, r.fHiHz);
  if (!(fTop > r.fLoHz)) return null;
  const sy = ((r.fHiHz - fTop) / (r.fHiHz - r.fLoHz)) * r.height;
  const sh = r.height - sy;
  return { sx, sw, sy, sh, destX: (a - fromUs) / (windowS * 1e6), destW: (b - a) / (windowS * 1e6) };
}
