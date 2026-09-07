import { describe, expect, it } from "vitest";

import { advanceViewportByTime, pixelXForTUs } from "./cursorFollow";
import type { Viewport } from "../model/viewport";

const VIEWPORT: Viewport = { startUs: 0, endUs: 1000, pixelWidth: 100 };

describe("pixelXForTUs", () => {
  it("pixelXForTUs — a time inside the viewport — its linear pixel position", () => {
    expect(pixelXForTUs(VIEWPORT, 250)).toBeCloseTo(25);
    expect(pixelXForTUs(VIEWPORT, 0)).toBeCloseTo(0);
    expect(pixelXForTUs(VIEWPORT, 1000)).toBeCloseTo(100);
  });

  it("pixelXForTUs — a time outside the viewport — null", () => {
    expect(pixelXForTUs(VIEWPORT, -1)).toBeNull();
    expect(pixelXForTUs(VIEWPORT, 1001)).toBeNull();
  });
});

describe("advanceViewportByTime", () => {
  it("advanceViewportByTime — a forward delta — the window shifts forward by exactly that delta", () => {
    const next = advanceViewportByTime(VIEWPORT, 500);

    expect(next.startUs).toBeCloseTo(500);
    expect(next.endUs).toBeCloseTo(1500);
    expect(next.pixelWidth).toBe(100);
  });

  it("advanceViewportByTime — the cursor's screen position is unchanged after the shift", () => {
    const tUs = 250;
    const before = pixelXForTUs(VIEWPORT, tUs)!;

    const next = advanceViewportByTime(VIEWPORT, 500);
    const after = pixelXForTUs(next, tUs + 500);

    expect(after).toBeCloseTo(before);
  });
});
