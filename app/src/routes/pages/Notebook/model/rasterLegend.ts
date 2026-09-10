/** Builds a raster chart's colour-bar legend from the engine-supplied ramp
 *  stops (C3 §3.6 `RasterMeta.ramp_stops`, ruling R177).
 *
 *  This module reads stops; it never computes a colour. The ramp is
 *  `idl_rs::colormap`'s Turbo and lives only there — a second Turbo in
 *  TypeScript could drift from the pixels the legend describes, and no test
 *  would catch it. Sampling colours back out of a fetched raster is equally
 *  out: that makes the legend depend on whatever data is on screen.
 */

/** One `RasterMeta.ramp_stops` entry: opaque RGBA8 `[r, g, b, a]`, each 0–255. */
export type RampStop = [number, number, number, number];

/**
 * Builds the CSS `linear-gradient(to right, …)` for a colour bar whose left
 * end is `scale.vmin` and right end is `scale.vmax` (C3 §3.6: `vmin` maps to
 * stop 0, `vmax` to the last stop, linear in between).
 *
 * Stop `i` of `n` is placed at `i / (n - 1) * 100` %, mirroring the `t` the
 * engine sampled it at, so the bar reproduces the ramp the pixels were
 * encoded with. Every colour in the returned string comes from `stops`;
 * this function invents none.
 *
 * Returns `null` for fewer than two stops — one colour is not a gradient,
 * and a caller drawing nothing is more honest than a bar implying a range
 * it cannot show. (The engine never sends fewer: `turbo_stops` returns two
 * endpoints even when asked for less, and the meta command always sends 16.)
 */
export function buildLegendGradient(stops: readonly RampStop[]): string | null {
  if (stops.length < 2) {
    return null;
  }
  const last = stops.length - 1;
  const parts = stops.map(([r, g, b, a], i) => `rgba(${r}, ${g}, ${b}, ${a / 255}) ${(i / last) * 100}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
