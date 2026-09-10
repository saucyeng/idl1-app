import { describe, expect, it } from "vitest";

import { buildScreenPalette } from "./screenPalette";

/** A reader standing in for a document with `tokens.css` loaded — every
 *  `--chart-N` distinct, so a wrong slot is visible in an assertion. */
function loadedTokens(name: string): string {
  const chart = /^--chart-([1-8])$/.exec(name);
  if (chart !== null) return `colour-${chart[1]}`;
  return `value-of-${name}`;
}

/** A document that never imported `tokens.css`: every custom property
 *  resolves to the empty string, which is what `getPropertyValue` returns
 *  for an unset property. */
function noTokens(): string {
  return "";
}

describe("buildScreenPalette", () => {
  it("buildScreenPalette — tokens loaded — eight series colours in slot order", () => {
    const palette = buildScreenPalette(loadedTokens);

    expect(palette.seriesColours).toEqual(["colour-1", "colour-2", "colour-3", "colour-4", "colour-5", "colour-6", "colour-7", "colour-8"]);
  });

  it("buildScreenPalette — tokens loaded — the theme reads the app's own tokens", () => {
    const palette = buildScreenPalette(loadedTokens);

    expect(palette.theme.grid).toBe("value-of---rule");
  });

  it("buildScreenPalette — a --chart-N token — that slot's colour", () => {
    const palette = buildScreenPalette(loadedTokens);

    expect(palette.resolve("--chart-3")).toBe("colour-3");
  });

  it("buildScreenPalette — a token this codebase never emits — the text colour", () => {
    const palette = buildScreenPalette(loadedTokens);

    expect(palette.resolve("--chart-9")).toBe("currentColor");
    expect(palette.resolve("nonsense")).toBe("currentColor");
  });

  it("buildScreenPalette — tokens.css not loaded — no throw, empty colours", () => {
    const palette = buildScreenPalette(noTokens);

    expect(palette.seriesColours).toEqual([]);
  });

  it("buildScreenPalette — tokens.css not loaded — every token resolves to the text colour", () => {
    const palette = buildScreenPalette(noTokens);

    expect(palette.resolve("--chart-1")).toBe("currentColor");
  });
});
