import { describe, expect, it } from "vitest";

import { plotTheme } from "./plotTheme";

const STUB_VALUES: Record<string, string> = {
  "--bg": "#121412",
  "--fg-dim": "#9a968a",
  "--rule": "#353a32",
  "--font-mono": '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

const stubReader = (name: string) => STUB_VALUES[name] ?? "";

describe("plotTheme — a stub reader — grid and axis colours are the rule token, tick font is mono, no frame", () => {
  it("the grid line colour is the --rule token", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect(theme.grid).toBe(STUB_VALUES["--rule"]);
  });

  it("the tick/label font is the --font-mono stack", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect((theme.style as Partial<CSSStyleDeclaration> | undefined)?.fontFamily).toBe(STUB_VALUES["--font-mono"]);
  });

  it("draws no frame — no marks field at all", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect((theme as Record<string, unknown>).marks).toBeUndefined();
  });

  it("plot area background is the page background token, tick labels are --fg-dim", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect((theme.style as Partial<CSSStyleDeclaration> | undefined)?.background).toBe(STUB_VALUES["--bg"]);
    expect((theme.style as Partial<CSSStyleDeclaration> | undefined)?.color).toBe(STUB_VALUES["--fg-dim"]);
  });

  it("tick labels use tabular numerals at 11px", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect((theme.style as Partial<CSSStyleDeclaration> | undefined)?.fontVariantNumeric).toBe("tabular-nums");
    expect((theme.style as Partial<CSSStyleDeclaration> | undefined)?.fontSize).toBe("11px");
  });

  it("marginLeft is sized for six tabular digits (a fixed constant, not measured)", () => {
    // Arrange & Act
    const theme = plotTheme(stubReader);

    // Assert
    expect(theme.marginLeft).toBeGreaterThan(20);
    expect(theme.marginLeft).toBeLessThan(80);
  });
});
