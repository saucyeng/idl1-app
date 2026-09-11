import { describe, expect, it } from "vitest";

import { getMemoryUse, memoryFraction, memoryLabel, publishMemoryUse, subscribeMemoryUse } from "./memoryBudget";

describe("memoryFraction", () => {
  it("fraction — bytes under the cap — is the ratio", () => {
    const fraction = memoryFraction(15_000_000, 30_000_000);

    expect(fraction).toBeCloseTo(0.5);
  });

  it("fraction — bytes over the cap — never exceeds one", () => {
    const fraction = memoryFraction(60_000_000, 30_000_000);

    expect(fraction).toBe(1);
  });

  it("fraction — a zero or non-finite cap — is zero rather than NaN or Infinity", () => {
    expect(memoryFraction(10, 0)).toBe(0);
    expect(memoryFraction(10, Number.NaN)).toBe(0);
    expect(memoryFraction(Number.NaN, 10)).toBe(0);
  });
});

describe("memoryLabel", () => {
  it("label — a partly full cache — names both sides of the ratio", () => {
    const label = memoryLabel({ usedBytes: 12_400_000, capBytes: 30_000_000, fraction: 0.41 });

    expect(label).toBe("Chart memory: 12.4 MB of 30.0 MB");
  });
});

describe("publishMemoryUse", () => {
  it("publish — a new percent bucket — notifies and updates the store", () => {
    let notified = 0;
    const stop = subscribeMemoryUse(() => (notified += 1));

    publishMemoryUse(3_000_000, 30_000_000);

    expect(notified).toBe(1);
    expect(getMemoryUse().fraction).toBeCloseTo(0.1);
    stop();
  });

  it("publish — a tile that does not move the whole percent — notifies nobody", () => {
    publishMemoryUse(3_000_000, 30_000_000);
    let notified = 0;
    const stop = subscribeMemoryUse(() => (notified += 1));

    publishMemoryUse(3_001_000, 30_000_000);

    expect(notified).toBe(0);
    stop();
  });

  it("publish — a changed cap at the same percent — still notifies", () => {
    publishMemoryUse(3_000_000, 30_000_000);
    let notified = 0;
    const stop = subscribeMemoryUse(() => (notified += 1));

    publishMemoryUse(6_000_000, 60_000_000);

    expect(notified).toBe(1);
    expect(getMemoryUse().capBytes).toBe(60_000_000);
    stop();
  });
});
