import { describe, expect, it } from "vitest";

import { defaultRegister, registerMetrics } from "./outputRegister";

describe("defaultRegister", () => {
  it("defaultRegister — 500 px — paper", () => {
    const register = defaultRegister(500);

    expect(register).toBe("paper");
  });

  it("defaultRegister — 1400 px — studio", () => {
    const register = defaultRegister(1400);

    expect(register).toBe("studio");
  });
});

describe("registerMetrics", () => {
  it("registerMetrics — paper — sans, a measure, 24 px gaps", () => {
    const metrics = registerMetrics("paper");

    expect(metrics).toEqual({ measureCh: 72, cellGapPx: 24, family: "sans" });
  });

  it("registerMetrics — studio — mono, no measure", () => {
    const metrics = registerMetrics("studio");

    expect(metrics.family).toBe("mono");
    expect(metrics.measureCh).toBeNull();
  });
});
