import { describe, expect, it } from "vitest";

import { zoomToRect } from "./rectZoom";
import type { Viewport } from "../model/viewport";

describe("zoomToRect", () => {
  it("zoomToRect — a rectangle within the viewport — the exact time range under it", () => {
    const viewport: Viewport = { startUs: 0, endUs: 1000, pixelWidth: 100 };

    const next = zoomToRect(viewport, 20, 60);

    expect(next.startUs).toBeCloseTo(200);
    expect(next.endUs).toBeCloseTo(600);
    expect(next.pixelWidth).toBe(100);
  });

  it("zoomToRect — a rectangle not starting at the origin viewport — still the exact time range under it", () => {
    const viewport: Viewport = { startUs: 500, endUs: 1500, pixelWidth: 200 };

    const next = zoomToRect(viewport, 50, 150);

    // usPerPixel = 1000/200 = 5; x0=50 -> 500+250=750; x1=150 -> 500+750=1250
    expect(next.startUs).toBeCloseTo(750);
    expect(next.endUs).toBeCloseTo(1250);
  });
});
