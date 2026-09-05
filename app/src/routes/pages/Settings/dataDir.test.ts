import { describe, expect, it } from "vitest";

import { describeOverrideChange, validateDataDir } from "./dataDir";

describe("validateDataDir", () => {
  it("validateDataDir — an empty string — one issue: a path is required", () => {
    // Arrange
    const path = "";

    // Act
    const issues = validateDataDir(path);

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/path is required/i);
  });

  it("validateDataDir — a relative path — one issue naming the requirement that it be absolute", () => {
    // Arrange
    const path = "race-data";

    // Act
    const issues = validateDataDir(path);

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/absolute/i);
  });

  it("validateDataDir — a Windows path with a drive letter — no issues", () => {
    // Arrange
    const path = "D:\\race-data";

    // Act
    const issues = validateDataDir(path);

    // Assert
    expect(issues).toHaveLength(0);
  });

  it("validateDataDir — a POSIX path starting with \"/\" — no issues", () => {
    // Arrange
    const path = "/home/isaac/race-data";

    // Act
    const issues = validateDataDir(path);

    // Assert
    expect(issues).toHaveLength(0);
  });

  it("validateDataDir — a path with trailing whitespace — one issue: it would create a differently-named directory", () => {
    // Arrange
    const path = "D:\\race-data ";

    // Act
    const issues = validateDataDir(path);

    // Assert
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toMatch(/differently-named directory/i);
  });
});

describe("describeOverrideChange", () => {
  it("describeOverrideChange — an old and a new path — the sentence names both and says the old data stays put (C4 §1)", () => {
    // Arrange
    const oldPath = "D:\\race-data";
    const newPath = "E:\\race-data-2";

    // Act
    const text = describeOverrideChange(oldPath, newPath);

    // Assert
    expect(text).toContain(oldPath);
    expect(text).toContain(newPath);
    expect(text).toMatch(/not moved/i);
    expect(text).toMatch(/restart/i);
  });

  it("describeOverrideChange — no previous override (null) — the sentence names the platform default as what is being left behind", () => {
    // Arrange
    const newPath = "E:\\race-data-2";

    // Act
    const text = describeOverrideChange(null, newPath);

    // Assert
    expect(text).toMatch(/platform default/i);
    expect(text).toContain(newPath);
  });
});
