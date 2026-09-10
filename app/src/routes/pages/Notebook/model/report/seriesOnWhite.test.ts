import { describe, expect, it } from "vitest";

import { SERIES_ON_WHITE, WHITE_CONTRAST_TARGET } from "./seriesOnWhite";

/** One channel of an sRGB colour (0–255) to its linearised value, the WCAG
 *  2.x relative-luminance step (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance,
 *  reimplemented here rather than imported so this test does not just call
 *  back into the module it is checking). */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** A hex colour's WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = linearise((n >> 16) & 255);
  const g = linearise((n >> 8) & 255);
  const b = linearise(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two hex colours — always >= 1, the
 *  lighter's luminance (+0.05) over the darker's (WCAG 2.x formula). */
function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA) + 0.05;
  const lumB = relativeLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

// Ruling R186: the one place these eight values are checked. Print
// (`printPalette.ts`) and light paper (`paperPalette.ts`) both re-export
// this array, so neither needs its own copy of this test.
describe("SERIES_ON_WHITE — all eight — each meets the stated contrast ratio against white", () => {
  it.each(SERIES_ON_WHITE.map((colour, index) => [index, colour] as const))(
    "slot %i (%s) contrasts white at or above WHITE_CONTRAST_TARGET",
    (_index, colour) => {
      // Arrange
      const white = "#ffffff";

      // Act
      const ratio = contrastRatio(colour, white);

      // Assert
      expect(ratio).toBeGreaterThanOrEqual(WHITE_CONTRAST_TARGET);
    },
  );

  it("there are exactly eight, one per --chart-N slot", () => {
    // Arrange & Act
    const count = SERIES_ON_WHITE.length;

    // Assert
    expect(count).toBe(8);
  });
});
