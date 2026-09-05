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

  it("transformFor — a viewport zoomed 2x anchored at the right edge — keeps the right edge fixed under the pointer", () => {
    // review-task8.md's Critical: transformFor previously divided by the
    // rendered viewport's µs-per-pixel instead of the current one, which is
    // only invisible for a zoom anchored at pixelX = 0 (the case every
    // pre-existing test covers). This anchors at pixelX = pixelWidth (the
    // right edge) instead, where the bug is visible.
    const rendered: Viewport = { startUs: 0, endUs: 1_000_000, pixelWidth: 100 };
    const current = zoomAt(rendered, 100, 2);

    const result = transformFor(rendered, current);

    // `x(t)` is a time instant's CSS-px position within `rendered`'s own
    // already-drawn picture; `current.startUs`/`current.endUs` must land at
    // pixel 0/pixelWidth respectively once `scaleX`/`translateXPx` are applied.
    const usPerPixelRendered = (rendered.endUs - rendered.startUs) / rendered.pixelWidth;
    const xOf = (tUs: number) => (tUs - rendered.startUs) / usPerPixelRendered;
    const pixelAtCurrentStart = result.scaleX * xOf(current.startUs) + result.translateXPx;
    const pixelAtCurrentEnd = result.scaleX * xOf(current.endUs) + result.translateXPx;
    expect(pixelAtCurrentStart).toBeCloseTo(0);
    expect(pixelAtCurrentEnd).toBeCloseTo(rendered.pixelWidth);
  });

  it("transformFor — a viewport zoomed 2x anchored at a mid-point — keeps that instant fixed under the pointer", () => {
    const rendered: Viewport = { startUs: 0, endUs: 1_000_000, pixelWidth: 100 };
    const current = zoomAt(rendered, 25, 2);

    const result = transformFor(rendered, current);

    // The anchor instant (250_000 µs, at pixel 25 under `rendered`) must
    // still land at pixel 25 in the transformed picture: the anchor's own
    // position within `rendered`'s own CSS px is `x = anchorFraction *
    // rendered.pixelWidth`, and `scaleX * x + translateXPx` must reproduce
    // that same pixel 25 for the pointer-fixed contract to hold.
    const anchorXInRendered = 25;
    const pixelAtAnchor = result.scaleX * anchorXInRendered + result.translateXPx;
    expect(pixelAtAnchor).toBeCloseTo(25);
  });
});
