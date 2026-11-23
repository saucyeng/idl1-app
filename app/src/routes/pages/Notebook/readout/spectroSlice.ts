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
 * The part of `r` the strip shows, below `fmaxHz`, or `null` when none of
 * it overlaps the raster. The strip spans `windowS` with the cursor
 * `aheadS` seconds before its right edge (0: the cursor at the right edge;
 * half the window: in the middle, showing what is coming, 2026-11-23).
 * Time outside the raster is left empty.
 */
export function sliceRect(r: RasterExtent, tUs: number, windowS: number, fmaxHz: number, aheadS = 0): SliceRect | null {
  const spanUs = r.t1Us - r.t0Us;
  if (!(spanUs > 0) || !(windowS > 0) || r.width < 1 || r.height < 1) return null;
  const toUs = tUs + Math.max(0, Math.min(aheadS, windowS)) * 1e6;
  const fromUs = toUs - windowS * 1e6;
  const a = Math.max(fromUs, r.t0Us);
  const b = Math.min(toUs, r.t1Us);
  if (!(b > a)) return null;
  const sx = ((a - r.t0Us) / spanUs) * r.width;
  const sw = ((b - a) / spanUs) * r.width;
  const fTop = Math.min(fmaxHz, r.fHiHz);
  if (!(fTop > r.fLoHz)) return null;
  const sy = ((r.fHiHz - fTop) / (r.fHiHz - r.fLoHz)) * r.height;
  const sh = r.height - sy;
  return { sx, sw, sy, sh, destX: (a - fromUs) / (windowS * 1e6), destW: (b - a) / (windowS * 1e6) };
}

/**
 * The frequency, Hz, at height `y` (0 at the strip's top, 1 at its bottom)
 * of a log-frequency strip from `fminHz` (bottom) to `fmaxHz` (top): most of
 * what a bike's pods see sits in the low tens of hertz, which a linear axis
 * squeezes into the bottom rows (2026-11-23, Isaac).
 */
export function logFrequencyAt(y: number, fminHz: number, fmaxHz: number): number {
  return fminHz * Math.pow(fmaxHz / fminHz, 1 - y);
}

/** Where frequency `fHz` sits on a log strip from `fminHz` to `fmaxHz` (0 top, 1 bottom); the inverse of {@link logFrequencyAt}. */
export function logFrequencyY(fHz: number, fminHz: number, fmaxHz: number): number {
  return 1 - Math.log(fHz / fminHz) / Math.log(fmaxHz / fminHz);
}

/** The 1-2-5 frequencies strictly inside `(fminHz, fmaxHz)`, for a log axis's labels. */
export function logFrequencyTicks(fminHz: number, fmaxHz: number): number[] {
  const out: number[] = [];
  for (let decade = 0.1; decade <= fmaxHz; decade *= 10) {
    for (const m of [1, 2, 5]) {
      const f = Math.round(m * decade * 1000) / 1000;
      if (f > fminHz && f < fmaxHz) out.push(f);
    }
  }
  return out;
}

/**
 * The time extent, µs, to give a spectrogram raster fetched from `t0Us`,
 * so each pixel column sits at its FFT segment's centre (2026-11-23: the
 * strip led the video by half a segment, because its columns were spread
 * from the fetch's start to its end, which ignores the half segment the
 * first and last centres sit inside). `xDomainS` is the raster meta's
 * `x_domain`, the first and last segment centres in seconds from the first
 * sample; `width` its pixel columns. Pure.
 */
export function spectroExtentUs(t0Us: number, xDomainS: readonly [number, number], width: number): [number, number] {
  const [a, b] = [t0Us + xDomainS[0] * 1e6, t0Us + xDomainS[1] * 1e6];
  const col = width > 1 ? (b - a) / (width - 1) : 0;
  return [a - col / 2, b + col / 2];
}
