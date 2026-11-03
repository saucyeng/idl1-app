import { describe, expect, it } from "vitest";

import { sheetHeightClassFor, sheetSideFor } from "./sheetSide";

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

describe("sheetHeightClassFor — bottom — capped at the viewport", () => {
  it("caps a bottom sheet so its body scrolls instead of running off the top", () => {
    // Arrange
    const side = "bottom" as const;

    // Act
    const cls = sheetHeightClassFor(side);

    // Assert
    expect(cls).toBe("max-h-dvh");
  });
});

describe("sheetHeightClassFor — right — no cap", () => {
  it("adds nothing to a right-docked sheet, which is already full height", () => {
    // Arrange
    const side = "right" as const;

    // Act
    const cls = sheetHeightClassFor(side);

    // Assert
    expect(cls).toBe("");
  });
});
