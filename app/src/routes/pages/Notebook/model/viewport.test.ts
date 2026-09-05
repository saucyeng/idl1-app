import { describe, expect, it } from "vitest";

import { clampTo, panBy, transformFor, zoomAt, type Viewport } from "./viewport";

describe("panBy", () => {
  it("panBy — a drag of 100 px on a 1000 px wide 10 s window — moves the window by exactly 1 s", () => {
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };

    const result = panBy(viewport, 100);

    expect(result.endUs - result.startUs).toBe(10_000_000);
    expect(Math.abs(result.startUs - viewport.startUs)).toBe(1_000_000);
  });

  it("panBy — a drag past the session start — clamps at zero with the span preserved", () => {
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };

    const panned = panBy(viewport, 100);
    const clamped = clampTo(panned, 10_000_000);

    expect(clamped.startUs).toBe(0);
    expect(clamped.endUs - clamped.startUs).toBe(10_000_000);
  });
});

describe("clampTo", () => {
  // The brief's own `panBy`/`zoomAt` tests above only exercise `clampTo`'s
  // whole-session-clamp branch (a span already >= the session). These two
  // cover the other branch: a window that still fits inside the session but
  // pokes past one edge, where span is preserved by shifting instead.

  it("clampTo — a window smaller than the session, past the start — shifts to start at zero with the span preserved", () => {
    const viewport: Viewport = { startUs: -2_000_000, endUs: 3_000_000, pixelWidth: 1000 };

    const clamped = clampTo(viewport, 10_000_000);

    expect(clamped.startUs).toBe(0);
    expect(clamped.endUs).toBe(5_000_000);
  });

  it("clampTo — a window smaller than the session, past the end — shifts to end at the session span with the span preserved", () => {
    const viewport: Viewport = { startUs: 8_000_000, endUs: 13_000_000, pixelWidth: 1000 };

    const clamped = clampTo(viewport, 10_000_000);

    expect(clamped.startUs).toBe(5_000_000);
    expect(clamped.endUs).toBe(10_000_000);
  });
});

describe("zoomAt", () => {
  it("zoomAt — a pinch centred on the left edge — keeps that instant under the pointer", () => {
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };

    const result = zoomAt(viewport, 0, 2);

    expect(result.startUs).toBe(0);
    expect(result.endUs - result.startUs).toBe(5_000_000);
  });

  it("zoomAt — repeated zoom-out past the session span — clamps to the whole session", () => {
    const viewport: Viewport = { startUs: 2_000_000, endUs: 8_000_000, pixelWidth: 1000 };

    const zoomedOut = zoomAt(viewport, 500, 0.1);
    const clamped = clampTo(zoomedOut, 10_000_000);

    expect(clamped.startUs).toBe(0);
    expect(clamped.endUs).toBe(10_000_000);
  });
});

describe("transformFor", () => {
  it("transformFor — a viewport equal to the rendered one — is the identity transform", () => {
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };

    const result = transformFor(viewport, viewport);

    expect(result.scaleX).toBe(1);
    expect(result.translateXPx).toBe(0);
  });

  it("transformFor — a viewport panned half a width — translates by half the pixel width and does not scale", () => {
    const rendered: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };
    const current = panBy(rendered, 500);

    const result = transformFor(rendered, current);

    expect(result.translateXPx).toBe(500);
    expect(result.scaleX).toBe(1);
  });

  it("transformFor — a viewport zoomed 2x — scales by 2 about the correct origin", () => {
    const rendered: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 1000 };
    const current = zoomAt(rendered, 0, 2);

    const result = transformFor(rendered, current);

    expect(result.scaleX).toBe(2);
    expect(result.translateXPx).toBe(0);
  });
});
