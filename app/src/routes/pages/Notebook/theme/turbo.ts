/**
 * Turbo (Anton Mikhailov, 2019) — a saturated, perceptually-ordered colormap
 * running blue → cyan → green → yellow → red, for continuous raster data
 * (decision 26; `UI-DIRECTION.md` "Chart style rules for Plot"). Ported from
 * idl0's `tabs/analyze/turbo_colormap.dart`, itself the standard degree-5
 * polynomial approximation of the Turbo lookup table — visually faithful
 * across the range, with the only notable deviation at `t < 0.05`, where the
 * true table is a slightly deeper blue-purple. Dependency-free (no DOM, no
 * CSS variable) so it is importable from both the host bundle and the
 * sandbox bundle with no shared-stylesheet concern (unlike {@link
 * seriesColor}'s tokens, Turbo's coefficients are not brand tokens).
 */

/** Clamps `t` to `[0, 1]`; a non-finite input (e.g. `NaN` from an unsampled
 *  reading) is treated as `0` rather than propagating `NaN` into the
 *  polynomial below. */
function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/** Rounds `v` (already expected in `[0, 1]`, but clamped defensively since
 *  the polynomial can overshoot slightly at the domain's edges) to an 8-bit
 *  channel value in `[0, 255]`. */
function toChannel(v: number): number {
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(clamped * 255);
}

/**
 * Maps a normalised value `t` to a Turbo colour, returned as an `[r, g, b]`
 * triple of 8-bit channel values (`0..255`). `t` is clamped to `[0, 1]`; a
 * non-finite `t` is treated as `0` rather than producing `NaN` channels.
 */
export function turbo(t: number): [number, number, number] {
  const x = clamp01(t);
  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x2 * x2;
  const x5 = x4 * x;

  const r =
    0.13572138 +
    4.6153926 * x +
    -42.66032258 * x2 +
    132.13108234 * x3 +
    -152.94239396 * x4 +
    59.28637943 * x5;
  const g =
    0.09140261 +
    2.19418839 * x +
    4.84296658 * x2 +
    -14.18503333 * x3 +
    4.27729857 * x4 +
    2.82956604 * x5;
  const b =
    0.1066733 +
    12.64194608 * x +
    -60.58204836 * x2 +
    110.36276771 * x3 +
    -89.90310912 * x4 +
    27.34824973 * x5;

  return [toChannel(r), toChannel(g), toChannel(b)];
}

/** {@link turbo}, formatted as a CSS `rgb(...)` colour string. */
export function turboCss(t: number): string {
  const [r, g, b] = turbo(t);
  return `rgb(${r}, ${g}, ${b})`;
}
