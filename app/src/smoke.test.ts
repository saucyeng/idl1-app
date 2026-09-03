import { describe, expect, it } from "vitest";

describe("vitest wiring", () => {
  it("runs — trivially true — passes", () => {
    // Arrange
    const a = 1;

    // Act
    const b = a + 1;

    // Assert
    expect(b).toBe(2);
  });
});
