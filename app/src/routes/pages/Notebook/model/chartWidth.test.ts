import { describe, expect, it } from "vitest";

import {
  CHART_WIDTH_QUANTUM_PX,
  DEFAULT_CHART_WIDTH_PX,
  MAX_CHART_WIDTH_PX,
  MIN_CHART_WIDTH_PX,
  chartWidthNeedsRefetch,
  resolveChartWidthPx,
} from "./chartWidth";

describe("resolveChartWidthPx", () => {
  it("nothing measured yet — the first render — is the documented default, never zero", () => {
    expect(resolveChartWidthPx(null)).toBe(DEFAULT_CHART_WIDTH_PX);
  });

  it("a hidden column reporting no width — zero — keeps the default rather than fetching a blank chart", () => {
    expect(resolveChartWidthPx(0)).toBe(DEFAULT_CHART_WIDTH_PX);
  });

  it("an unusable measurement — NaN from a detached element — keeps the default", () => {
    expect(resolveChartWidthPx(Number.NaN)).toBe(DEFAULT_CHART_WIDTH_PX);
  });

  it("an ordinary measurement — a fractional column width — snaps down to the quantum so it never exceeds its column", () => {
    const width = resolveChartWidthPx(812.7);

    expect(width).toBe(808);
    expect(width).toBeLessThanOrEqual(812.7);
    expect(width % CHART_WIDTH_QUANTUM_PX).toBe(0);
  });

  it("two measurements a fraction of a pixel apart — one drag frame — resolve to the same width, so no refetch", () => {
    expect(resolveChartWidthPx(812.7)).toBe(resolveChartWidthPx(812.4));
  });

  it("a column narrower than the floor — a collapsing pane — is held at the floor", () => {
    expect(resolveChartWidthPx(80)).toBe(MIN_CHART_WIDTH_PX);
  });

  it("a column wider than the ceiling — an ultrawide monitor — is held at the ceiling", () => {
    expect(resolveChartWidthPx(5000)).toBe(MAX_CHART_WIDTH_PX);
  });

  it("every resolved width — across the plausible range — is a usable multiple of the quantum", () => {
    for (let measured = 100; measured <= 3000; measured += 37) {
      const width = resolveChartWidthPx(measured);

      expect(width).toBeGreaterThanOrEqual(MIN_CHART_WIDTH_PX);
      expect(width).toBeLessThanOrEqual(MAX_CHART_WIDTH_PX);
      expect(width % CHART_WIDTH_QUANTUM_PX).toBe(0);
    }
  });
});

describe("chartWidthNeedsRefetch", () => {
  it("nothing fetched by this gate yet — the mount pass — does not re-fetch what the bind effect is already fetching", () => {
    const needed = chartWidthNeedsRefetch(null, DEFAULT_CHART_WIDTH_PX);

    expect(needed).toBe(false);
  });

  it("the first measurement landing wider than the default — the reported bug — re-fetches the tiles", () => {
    const measured = resolveChartWidthPx(1204.7);

    const needed = chartWidthNeedsRefetch(DEFAULT_CHART_WIDTH_PX, measured);

    expect(needed).toBe(true);
  });

  it("a drag frame that resolves to the width already fetched does not re-fetch", () => {
    const fetched = resolveChartWidthPx(812.4);

    const needed = chartWidthNeedsRefetch(fetched, resolveChartWidthPx(812.7));

    expect(needed).toBe(false);
  });

  it("a column toggle narrowing the notebook re-fetches at the narrower width, not only the wider one", () => {
    const needed = chartWidthNeedsRefetch(resolveChartWidthPx(1200), resolveChartWidthPx(800));

    expect(needed).toBe(true);
  });
});
