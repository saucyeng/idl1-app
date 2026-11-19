import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";

/** Props for {@link PlotBox}. */
export interface PlotBoxProps {
  /** Builds the chart for a width in CSS pixels. */
  make: (width: number) => (SVGSVGElement | HTMLElement) & Plot.Plot;
  /** Rebuilds when any of these change. */
  deps: readonly unknown[];
  /** Called with the chart after each build (to read its scales). */
  onChart?: (chart: Plot.Plot | null) => void;
  className?: string;
}

/**
 * An Observable Plot chart in the app chrome (outside the notebook sandbox):
 * built once per data change at the container's width, never per animation
 * frame. A cursor over it is the caller's own overlay.
 */
export function PlotBox({ make, deps, onChart, className }: PlotBoxProps) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const build = () => {
      const chart = make(Math.max(200, el.clientWidth));
      el.replaceChildren(chart);
      onChart?.(chart);
    };
    build();
    const ro = new ResizeObserver(() => build());
    ro.observe(el);
    return () => {
      ro.disconnect();
      onChart?.(null);
    };
    // the caller names what the chart depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div ref={host} className={className} />;
}

/** Plot styles shared by the Simulate charts: transparent, app text colour. */
export const PLOT_STYLE = { background: "transparent", color: "var(--fg)", fontSize: "11px", overflow: "visible" } as const;
