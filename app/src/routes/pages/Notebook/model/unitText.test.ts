import { describe, expect, it } from "vitest";

import { formatRate, formatUnit } from "./unitText";

describe("formatUnit", () => {
  it("formatUnit — known — renders its text, no marker", () => {
    const display = formatUnit({ state: "known", text: "km/h" });

    expect(display).toEqual({ text: "km/h", unknownReason: null });
  });

  it("formatUnit — dimensionless — renders nothing, no marker", () => {
    const display = formatUnit({ state: "dimensionless" });

    expect(display).toEqual({ text: "", unknownReason: null });
  });

  it("formatUnit — unknown — renders nothing but names the reason", () => {
    const display = formatUnit({ state: "unknown", reason: "mixed operands" });

    expect(display).toEqual({ text: "", unknownReason: "mixed operands" });
  });
});

describe("formatRate", () => {
  it("formatRate — null (not applicable) — renders nothing, never \"unknown\"", () => {
    expect(formatRate(null)).toBeNull();
  });

  it("formatRate — a real rate — renders \"<n> Hz\"", () => {
    expect(formatRate(100)).toBe("100 Hz");
  });

  it("formatRate — a zero rate — still renders, not treated as absent", () => {
    expect(formatRate(0)).toBe("0 Hz");
  });
});
