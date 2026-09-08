import { describe, expect, it } from "vitest";

import { isXModeSelectable, resolveXMode, X_MODE_OPTIONS } from "./xMode";

describe("X_MODE_OPTIONS", () => {
  it("X_MODE_OPTIONS — time is selectable, no disabled reason", () => {
    const time = X_MODE_OPTIONS.find((o) => o.value === "time");

    expect(time?.disabledReason).toBeUndefined();
  });

  it("X_MODE_OPTIONS — distance is present and disabled with a non-empty reason (R136), never omitted", () => {
    const distance = X_MODE_OPTIONS.find((o) => o.value === "distance");

    expect(distance).toBeDefined();
    expect(distance?.disabledReason).toBeTruthy();
  });
});

describe("isXModeSelectable", () => {
  it("isXModeSelectable — time — true", () => {
    expect(isXModeSelectable("time")).toBe(true);
  });

  it("isXModeSelectable — distance — false (R136)", () => {
    expect(isXModeSelectable("distance")).toBe(false);
  });
});

describe("resolveXMode", () => {
  it("resolveXMode — null (nothing stored yet) — time", () => {
    expect(resolveXMode(null)).toBe("time");
  });

  it("resolveXMode — an unparsable/future value — time, not a crash or a guess", () => {
    expect(resolveXMode("distance-v2")).toBe("time");
  });

  it("resolveXMode — 'time' stored — time", () => {
    expect(resolveXMode("time")).toBe("time");
  });

  it("resolveXMode — 'distance' stored while still unselectable — clamped to time, never silently drawn as distance", () => {
    expect(resolveXMode("distance")).toBe("time");
  });
});
