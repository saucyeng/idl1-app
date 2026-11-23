/**
 * From one per-frame readout answer to what each readout draws (video
 * overlay spec §7c). A `ReadoutFrame` is what the host binds as `Readout`'s
 * data each frame: the latest `read_readout` answer plus the handle's units
 * and extents and the person's display units. The view builders below pick
 * a name's value, convert it for display (§7a) and resolve the gauge range
 * (typed, or the whole ride's exact extent). Pure: no DOM.
 */
import { applyConversion, displayConversion, type DisplayUnits } from "./units";
import type { GaugeView, GgView, NumberView, TraceSeries, TraceView } from "./draw";
import { heartRateZones } from "./geometry";

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
  /** Seconds between tail samples (one video frame); smoothing reads it. Absent: 1/30 s. */
  tail_step_s?: number;
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
  /** `"hr"`: heart-rate zones Z1–Z5 as shares of the dial's top (2026-11-23). */
  zones?: "hr";
  /** Average the value over this many seconds back, so a slow channel (GPS at 3 Hz) moves smoothly rather than in steps (2026-11-23). */
  smooth_s?: number;
}

/** `Readout.trace`'s options (2026-11-23): a line scrolling past, newest at the right. */
export interface TraceOptions {
  /** Seconds shown; default 8. The host reads it, like `tail_s`, to size the tail. */
  window_s?: number;
  /** Vertical range, the channel's recorded unit; ignored when `range` is `"ride"`. */
  min?: number;
  max?: number;
  range?: "ride";
  label?: string;
  digits?: number;
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
  /** A third channel shown as a bar beside the circle: vertical g in the frame it is computed in (2026-11-23). */
  vertical?: string;
  /** g at the bar's top; default 4. */
  vertical_limit?: number;
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
    value: applyConversion(smoothedValue(frame, name, opts.smooth_s ?? 0), c),
    unit: c.unit,
    min: lo * c.scale + c.offset,
    max: hi * c.scale + c.offset,
    label: opts.label,
    digits: opts.digits ?? 0,
    style: opts.style ?? "speedo",
    icon: opts.icon,
    zones: opts.zones === "hr" ? heartRateZones(lo * c.scale + c.offset, hi * c.scale + c.offset) : undefined,
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

/**
 * `name`'s value averaged over the last `smoothS` seconds of its tail (the
 * cursor's sample and the tail samples within that span), or the plain value
 * with no smoothing or no tail. Missing samples are skipped. Pure.
 */
export function smoothedValue(frame: ReadoutFrame, name: string, smoothS: number): number | null {
  const now = frame.values[name] ?? null;
  if (!(smoothS > 0)) return now;
  const step = frame.tail_step_s ?? 1 / 30;
  const k = Math.max(0, Math.round(smoothS / step));
  const samples = [now, ...(frame.tail[name] ?? []).slice(0, k)].filter((v): v is number => v !== null && Number.isFinite(v));
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/** What a g-g on `x`, `y` draws this frame. g never converts. */
export function ggView(frame: ReadoutFrame, x: string, y: string, opts: GgOptions): GgView {
  return {
    vertical: opts.vertical === undefined ? undefined : (frame.values[opts.vertical] ?? null),
    verticalLimit: opts.vertical_limit ?? 4,
    x: frame.values[x] ?? null,
    y: frame.values[y] ?? null,
    tailX: frame.tail[x] ?? [],
    tailY: frame.tail[y] ?? [],
    limit: opts.limit ?? 1.5,
    rings: opts.rings ?? 0.5,
    label: opts.label,
  };
}

/** A series' legend name: its channel name without the unit, and "Front"/"Rear" for travel. */
function seriesName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").replace(/ travel$/i, "");
}

/** What a trace on `names` (one or two, sharing the first's unit and range) draws this frame: each cursor value then its tail, converted. */
export function traceView(frame: ReadoutFrame, names: string | readonly string[], opts: TraceOptions): TraceView {
  const list = typeof names === "string" ? [names] : names;
  const name = list[0];
  const c = displayConversion(frame.units[name] ?? null, frame.display);
  const [lo, hi] = gaugeRange(frame, name, { min: opts.min, max: opts.max, range: opts.range });
  const series: TraceSeries[] = list.map((n) => {
    const value = applyConversion(frame.values[n] ?? null, c);
    return { samples: [value, ...(frame.tail[n] ?? []).map((v) => applyConversion(v, c))], value, name: seriesName(n) };
  });
  return {
    series,
    unit: c.unit,
    min: lo * c.scale + c.offset,
    max: hi * c.scale + c.offset,
    label: opts.label,
    digits: opts.digits ?? 0,
    windowS: opts.window_s ?? 8,
  };
}

/** `Readout.spectrogram`'s options (2026-11-23): `window_s` seconds of a session channel's spectrogram around the cursor, scrolling. */
export interface SpectrogramOptions {
  /** Seconds shown; default 6. */
  window_s?: number;
  /** Where the cursor sits: `"centre"` (default) shows the next half-window coming; `"end"` only what has passed. */
  cursor?: "centre" | "end";
  /** Frequency axis: `"log"` (default) or `"linear"`. */
  scale?: "log" | "linear";
  /** Bottom of a log axis, Hz; default 2. */
  fmin?: number;
  /** Top frequency shown, Hz; default the channel's Nyquist. */
  fmax?: number;
  label?: string;
}
