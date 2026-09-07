import { describe, expect, it } from "vitest";

import { emphasisClasses, type Emphasis } from "./emphasis";

describe("emphasisClasses — every emphasis, filled and outline — a distinct class string", () => {
  it("no two (emphasis, filled) pairs produce the same class string", () => {
    // Arrange
    const emphases: Emphasis[] = ["normal", "accent", "good", "hivis", "info"];

    // Act
    const classStrings = emphases.flatMap((e) => [emphasisClasses(e, true), emphasisClasses(e, false)]);

    // Assert
    expect(new Set(classStrings).size).toBe(classStrings.length);
  });
});

describe("emphasisClasses — accent filled — carries the --accent token class", () => {
  it("returns a class string referencing the brand-accent token, not shadcn's own accent", () => {
    // Arrange
    const emphasis: Emphasis = "accent";

    // Act
    const classes = emphasisClasses(emphasis, true);

    // Assert
    expect(classes).toContain("brand-accent");
    expect(classes).not.toMatch(/(?<!brand-)accent/);
  });
});
