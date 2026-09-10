import { describe, expect, it } from "vitest";

import { buildPaperPalette, effectivePaperTheme, PAPER_LIGHT_CONTRAST_TARGET, PAPER_LIGHT_SERIES_COLOURS } from "./paperPalette";
import { SERIES_ON_WHITE, WHITE_CONTRAST_TARGET } from "./seriesOnWhite";

/** A reader standing in for the app's live dark tokens. */
function appTokens(name: string): string {
  const chart = /^--chart-([1-8])$/.exec(name);
  if (chart !== null) return `app-colour-${chart[1]}`;
  return `app-${name}`;
}

describe("effectivePaperTheme", () => {
  it("effectivePaperTheme — paper forced light — light, whatever the app is", () => {
    const schemes = [effectivePaperTheme("dark", "light"), effectivePaperTheme("system", "light")];

    expect(schemes).toEqual(["light", "light"]);
  });

  it("effectivePaperTheme — paper forced dark — dark, whatever the app is", () => {
    const schemes = [effectivePaperTheme("dark", "dark"), effectivePaperTheme("system", "dark")];

    expect(schemes).toEqual(["dark", "dark"]);
  });

  it("effectivePaperTheme — paper follows the app, app dark — dark", () => {
    const scheme = effectivePaperTheme("dark", "app");

    expect(scheme).toBe("dark");
  });

  it("effectivePaperTheme — paper follows the app, app follows the OS — dark, since no light tokens exist", () => {
    const scheme = effectivePaperTheme("system", "app");

    expect(scheme).toBe("dark");
  });
});

describe("buildPaperPalette", () => {
  it("buildPaperPalette — dark — the app's own live tokens", () => {
    const palette = buildPaperPalette("dark", appTokens);

    expect(palette.resolve("--chart-2")).toBe("app-colour-2");
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
  it("PAPER_LIGHT_SERIES_COLOURS — its source — the same array print draws with (R186)", () => {
    const colours = PAPER_LIGHT_SERIES_COLOURS;

    expect(colours).toBe(SERIES_ON_WHITE);
  });

  it("PAPER_LIGHT_CONTRAST_TARGET — its source — the shared target", () => {
    const target = PAPER_LIGHT_CONTRAST_TARGET;

    expect(target).toBe(WHITE_CONTRAST_TARGET);
  });
});
