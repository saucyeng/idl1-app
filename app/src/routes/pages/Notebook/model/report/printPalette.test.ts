import { describe, expect, it } from "vitest";

import { plotTheme } from "../../theme/plotTheme";
import { buildPrintPalette, PRINT_CONTRAST_TARGET, PRINT_SERIES_COLOURS, resolvePrintColour } from "./printPalette";

/** Screen-theme stub values (`theme/plotTheme.test.ts`'s own stubs) — used
 *  only to prove the print theme is not equal to a live screen theme, never
 *  to assert what the print theme itself should contain. */
const SCREEN_STUB_VALUES: Record<string, string> = {
  "--bg": "#121412",
  "--fg-dim": "#9a968a",
  "--rule": "#353a32",
  "--font-mono": '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};
const screenStubReader = (name: string) => SCREEN_STUB_VALUES[name] ?? "";

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

describe("PRINT_SERIES_COLOURS — all eight — each meets the stated contrast ratio against white", () => {
  it.each(PRINT_SERIES_COLOURS.map((colour, index) => [index, colour] as const))(
    "slot %i (%s) contrasts white at or above PRINT_CONTRAST_TARGET",
    (_index, colour) => {
      // Arrange
      const white = "#ffffff";

      // Act
      const ratio = contrastRatio(colour, white);

      // Assert
      expect(ratio).toBeGreaterThanOrEqual(PRINT_CONTRAST_TARGET);
    },
  );

  it("there are exactly eight, one per --chart-N slot", () => {
    // Arrange & Act
    const count = PRINT_SERIES_COLOURS.length;

    // Assert
    expect(count).toBe(8);
  });
});

describe("resolvePrintColour — every --chart-1..8 token — resolves to its own print colour", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("--chart-%i resolves to PRINT_SERIES_COLOURS[%i - 1]", (slot) => {
    // Arrange
    const token = `--chart-${slot}`;

    // Act
    const resolved = resolvePrintColour(token);

    // Assert
    expect(resolved).toBe(PRINT_SERIES_COLOURS[slot - 1]);
  });
});

describe("resolvePrintColour — an unknown or malformed token — falls back without throwing", () => {
  it.each(["--chart-0", "--chart-9", "--not-a-chart-token", "", "--chart-", "--chart-1x"])(
    "%j does not throw and returns a defined fallback colour",
    (token) => {
      // Arrange & Act
      const resolve = () => resolvePrintColour(token);

      // Assert
      expect(resolve).not.toThrow();
      expect(typeof resolve()).toBe("string");
      expect(resolve().length).toBeGreaterThan(0);
    },
  );

  it("every malformed token resolves to the same fallback colour", () => {
    // Arrange & Act
    const a = resolvePrintColour("--not-a-chart-token");
    const b = resolvePrintColour("");

    // Assert
    expect(a).toBe(b);
  });
});

describe("buildPrintPalette — one call — bundles theme, series colours and resolver together", () => {
  it("seriesColours matches PRINT_SERIES_COLOURS exactly, in order", () => {
    // Arrange & Act
    const palette = buildPrintPalette();

    // Assert
    expect(palette.seriesColours).toEqual(PRINT_SERIES_COLOURS);
  });

  it("resolve is the same behaviour as the standalone resolvePrintColour function", () => {
    // Arrange
    const palette = buildPrintPalette();

    // Act & Assert
    for (let slot = 1; slot <= 8; slot++) {
      expect(palette.resolve(`--chart-${slot}`)).toBe(resolvePrintColour(`--chart-${slot}`));
    }
  });

  it("the print plot theme does not equal the screen's plotTheme output — no documentVars() on this path", () => {
    // Arrange
    const palette = buildPrintPalette();

    // Act
    const screenTheme = plotTheme(screenStubReader);

    // Assert
    expect(palette.theme).not.toEqual(screenTheme);
    expect((palette.theme.style as Partial<CSSStyleDeclaration> | undefined)?.color).not.toBe(
      (screenTheme.style as Partial<CSSStyleDeclaration> | undefined)?.color,
    );
    expect(palette.theme.grid).not.toBe(screenTheme.grid);
  });

  it("the print theme's axis text and grid contrast against white, unlike the dark screen theme's tokens", () => {
    // Arrange
    const palette = buildPrintPalette();
    const white = "#ffffff";
    const axisColour = (palette.theme.style as Partial<CSSStyleDeclaration> | undefined)?.color as string;
    const gridColour = palette.theme.grid as string;

    // Act
    const axisRatio = contrastRatio(axisColour, white);
    const gridIsDarkerThanMidGrey = relativeLuminance(gridColour) < relativeLuminance("#c0c0c0");

    // Assert — near-black axis text reads clearly on white paper.
    expect(axisRatio).toBeGreaterThanOrEqual(PRINT_CONTRAST_TARGET);
    // Assert — the grid is visible (not near-white) but still quiet.
    expect(gridIsDarkerThanMidGrey).toBe(true);
  });
});
