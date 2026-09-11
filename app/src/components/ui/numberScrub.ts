/**
 * Drag-to-scrub arithmetic for {@link import("./number-field").NumberField}
 * (ruling R212 item 5: "labelled number inputs with unit suffix and
 * drag-to-scrub").
 *
 * Separated from the component because it is the only part of a scrub that
 * can be wrong: how far a drag moves a value, how a modifier changes that,
 * and how the result is snapped and clamped. The component owns the pointer
 * capture and the cursor; this owns the number.
 *
 * Pure and dependency-free — no `react`, no DOM.
 */

/** How a modifier key scales a drag. Shift is the fine control (a tenth of
 *  a step per pixel), Alt the coarse one (ten steps) — the convention CAD
 *  and DAW value sliders share, so a user who has met one has met this. */
export const SCRUB_FINE_FACTOR = 0.1;
export const SCRUB_COARSE_FACTOR = 10;

/** Canvas pixels of horizontal drag that advance the value by one `step`. */
export const SCRUB_PIXELS_PER_STEP = 4;

/** The bounds and granularity a scrub respects — the same three attributes
 *  the underlying `<input type="number">` carries, so the keyboard and the
 *  drag can never disagree about what is a legal value. */
export interface ScrubRange {
  /** The increment one step moves. Must be > 0; a non-positive or absent
   *  step reads as 1. */
  step?: number;
  min?: number;
  max?: number;
}

/** Which modifier, if any, the pointer is carrying. */
export interface ScrubModifiers {
  shiftKey?: boolean;
  altKey?: boolean;
}

/** `value` clamped into `[min, max]`. */
function clamp(value: number, range: ScrubRange): number {
  if (range.min !== undefined && value < range.min) return range.min;
  if (range.max !== undefined && value > range.max) return range.max;
  return value;
}

/** `value` rounded to the decimal places `step` is written with, so a
 *  0.1-step field shows `0.3` and not `0.30000000000000004`. */
function tidy(value: number, step: number): number {
  return Number(value.toFixed(decimalPlaces(step)));
}

/**
 * `value` snapped to `range.step` measured from `range.min` (or from zero
 * when there is no minimum), then clamped into `[min, max]`.
 *
 * **Not** what a scrub applies: a field whose current value sits off the
 * grid (a hand-typed 100 in a 256-step FFT field) must not be yanked onto
 * it by a one-step drag. Offered for callers that genuinely want a value on
 * the grid — a "snap" command, or a control whose whole range is enumerable.
 */
export function snapToRange(value: number, range: ScrubRange): number {
  const step = range.step !== undefined && range.step > 0 ? range.step : 1;
  const origin = range.min ?? 0;
  return clamp(tidy(origin + Math.round((value - origin) / step) * step, step), range);
}

/** How many decimal places `step` is written with — 2 for 0.05, 0 for 10. */
function decimalPlaces(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  if (dot === -1) return 0;
  // An exponential like 1e-7 has no literal decimals to count; cap at the
  // precision a properties field could plausibly need.
  if (text.includes("e") || text.includes("E")) return 10;
  return Math.min(text.length - dot - 1, 10);
}

/**
 * The value a scrub should commit, given where it started and how far the
 * pointer has travelled.
 *
 * Always computed from the drag's **origin**, never from the last frame's
 * result: accumulating per-frame deltas drifts, and dragging back to where
 * the pointer started would then not return the value it started at.
 *
 * The result is the origin plus a whole number of steps, tidied to the
 * step's decimal places and clamped — deliberately *not* snapped onto a
 * grid (see {@link snapToRange}), so a field holding a hand-typed value off
 * the step grid keeps its offset while being scrubbed.
 *
 * @param startValue The value when the pointer went down.
 * @param dx Horizontal travel since then, in CSS pixels. Right is up.
 * @param range The field's step and bounds.
 * @param modifiers Shift for fine, Alt for coarse; neither for one step per {@link SCRUB_PIXELS_PER_STEP} pixels.
 */
export function scrubValue(startValue: number, dx: number, range: ScrubRange, modifiers: ScrubModifiers = {}): number {
  const step = range.step !== undefined && range.step > 0 ? range.step : 1;
  const factor = modifiers.shiftKey === true ? SCRUB_FINE_FACTOR : modifiers.altKey === true ? SCRUB_COARSE_FACTOR : 1;
  const steps = Math.round(dx / SCRUB_PIXELS_PER_STEP);
  const effectiveStep = step * factor;
  return clamp(tidy(startValue + steps * effectiveStep, effectiveStep), range);
}
