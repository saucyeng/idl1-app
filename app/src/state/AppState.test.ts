import { describe, expect, it } from "vitest";
import { appStateReducer, initialAppState } from "./AppState";

describe("appStateReducer", () => {
  it("NAVIGATE action — changes only the route field", () => {
    // Arrange
    const state = { ...initialAppState, engineVersion: "0.1.0" };

    // Act
    const next = appStateReducer(state, { type: "NAVIGATE", route: "device" });

    // Assert
    expect(next.route).toBe("device");
    expect(next.engineVersion).toBe("0.1.0");
  });

  it("SET_ENGINE_VERSION action — sets the field, leaves route unchanged", () => {
    // Arrange
    const state = { ...initialAppState, route: "data" as const };

    // Act
    const next = appStateReducer(state, { type: "SET_ENGINE_VERSION", version: "0.2.0" });

    // Assert
    expect(next.engineVersion).toBe("0.2.0");
    expect(next.route).toBe("data");
  });
});
