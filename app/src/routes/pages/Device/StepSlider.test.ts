import { describe, expect, it } from "vitest";

import { nearestIndex } from "./StepSlider";

describe("nearestIndex", () => {
  const odr = [15, 30, 60, 120, 240, 480, 960, 1920, 3840, 7680];

  it("a value in the set — its own index", () => {
    expect(nearestIndex(odr, 480)).toBe(5);
  });

  it("a stale value off the set (833 Hz from an old config) — the nearest allowed value", () => {
    expect(odr[nearestIndex(odr, 833)]).toBe(960);
    expect(odr[nearestIndex(odr, 1)]).toBe(15);
  });
});
