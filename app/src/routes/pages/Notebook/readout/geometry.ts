/**
 * Geometry for the overlay readouts (video overlay spec §4, §7c): where a
 * gauge's needle points, which ticks it labels, where a g-g dot lands and
 * how its tail fades. Pure: no DOM. `draw.ts` turns these into SVG.
 *
 * Angles are degrees, clockwise from straight up (12 o'clock), so the
 * gauge reads like a dashboard dial: `-GAUGE_SWEEP_DEG / 2` at the minimum,
 * `+GAUGE_SWEEP_DEG / 2` at the maximum.
 */

/** The dial's total sweep, degrees. 240° leaves the bottom third open for
 *  the number, like a car's speedometer. */
export const GAUGE_SWEEP_DEG = 240;

/** The needle angle for `value` on a `[min, max]` dial, degrees clockwise
 *  from 12 o'clock, clamped to the dial's ends. `null` for a missing value
 *  or an empty range (`max <= min`): the gauge draws no needle. */
export function needleAngleDeg(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value) || !(max > min)) return null;
  const f = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return -GAUGE_SWEEP_DEG / 2 + f * GAUGE_SWEEP_DEG;
}

/** A point at `angleDeg` (clockwise from 12 o'clock) and radius `r` from
 *  `(cx, cy)`, in SVG coordinates (y down). */
export function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** An SVG path `d` for the arc of radius `r` about `(cx, cy)` from `a0Deg`
 *  to `a1Deg` (clockwise, `a1Deg >= a0Deg`). Empty for a zero-length arc. */
export function arcPath(cx: number, cy: number, r: number, a0Deg: number, a1Deg: number): string {
  if (!(a1Deg > a0Deg)) return "";
  const p0 = polar(cx, cy, r, a0Deg);
  const p1 = polar(cx, cy, r, a1Deg);
  const large = a1Deg - a0Deg > 180 ? 1 : 0;
  return `M${p0.x},${p0.y}A${r},${r} 0 ${large} 1 ${p1.x},${p1.y}`;
}

/** "Nice" tick values across `[min, max]`: steps of 1, 2 or 5 × 10ⁿ, the
 *  step whose tick count is closest to `target` (the finer one on a tie),
 *  every tick inside the range. `[]` for an empty range. */
export function gaugeTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
  const raw = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const ticksFor = (step: number): number[] => {
    const out: number[] = [];
    const first = Math.ceil(min / step - 1e-9) * step;
    for (let v = first; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
    return out;
  };
  let best: number[] = [];
  for (const m of [1, 2, 5, 10]) {
    const ticks = ticksFor(m * mag);
    if (best.length === 0 || Math.abs(ticks.length - target) < Math.abs(best.length - target)) best = ticks;
  }
  return best;
}

/** Ring radii, in the same units as `limit` (g), at every multiple of
 *  `step` up to and including `limit`. `[]` when either is not positive. */
export function ggRings(limit: number, step: number): number[] {
  if (!(limit > 0) || !(step > 0)) return [];
  const out: number[] = [];
  for (let k = 1; k * step <= limit + step * 1e-9; k++) out.push(Number((k * step).toPrecision(12)));
  return out;
}

/** Where `(x, y)` (g) lands on a g-g plot of radius `rPx` about `(cx, cy)`,
 *  `limit` g at the edge: x to the right, y up. A point beyond the edge is
 *  pulled in along its own direction to the edge, so a spike still shows
 *  its direction. `null` when either value is missing. */
export function ggPoint(
  x: number | null,
  y: number | null,
  limit: number,
  cx: number,
  cy: number,
  rPx: number
): { x: number; y: number } | null {
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || !(limit > 0)) return null;
  let u = x / limit;
  let v = y / limit;
  const m = Math.hypot(u, v);
  if (m > 1) {
    u /= m;
    v /= m;
  }
  return { x: cx + u * rPx, y: cy - v * rPx };
}

/** The tail point `k` frames back (`1..=count`) fades linearly from just
 *  under the dot's own opacity to nothing. */
export function tailOpacity(k: number, count: number): number {
  if (count <= 0 || k < 1 || k > count) return 0;
  return 1 - k / (count + 1);
}

/** The value formatted with `digits` decimals, or an en dash when missing. */
export function formatReadoutValue(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return value.toFixed(Math.max(0, Math.min(6, Math.floor(digits))));
}
