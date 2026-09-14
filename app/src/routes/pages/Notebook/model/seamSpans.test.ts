import { describe, expect, it } from "vitest";

import { seamBandsPx, seamSpansFromResult } from "./seamSpans";

describe("seamSpansFromResult — wire pairs — become SeamSpan objects", () => {
  it("seamSpansFromResult — three wire pairs — maps each to startUs/endUs in order", () => {
    // Arrange
    const result = { spans: [[100_000, 101_200], [104_800, 106_000]] as [number, number][] };

    // Act
    const spans = seamSpansFromResult(result);

    // Assert
    expect(spans).toEqual([
      { startUs: 100_000, endUs: 101_200 },
      { startUs: 104_800, endUs: 106_000 },
    ]);
  });

  it("seamSpansFromResult — no spans — returns an empty array", () => {
    // Arrange
    const result = { spans: [] as [number, number][] };

    // Act
    const spans = seamSpansFromResult(result);

    // Assert
    expect(spans).toEqual([]);
  });
});

describe("seamBandsPx — placement in the viewport — matches gapBandsPx's clip/clamp rule", () => {
  it("seamBandsPx — a seam fully inside the viewport — places it at the exact px offset", () => {
    // Arrange
    const spans = [{ startUs: 2_000_000, endUs: 3_000_000 }];
    const viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 100 };

    // Act
    const bands = seamBandsPx(spans, viewport);

    // Assert -- 10px/1_000_000us: left at 20px, width 10px.
    expect(bands).toEqual([{ leftPx: 20, widthPx: 10 }]);
  });

  it("seamBandsPx — a seam straddling the viewport's left edge — clamps rather than drops", () => {
    // Arrange
    const spans = [{ startUs: -1_000_000, endUs: 1_000_000 }];
    const viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 100 };

    // Act
    const bands = seamBandsPx(spans, viewport);

    // Assert -- clipped to [0, 1_000_000), 10px wide from the left edge.
    expect(bands).toEqual([{ leftPx: 0, widthPx: 10 }]);
  });

  it("seamBandsPx — a seam entirely outside the viewport — is dropped", () => {
    // Arrange
    const spans = [{ startUs: 20_000_000, endUs: 21_000_000 }];
    const viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 100 };

    // Act
    const bands = seamBandsPx(spans, viewport);

    // Assert
    expect(bands).toEqual([]);
  });

  it("seamBandsPx — a clipped band under minWidthPx — is dropped", () => {
    // Arrange -- 100us wide over a 10_000_000us/100px viewport is 0.001px.
    const spans = [{ startUs: 5_000_000, endUs: 5_000_100 }];
    const viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 100 };

    // Act
    const bands = seamBandsPx(spans, viewport);

    // Assert
    expect(bands).toEqual([]);
  });

  it("seamBandsPx — a degenerate viewport (zero span) — returns no bands", () => {
    // Arrange
    const spans = [{ startUs: 0, endUs: 1_000_000 }];
    const viewport = { startUs: 5_000_000, endUs: 5_000_000, pixelWidth: 100 };

    // Act
    const bands = seamBandsPx(spans, viewport);

    // Assert
    expect(bands).toEqual([]);
  });
});
