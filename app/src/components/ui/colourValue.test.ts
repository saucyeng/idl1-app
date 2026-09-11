import { describe, expect, it } from "vitest";

import { colourValueFor, tokenInColourValue } from "./colourValue";

describe("colourValueFor — a chart token — becomes a usable CSS colour", () => {
  it("wraps the token in var(), because a bare token name is not a colour", () => {
    // Act
    const value = colourValueFor("--chart-3");

    // Assert
    expect(value).toBe("var(--chart-3)");
  });
});

describe("tokenInColourValue — the stored string — reports which swatch is pressed", () => {
  it("a value written by the picker round-trips to its own token", () => {
    // Arrange
    const tokens = ["--chart-1", "--chart-4", "--chart-8"];

    // Act
    const roundTripped = tokens.map((token) => tokenInColourValue(colourValueFor(token)));

    // Assert
    expect(roundTripped).toEqual(tokens);
  });

  it("a value no swatch can represent presses none of them", () => {
    // Arrange
    const foreign = ["red", "#ff0000", "var(--fg)", "var(--chart-9)", "", undefined];

    // Act
    const tokens = foreign.map(tokenInColourValue);

    // Assert
    expect(tokens).toEqual(["", "", "", "", "", ""]);
  });
});
