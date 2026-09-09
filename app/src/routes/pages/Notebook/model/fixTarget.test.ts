import { describe, expect, it } from "vitest";

import { fixTargetCellId } from "./fixTarget";

describe("fixTargetCellId", () => {
  it("a failed definition reference — opens the definition's own declaring cell, not the chart", () => {
    const target = fixTargetCellId({
      cellId: "chart-1",
      failedDefinitionName: "accel_mag_lp",
      definitionCellIds: new Map([["accel_mag_lp", "math-2"]]),
    });

    expect(target).toBe("math-2");
  });

  it("no failed definition name — opens the chart's own cell", () => {
    const target = fixTargetCellId({
      cellId: "chart-1",
      failedDefinitionName: null,
      definitionCellIds: new Map([["accel_mag_lp", "math-2"]]),
    });

    expect(target).toBe("chart-1");
  });

  it("a failed name that is not actually a declared definition (a plain unknown channel) — opens the chart's own cell, since there is no other cell to point at", () => {
    const target = fixTargetCellId({
      cellId: "chart-1",
      failedDefinitionName: "HR_BPM",
      definitionCellIds: new Map([["accel_mag_lp", "math-2"]]),
    });

    expect(target).toBe("chart-1");
  });
});
