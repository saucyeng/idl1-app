/**
 * From one per-frame readout answer to what each readout draws (video
 * overlay spec §7c). A `ReadoutFrame` is what the host binds as `Readout`'s
 * data each frame: the latest `read_readout` answer plus the handle's units
 * and extents and the person's display units. The view builders below pick
 * a name's value, convert it for display (§7a) and resolve the gauge range
 * (typed, or the whole ride's exact extent). Pure: no DOM.
 */
import { applyConversion, displayConversion, type DisplayUnits } from "./units";
import type { GaugeView, GgView, NumberView } from "./draw";

/** The data `Readout` draws from on one frame. Every value is in the
 *  engine's units; conversion happens in the view builders. */
export interface ReadoutFrame {
  /** name -> nearest recorded sample at the cursor, `null` outside its span. */
  values: Record<string, number | null>;
  /** name -> `[k-1]` is the sample `k` frames back. */
  tail: Record<string, (number | null)[]>;
  /** name -> recorded unit label. */
  units: Record<string, string | null>;
  /** name -> exact [min, max] over the ride. */
  extent: Record<string, [number, number] | null>;
  /** The person's display units. */
  display: DisplayUnits;
}

/** A frame with nothing in it: every readout draws a dash. */
export const EMPTY_READOUT_FRAME: ReadoutFrame = {
  values: {},
  tail: {},
  units: {},
  extent: {},
  display: { distance: "km", temperature: "C" },
};

/** `Readout.gauge`'s options (spec §7c). `min`/`max` are in the channel's
 *  recorded unit; ignored when `range` is `"ride"`. */
export interface GaugeOptions {
  min?: number;
  max?: number;
  /** `"ride"`: the whole ride's exact extent instead of `min`/`max`. */
  range?: "ride";
  label?: string;
  digits?: number;
  style?: "speedo" | "tach";
  icon?: "heart";
}

/** `Readout.number`'s options (spec §7c). */
export interface NumberOptions {
  label?: string;
  digits?: number;
  icon?: "heart";
}

/** `Readout.gg`'s options (spec §7c). All in g except `tail_s`. */
export interface GgOptions {
  /** g at the edge; default 1.5. */
  limit?: number;
  /** Ring spacing, g; default 0.5. */
  rings?: number;
  /** Tail length, s; the host turns it into a point count. */
  tail_s?: number;
  label?: string;
}

/** The range a gauge shows before conversion, recorded units: the ride's
 *  extent for `range: "ride"` (falling back to `[0, 1]` with none), else
 *  `min`/`max` (each defaulting to 0 and 100). */
export function gaugeRange(frame: ReadoutFrame, name: string, opts: GaugeOptions): [number, number] {
  if (opts.range === "ride") return frame.extent[name] ?? [0, 1];
  return [opts.min ?? 0, opts.max ?? 100];
}

/** What a gauge on `name` draws this frame. */
export function gaugeView(frame: ReadoutFrame, name: string, opts: GaugeOptions): GaugeView {
  const c = displayConversion(frame.units[name] ?? null, frame.display);
  const [lo, hi] = gaugeRange(frame, name, opts);
  return {
    value: applyConversion(frame.values[name] ?? null, c),
    unit: c.unit,
    min: lo * c.scale + c.offset,
    max: hi * c.scale + c.offset,
    label: opts.label,
    digits: opts.digits ?? 0,
    style: opts.style ?? "speedo",
    icon: opts.icon,
  };
}

/** What a number on `name` draws this frame. */
export function numberView(frame: ReadoutFrame, name: string, opts: NumberOptions): NumberView {
  const c = displayConversion(frame.units[name] ?? null, frame.display);
  return {
    value: applyConversion(frame.values[name] ?? null, c),
    unit: c.unit,
    label: opts.label,
    digits: opts.digits ?? 0,
    icon: opts.icon,
  };
}

/** What a g-g on `x`, `y` draws this frame. g never converts. */
export function ggView(frame: ReadoutFrame, x: string, y: string, opts: GgOptions): GgView {
  return {
    x: frame.values[x] ?? null,
    y: frame.values[y] ?? null,
    tailX: frame.tail[x] ?? [],
    tailY: frame.tail[y] ?? [],
    limit: opts.limit ?? 1.5,
    rings: opts.rings ?? 0.5,
    label: opts.label,
  };
}
