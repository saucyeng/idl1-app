import { describe, expect, it } from "vitest";

import { unitSummary } from "./units";

describe("unitSummary", () => {
  it("unitSummary — imperial — speed mph, distance ft/mi, pressure psi, temperature °F", () => {
    // Arrange
    const system = "imperial" as const;

    // Act
    const summary = unitSummary(system);

    // Assert
    expect(summary.speed).toBe("mph");
    expect(summary.distance).toBe("ft/mi");
    expect(summary.pressure).toBe("psi");
    expect(summary.temperature).toBe("°F");
  });

  it("unitSummary — metric — speed km/h, distance m/km, pressure kPa, temperature °C", () => {
    // Arrange
    const system = "metric" as const;

    // Act
    const summary = unitSummary(system);

    // Assert
    expect(summary.speed).toBe("km/h");
    expect(summary.distance).toBe("m/km");
    expect(summary.pressure).toBe("kPa");
    expect(summary.temperature).toBe("°C");
  });

  it("unitSummary — either system — every field is non-empty (no half-filled table)", () => {
    // Arrange
    const systems = ["imperial", "metric"] as const;

    // Act
    const summaries = systems.map((system) => unitSummary(system));

    // Assert
    for (const summary of summaries) {
      for (const value of Object.values(summary)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("unitSummary — the two systems — differ in every field, so the toggle always visibly does something", () => {
    // Arrange
    const imperial = unitSummary("imperial");
    const metric = unitSummary("metric");

    // Act
    const keys = Object.keys(imperial) as (keyof typeof imperial)[];

    // Assert
    for (const key of keys) {
      expect(imperial[key]).not.toBe(metric[key]);
    }
  });
});
