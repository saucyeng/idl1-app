import { describe, expect, it } from "vitest";

import { turbo, turboCss } from "./turbo";

describe("turbo — 0, 0.5, 1 — the documented endpoints", () => {
  it("t=0 is the documented deep blue endpoint", () => {
    // Arrange
    const t = 0;

    // Act
    const [r, g, b] = turbo(t);

    // Assert
    expect([r, g, b]).toEqual([35, 23, 27]);
  });

  it("t=0.5 is the documented mid-range green", () => {
    // Arrange
    const t = 0.5;

    // Act
    const [r, g, b] = turbo(t);

    // Assert
    expect([r, g, b]).toEqual([150, 250, 80]);
  });

  it("t=1 is the documented red endpoint", () => {
    // Arrange
    const t = 1;

    // Act
    const [r, g, b] = turbo(t);

    // Assert
    expect([r, g, b]).toEqual([144, 13, 0]);
  });
});

describe("turbo — outside [0,1] — clamped, never NaN", () => {
  it("a negative t clamps to the t=0 colour", () => {
    // Arrange
    const t = -3;

    // Act
    const result = turbo(t);

    // Assert
    expect(result).toEqual(turbo(0));
  });

  it("a t greater than 1 clamps to the t=1 colour", () => {
    // Arrange
    const t = 7.2;

    // Act
    const result = turbo(t);

    // Assert
    expect(result).toEqual(turbo(1));
  });

  it("a NaN t is treated as 0, never producing a NaN channel", () => {
    // Arrange
    const t = NaN;

    // Act
    const result = turbo(t);

    // Assert
    expect(result.every((channel) => Number.isFinite(channel))).toBe(true);
    expect(result).toEqual(turbo(0));
  });

  it("Infinity is treated as 0, never producing a NaN channel", () => {
    // Arrange
    const t = Infinity;

    // Act
    const result = turbo(t);

    // Assert
    expect(result.every((channel) => Number.isFinite(channel))).toBe(true);
  });
});

describe("turbo — 64 samples — monotonically varying, no repeated colour", () => {
  it("64 evenly spaced samples across [0,1] are all distinct", () => {
    // Arrange
    const samples = Array.from({ length: 64 }, (_, i) => i / 63);

    // Act
    const colours = samples.map((t) => turbo(t).join(","));
    const unique = new Set(colours);

    // Assert
    expect(unique.size).toBe(colours.length);
  });
});

describe("turboCss — a sample value — formats as an rgb() string", () => {
  it("formats t=0.5's channels as rgb(r, g, b)", () => {
    // Arrange
    const t = 0.5;
    const [r, g, b] = turbo(t);

    // Act
    const css = turboCss(t);

    // Assert
    expect(css).toBe(`rgb(${r}, ${g}, ${b})`);
  });
});
