import { describe, expect, it } from "vitest";

import { buildPaperPalette, paperScheme, PAPER_LIGHT_CONTRAST_TARGET, PAPER_LIGHT_SERIES_COLOURS } from "./paperPalette";

/** A reader standing in for the app's live dark tokens. */
function appTokens(name: string): string {
  const chart = /^--chart-([1-8])$/.exec(name);
  if (chart !== null) return `app-colour-${chart[1]}`;
  return `app-${name}`;
}

/** One channel's sRGB relative luminance term (WCAG 2.x). */
function channelLuminance(component: number): number {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x contrast ratio of `hex` against white. */
function contrastAgainstWhite(hex: string): number {
  const r = channelLuminance(parseInt(hex.slice(1, 3), 16));
  const g = channelLuminance(parseInt(hex.slice(3, 5), 16));
  const b = channelLuminance(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

describe("paperScheme", () => {
  it("paperScheme — light — light", () => {
    expect(paperScheme("light")).toBe("light");
  });

  it("paperScheme — dark — dark", () => {
    expect(paperScheme("dark")).toBe("dark");
  });

  it("paperScheme — app — dark, the only authored app palette", () => {
    expect(paperScheme("app")).toBe("dark");
  });
});

describe("buildPaperPalette", () => {
  it("buildPaperPalette — app — the app's own live tokens", () => {
    const palette = buildPaperPalette("app", appTokens);

    expect(palette.resolve("--chart-2")).toBe("app-colour-2");
  });

  it("buildPaperPalette — dark — the app's own live tokens", () => {
    const palette = buildPaperPalette("dark", appTokens);

    expect(palette.seriesColours[0]).toBe("app-colour-1");
  });

  it("buildPaperPalette — light — this module's own colours, not the app's", () => {
    const palette = buildPaperPalette("light", appTokens);

    expect(palette.seriesColours).toEqual(PAPER_LIGHT_SERIES_COLOURS);
  });

  it("buildPaperPalette — light — a white plot background, whatever the app tokens say", () => {
    const palette = buildPaperPalette("light", appTokens);

    expect(palette.theme.style).toMatchObject({ background: "white" });
  });

  it("buildPaperPalette — light, a --chart-N token — that slot's light colour", () => {
    const palette = buildPaperPalette("light", appTokens);

    expect(palette.resolve("--chart-8")).toBe(PAPER_LIGHT_SERIES_COLOURS[7]);
  });

  it("buildPaperPalette — light, a token this codebase never emits — the text colour", () => {
    const palette = buildPaperPalette("light", appTokens);

    expect(palette.resolve("--chart-9")).toBe("currentColor");
  });
});

describe("PAPER_LIGHT_SERIES_COLOURS", () => {
  it("PAPER_LIGHT_SERIES_COLOURS — every slot — one colour per chart token", () => {
    expect(PAPER_LIGHT_SERIES_COLOURS).toHaveLength(8);
  });

  it("PAPER_LIGHT_SERIES_COLOURS — against white — every colour clears the contrast target", () => {
    const ratios = PAPER_LIGHT_SERIES_COLOURS.map(contrastAgainstWhite);

    expect(ratios.every((ratio) => ratio >= PAPER_LIGHT_CONTRAST_TARGET)).toBe(true);
  });
});
