import { describe, expect, it } from "vitest";

import { rawUnitToLabel, unitLabelText } from "./unitLabel";

describe("rawUnitToLabel", () => {
  it("rawUnitToLabel — a non-empty C1 unit string — known, verbatim", () => {
    const label = rawUnitToLabel("mm");

    expect(label).toEqual({ state: "known", text: "mm" });
  });

  it("rawUnitToLabel — an empty C1 unit string — unknown, never dimensionless (R154 item 6: C1 never claims dimensionless)", () => {
    const label = rawUnitToLabel("");

    expect(label).toEqual({ state: "unknown", reason: "no unit recorded for this channel" });
  });
});

describe("unitLabelText", () => {
  it("unitLabelText — known — the unit text", () => {
    expect(unitLabelText({ state: "known", text: "km/h" })).toBe("km/h");
  });

  it("unitLabelText — dimensionless — empty string, not a placeholder", () => {
    expect(unitLabelText({ state: "dimensionless" })).toBe("");
  });

  it("unitLabelText — unknown — empty string, distinct from dimensionless only at the .state level a caller can still read", () => {
    expect(unitLabelText({ state: "unknown", reason: "no unit recorded for this channel" })).toBe("");
  });
});
