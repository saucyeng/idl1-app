/**
 * The `Readout` host variable a cell calls (video overlay spec §7c): one
 * object per frame, built from that frame's `ReadoutFrame`, whose functions
 * return SVG. The host rebinds it each frame; only cells naming `Readout`
 * re-run (`sandbox/cellInputs.ts`). Rendering glue over the tested
 * `frame.ts` and `draw.ts`, so not unit-tested itself.
 */
import { drawGauge, drawGg, drawNumber, drawSpectrogram, drawTrace } from "./draw";
import { gaugeView, ggView, numberView, traceView, type GaugeOptions, type GgOptions, type NumberOptions, type ReadoutFrame, type SpectrogramOptions, type TraceOptions } from "./frame";
import type { SpectroImage } from "./spectroSource";

/** What a cell sees as `Readout`. */
export interface ReadoutModule {
  /** A dial for `name`. */
  gauge(name: string, opts?: GaugeOptions): SVGSVGElement;
  /** A large number for `name`. */
  number(name: string, opts?: NumberOptions): SVGSVGElement;
  /** A g-g plot of `x` (lateral, g) against `y` (longitudinal, g). */
  gg(x: string, y: string, opts?: GgOptions): SVGSVGElement;
  /** A line of `name` scrolling past, the last `window_s` seconds. */
  trace(name: string, opts?: TraceOptions): SVGSVGElement;
  /** A spectrogram of session channel `name` scrolling past. Drawn on the overlay canvas and in export, where the host has fetched it; in a notebook cell it says so. */
  spectrogram(name: string, opts?: SpectrogramOptions): SVGSVGElement;
}

/** The host's spectrogram slices: `null` where it has none for `name`. */
export type SpectroLookup = (name: string, opts: SpectrogramOptions) => SpectroImage | null;

/** Seconds of a spectrogram strip ahead of the cursor for `opts`. */
export function spectroAheadS(opts: SpectrogramOptions): number {
  return opts.cursor === "end" ? 0 : (opts.window_s ?? 6) / 2;
}

/** `Readout` for one frame. */
export function readoutModule(frame: ReadoutFrame, spectro: SpectroLookup | null = null): ReadoutModule {
  return {
    gauge: (name, opts = {}) => drawGauge(gaugeView(frame, name, opts)),
    number: (name, opts = {}) => drawNumber(numberView(frame, name, opts)),
    gg: (x, y, opts = {}) => drawGg(ggView(frame, x, y, opts)),
    trace: (name, opts = {}) => drawTrace(traceView(frame, name, opts)),
    spectrogram: (name, opts = {}) =>
      drawSpectrogram({
        image: spectro?.(name, opts) ?? null,
        windowS: opts.window_s ?? 6,
        label: opts.label,
        note: spectro === null ? "Spectrogram shows on the overlay" : undefined,
      }),
  };
}
