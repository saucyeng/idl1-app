import { describe, expect, it } from "vitest";

import { shapeOf } from "./portShape";

describe("shapeOf", () => {
  it("shapeOf — no value (not yet evaluated) — is unknown, never guessed", () => {
    expect(shapeOf(null)).toBe("unknown");
  });

  it("shapeOf — a single-sample result — is []", () => {
    expect(shapeOf({ length: 1, has_t: false })).toBe("[]");
  });

  it("shapeOf — a time series (has_t, length > 1) — is [t]", () => {
    expect(shapeOf({ length: 500, has_t: true })).toBe("[t]");
  });

  it("shapeOf — length > 1 with no time axis — is unknown, not a guessed [t]", () => {
    expect(shapeOf({ length: 500, has_t: false })).toBe("unknown");
  });
});
