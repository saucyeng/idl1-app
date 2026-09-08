import { describe, expect, it } from "vitest";

import { advanceForMode } from "./playbackMode";
import type { Viewport } from "../model/viewport";

const VIEWPORT: Viewport = { startUs: 1_000_000, endUs: 2_000_000, pixelWidth: 1000 };

describe("advanceForMode — cursor-fixed", () => {
  it("advanceForMode — cursor-fixed — pans by the delta, matching advanceViewportByTime", () => {
    const next = advanceForMode(VIEWPORT, 1_100_000, 100_000, "cursor-fixed");

    expect(next.startUs).toBe(1_100_000);
    expect(next.endUs).toBe(2_100_000);
  });

  it("advanceForMode — cursor-fixed — zero delta — unchanged", () => {
    const next = advanceForMode(VIEWPORT, 1_000_000, 0, "cursor-fixed");

    expect(next).toEqual(VIEWPORT);
  });
});

describe("advanceForMode — scroll-at-edge", () => {
  it("advanceForMode — scroll-at-edge — cursor still inside the viewport — unchanged", () => {
    const next = advanceForMode(VIEWPORT, 1_500_000, 50_000, "scroll-at-edge");

    expect(next).toEqual(VIEWPORT);
  });

  it("advanceForMode — scroll-at-edge — cursor exactly at the right edge — pages forward one viewport-width", () => {
    const next = advanceForMode(VIEWPORT, 2_000_000, 50_000, "scroll-at-edge");

    expect(next.startUs).toBe(2_000_000);
    expect(next.endUs).toBe(3_000_000);
  });

  it("advanceForMode — scroll-at-edge — a long frame gap skips two pages ahead — lands on the page containing the cursor, not one behind it", () => {
    const next = advanceForMode(VIEWPORT, 3_500_000, 2_500_000, "scroll-at-edge");

    expect(next.startUs).toBe(3_000_000);
    expect(next.endUs).toBe(4_000_000);
  });

  it("advanceForMode — scroll-at-edge — a zero-span viewport — returned unchanged, never an infinite loop", () => {
    const zeroSpan: Viewport = { startUs: 1_000_000, endUs: 1_000_000, pixelWidth: 1000 };

    const next = advanceForMode(zeroSpan, 5_000_000, 100_000, "scroll-at-edge");

    expect(next).toEqual(zeroSpan);
  });
});
