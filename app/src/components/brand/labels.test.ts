import { describe, expect, it } from "vitest";

import { abbreviateLabel, unabbreviated } from "./labels";

describe("abbreviateLabel — IMPERIAL at 8 chars — IMP", () => {
  it("shortens a known long label to its abbreviation", () => {
    // Arrange
    const label = "IMPERIAL";
    const maxChars = 8;

    // Act
    const result = abbreviateLabel(label, maxChars);

    // Assert
    expect(result).toBe("IMP");
  });
});

describe("abbreviateLabel — a short label — unchanged", () => {
  it("returns the label as-is when it already fits", () => {
    // Arrange
    const label = "SPEED";
    const maxChars = 8;

    // Act
    const result = abbreviateLabel(label, maxChars);

    // Assert
    expect(result).toBe("SPEED");
  });
});

describe("abbreviateLabel — an unknown long label — unchanged and listed by unabbreviated", () => {
  it("leaves an unknown long label untouched", () => {
    // Arrange
    const label = "SUSPENSION";
    const maxChars = 8;

    // Act
    const result = abbreviateLabel(label, maxChars);

    // Assert
    expect(result).toBe("SUSPENSION");
  });

  it("reports the same label from unabbreviated for table extension", () => {
    // Arrange
    const labels = ["SUSPENSION", "SPEED", "IMPERIAL"];
    const maxChars = 8;

    // Act
    const gaps = unabbreviated(labels, maxChars);

    // Assert
    expect(gaps).toEqual(["SUSPENSION"]);
  });
});
