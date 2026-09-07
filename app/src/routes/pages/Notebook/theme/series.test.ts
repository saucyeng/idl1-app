import { describe, expect, it } from "vitest";

import { documentVars, MissingChartTokenError, seriesColor, seriesPalette } from "./series";

const STUB_PALETTE: Record<string, string> = {
  "--chart-1": "#5ba6f0",
  "--chart-2": "#35c46e",
  "--chart-3": "#f5d547",
  "--chart-4": "#e8964b",
  "--chart-5": "#b98ae6",
  "--chart-6": "#3fc9c0",
  "--chart-7": "#e86fa6",
  "--chart-8": "#e05a63",
};

const stubReader = (name: string) => STUB_PALETTE[name] ?? "";

describe("seriesColor — index 0..7 — the eight tokens in cycle order", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])("index %i resolves its own --chart-N token", (index) => {
    // Arrange
    const expected = STUB_PALETTE[`--chart-${index + 1}`];

    // Act
    const result = seriesColor(index, stubReader);

    // Assert
    expect(result).toBe(expected);
  });
});

describe("seriesColor — index 8 and 15 — wraps to 0 and 7", () => {
  it("index 8 wraps to index 0's colour", () => {
    // Arrange & Act
    const result = seriesColor(8, stubReader);

    // Assert
    expect(result).toBe(STUB_PALETTE["--chart-1"]);
  });

  it("index 15 wraps to index 7's colour", () => {
    // Arrange & Act
    const result = seriesColor(15, stubReader);

    // Assert
    expect(result).toBe(STUB_PALETTE["--chart-8"]);
  });
});

describe("seriesPalette — a reader returning empty strings — throws the documented error", () => {
  it("throws MissingChartTokenError naming the empty token, never a silently blank chart", () => {
    // Arrange
    const emptyReader = () => "";

    // Act & Assert
    expect(() => seriesPalette(emptyReader)).toThrow(MissingChartTokenError);
    expect(() => seriesPalette(emptyReader)).toThrow(/--chart-1/);
  });

  it("a full reader returns all eight colours in cycle order", () => {
    // Arrange & Act
    const palette = seriesPalette(stubReader);

    // Assert
    expect(palette).toEqual([
      "#5ba6f0",
      "#35c46e",
      "#f5d547",
      "#e8964b",
      "#b98ae6",
      "#3fc9c0",
      "#e86fa6",
      "#e05a63",
    ]);
  });
});

describe("documentVars — the document's computed root properties — reads through getComputedStyle", () => {
  // This project's vitest environment is "node" (no real DOM; jsdom is not
  // an installed dependency, and this task adds none). These tests stub the
  // two browser globals `documentVars` calls (`getComputedStyle`, and
  // `document` for the no-argument case) directly on `globalThis`, then
  // restore them — exercising the real function against a fake `Document`-
  // shaped object rather than reimplementing its logic in the test.
  const values: Record<string, string> = { "--chart-1": "#123456" };
  const stubGetComputedStyle = (el: unknown) =>
    ({
      getPropertyValue: (name: string) => (el === documentElementMarker ? (values[name] ?? "") : ""),
    }) as unknown as CSSStyleDeclaration;
  const documentElementMarker = { marker: "the-real-element" };

  it("calls getComputedStyle on the given document's documentElement", () => {
    // Arrange
    const fakeDoc = { documentElement: documentElementMarker } as unknown as Document;
    const globalWithStubs = globalThis as unknown as { getComputedStyle: typeof stubGetComputedStyle };
    const original = globalWithStubs.getComputedStyle;
    globalWithStubs.getComputedStyle = stubGetComputedStyle;

    try {
      // Act
      const read = documentVars(fakeDoc);
      const value = read("--chart-1");

      // Assert
      expect(value).toBe("#123456");
    } finally {
      globalWithStubs.getComputedStyle = original;
    }
  });

  it("defaults to the global document when no argument is given", () => {
    // Arrange
    const fakeDoc = { documentElement: documentElementMarker } as unknown as Document;
    const globalWithStubs = globalThis as unknown as {
      getComputedStyle: typeof stubGetComputedStyle;
      document: Document;
    };
    const originalGetComputedStyle = globalWithStubs.getComputedStyle;
    const originalDocument = globalWithStubs.document;
    globalWithStubs.getComputedStyle = stubGetComputedStyle;
    globalWithStubs.document = fakeDoc;

    try {
      // Act
      const read = documentVars();
      const value = read("--chart-1");

      // Assert
      expect(value).toBe("#123456");
    } finally {
      globalWithStubs.getComputedStyle = originalGetComputedStyle;
      globalWithStubs.document = originalDocument;
    }
  });
});
