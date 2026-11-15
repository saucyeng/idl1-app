/**
 * The `Readout` host variable a cell calls (video overlay spec §7c): one
 * object per frame, built from that frame's `ReadoutFrame`, whose functions
 * return SVG. The host rebinds it each frame; only cells naming `Readout`
 * re-run (`sandbox/cellInputs.ts`). Rendering glue over the tested
 * `frame.ts` and `draw.ts`, so not unit-tested itself.
 */
import { drawGauge, drawGg, drawNumber } from "./draw";
import { gaugeView, ggView, numberView, type GaugeOptions, type GgOptions, type NumberOptions, type ReadoutFrame } from "./frame";

/** What a cell sees as `Readout`. */
export interface ReadoutModule {
  /** A dial for `name`. */
  gauge(name: string, opts?: GaugeOptions): SVGSVGElement;
  /** A large number for `name`. */
  number(name: string, opts?: NumberOptions): SVGSVGElement;
  /** A g-g plot of `x` (lateral, g) against `y` (longitudinal, g). */
  gg(x: string, y: string, opts?: GgOptions): SVGSVGElement;
}

/** `Readout` for one frame. */
export function readoutModule(frame: ReadoutFrame): ReadoutModule {
  return {
    gauge: (name, opts = {}) => drawGauge(gaugeView(frame, name, opts)),
    number: (name, opts = {}) => drawNumber(numberView(frame, name, opts)),
    gg: (x, y, opts = {}) => drawGg(ggView(frame, x, y, opts)),
  };
}
