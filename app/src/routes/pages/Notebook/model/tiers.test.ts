import { describe, expect, it } from "vitest";

import { chooseTier, MAX_TIER, pointBudget, tileRange } from "./tiers";

describe("chooseTier", () => {
  it("chooseTier — a whole 30-minute session at 800 Hz across 1200 px — picks the tier whose bucket count is nearest the pixel width", () => {
    const visibleSpanUs = 30 * 60 * 1_000_000;
    const pixelWidth = 1200;
    const sampleRateHz = 800;

    const tier = chooseTier(visibleSpanUs, pixelWidth, sampleRateHz);

    // 1,440,000 raw samples in the window. Bucket counts: tier 3 (512 raw
    // samples/bucket) -> 2812.5 buckets; tier 4 (4096 raw samples/bucket)
    // -> 351.6 buckets. |2812.5-1200| = 1612.5, |351.6-1200| = 848.4, so
    // tier 4 is nearer to the 1200px target than tier 3.
    expect(tier).toBe(4);
  });

  it("chooseTier — a window narrower than the pixel width in samples — returns tier 0 (raw)", () => {
    const visibleSpanUs = 1_000_000; // 1 second
    const pixelWidth = 1200;
    const sampleRateHz = 800; // 800 raw samples in the window, fewer than pixelWidth

    const tier = chooseTier(visibleSpanUs, pixelWidth, sampleRateHz);

    expect(tier).toBe(0);
  });

  it("chooseTier — a span so wide the ideal tier exceeds MAX_TIER — clamps to 10 (C3 §3.5)", () => {
    const visibleSpanUs = 1_000 * 365 * 24 * 60 * 60 * 1_000_000; // 1000 years
    const pixelWidth = 1200;
    const sampleRateHz = 800;

    const tier = chooseTier(visibleSpanUs, pixelWidth, sampleRateHz);

    expect(tier).toBe(MAX_TIER);
  });
});

describe("tileRange", () => {
  it("tileRange — a window entirely inside one tile — returns that single index for first and last", () => {
    // tier 0, TILE_SIZE_BUCKETS=1024 raw samples per tile, sampleRateHz=1000 -> 1024ms/tile.
    const sampleRateHz = 1000;
    const visibleStartUs = 1024_000 + 10_000; // 10ms into tile index 1
    const visibleEndUs = 1024_000 + 20_000; // 20ms into tile index 1

    const range = tileRange(visibleStartUs, visibleEndUs, 0, sampleRateHz);

    expect(range).toEqual({ first: 1, last: 1 });
  });

  it("tileRange — a window straddling a tile boundary — returns both indices", () => {
    const sampleRateHz = 1000;
    const visibleStartUs = 1024_000 - 10_000; // just before tile 1 starts (in tile 0)
    const visibleEndUs = 1024_000 + 10_000; // just after tile 1 starts (in tile 1)

    const range = tileRange(visibleStartUs, visibleEndUs, 0, sampleRateHz);

    expect(range).toEqual({ first: 0, last: 1 });
  });
});

describe("pointBudget", () => {
  it("pointBudget — a 1200 px chart on desktop — allows 2400 points", () => {
    const budget = pointBudget(1200, false);

    expect(budget).toBe(2400);
  });

  it("pointBudget — the same chart on mobile — allows strictly fewer points", () => {
    const desktopBudget = pointBudget(1200, false);
    const mobileBudget = pointBudget(1200, true);

    expect(mobileBudget).toBeLessThan(desktopBudget);
  });
});
