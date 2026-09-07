import { describe, expect, it } from "vitest";

import { resolveRegister, themeAttribute } from "./theme";

describe("themeAttribute", () => {
  it("themeAttribute — dark — \"dark\"", () => {
    // Arrange
    const choice = "dark" as const;

    // Act
    const attribute = themeAttribute(choice, false);

    // Assert
    expect(attribute).toBe("dark");
  });

  it("themeAttribute — system with prefersLight true — null until light tokens exist", () => {
    // Arrange
    const choice = "system" as const;

    // Act
    const attribute = themeAttribute(choice, true);

    // Assert
    expect(attribute).toBeNull();
  });

  it("themeAttribute — system with prefersLight false — \"dark\" (no light tokens to fall back to)", () => {
    // Arrange
    const choice = "system" as const;

    // Act
    const attribute = themeAttribute(choice, false);

    // Assert
    expect(attribute).toBe("dark");
  });
});

describe("resolveRegister", () => {
  it("resolveRegister — no stored choice at 400 px — paper", () => {
    // Arrange
    const stored = null;

    // Act
    const register = resolveRegister(stored, 400);

    // Assert
    expect(register).toBe("paper");
  });

  it("resolveRegister — no stored choice at 1600 px — studio", () => {
    // Arrange
    const stored = null;

    // Act
    const register = resolveRegister(stored, 1600);

    // Assert
    expect(register).toBe("studio");
  });

  it("resolveRegister — a stored choice at any width — the stored value", () => {
    // Arrange
    const storedPaper = "paper" as const;
    const storedStudio = "studio" as const;

    // Act
    const atNarrow = resolveRegister(storedStudio, 400);
    const atWide = resolveRegister(storedPaper, 1600);

    // Assert
    expect(atNarrow).toBe("studio");
    expect(atWide).toBe("paper");
  });
});
