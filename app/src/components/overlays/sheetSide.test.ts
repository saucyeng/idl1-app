import { describe, expect, it } from "vitest";

import { sheetSideFor } from "./sheetSide";

describe("sheetSideFor — 599 px — bottom", () => {
  it("returns bottom just below the breakpoint", () => {
    // Arrange
    const widthPx = 599;

    // Act
    const side = sheetSideFor(widthPx);

    // Assert
    expect(side).toBe("bottom");
  });
});

describe("sheetSideFor — 600 px — right", () => {
  it("returns right at and above the breakpoint", () => {
    // Arrange
    const widthPx = 600;

    // Act
    const side = sheetSideFor(widthPx);

    // Assert
    expect(side).toBe("right");
  });
});
