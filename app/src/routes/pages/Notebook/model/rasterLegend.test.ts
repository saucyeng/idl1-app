import { describe, expect, it } from "vitest";

import { buildLegendGradient, type RampStop } from "./rasterLegend";

// The engine's own Turbo endpoints (`idl_rs::colormap::turbo_rgba8` at
// t = 0.0 and t = 1.0, pinned by its tests) — used here as realistic stop
// values, never as a colour this module is expected to produce on its own.
const TURBO_MIN: RampStop = [35, 23, 27, 255];
const TURBO_MAX: RampStop = [144, 13, 0, 255];

/** Every `rgba(r, g, b, a)` colour appearing in a gradient string. */
function coloursIn(gradient: string): string[] {
  return gradient.match(/rgba\([^)]*\)/g) ?? [];
}

describe("buildLegendGradient", () => {
  it("buildLegendGradient — two stops — a left-to-right gradient from 0% to 100%", () => {
    // Arrange
    const stops: RampStop[] = [TURBO_MIN, TURBO_MAX];

    // Act
    const gradient = buildLegendGradient(stops);

    // Assert
    expect(gradient).toBe("linear-gradient(to right, rgba(35, 23, 27, 1) 0%, rgba(144, 13, 0, 1) 100%)");
  });

  it("buildLegendGradient — sixteen stops — one stop per colour at i/(n-1) percent", () => {
    // Arrange: sixteen distinguishable opaque stops, the count C3 §3.6 sends.
    const stops: RampStop[] = Array.from({ length: 16 }, (_, i) => [i * 16, i, 255 - i * 16, 255] as RampStop);

    // Act
    const gradient = buildLegendGradient(stops);

    // Assert
    expect(coloursIn(gradient ?? "")).toHaveLength(16);
    expect(gradient).toContain("rgba(0, 0, 255, 1) 0%");
    expect(gradient).toContain("rgba(240, 15, 15, 1) 100%");
    expect(gradient).toContain(`rgba(16, 1, 239, 1) ${(1 / 15) * 100}%`);
  });

  it("buildLegendGradient — any stop list — contains no colour that was not an input stop", () => {
    // Arrange: R177's whole point — the bar may only show colours the
    // engine handed it, never one this module invented.
    const stops: RampStop[] = Array.from({ length: 16 }, (_, i) => [i * 3, 200 - i * 4, i * 7, 255] as RampStop);
    const allowed = new Set(stops.map(([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a / 255})`));

    // Act
    const gradient = buildLegendGradient(stops);

    // Assert
    const used = coloursIn(gradient ?? "");
    expect(used).not.toHaveLength(0);
    for (const colour of used) {
      expect(allowed.has(colour)).toBe(true);
    }
  });

  it("buildLegendGradient — every input stop — appears in the gradient", () => {
    // Arrange
    const stops: RampStop[] = Array.from({ length: 16 }, (_, i) => [i * 3, 200 - i * 4, i * 7, 255] as RampStop);

    // Act
    const gradient = buildLegendGradient(stops) ?? "";

    // Assert — the bar drops none of the ramp it was given.
    for (const [r, g, b, a] of stops) {
      expect(gradient).toContain(`rgba(${r}, ${g}, ${b}, ${a / 255})`);
    }
  });

  it("buildLegendGradient — fewer than two stops — null rather than a degenerate bar", () => {
    // Act/Assert: one colour is not a gradient, and an empty list is no ramp
    // at all; the caller draws nothing rather than implying a range.
    expect(buildLegendGradient([])).toBeNull();
    expect(buildLegendGradient([TURBO_MIN])).toBeNull();
  });
});
