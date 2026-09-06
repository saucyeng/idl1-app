import { describe, expect, it } from "vitest";

import type { Histogram2dParams, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import { alignRasterToAxes, devicePxSize, rasterFetchKeyEquals, rasterRequestFor, type RasterFetchKey } from "./rasterLayer";
import type { Viewport } from "./viewport";

describe("rasterRequestFor", () => {
  it("rasterRequestFor — a histogram2d request — sets x_bins and y_bins equal to width and height (R42)", () => {
    // Arrange
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 800 };
    const params: Histogram2dParams = { y_channel: "front-fork", x_bins: 7, y_bins: 9 };

    // Act
    const request = rasterRequestFor(viewport, "histogram2d", params, 1, 400);

    // Assert
    expect(request.width).toBe(800);
    expect(request.height).toBe(400);
    expect(request.params).toEqual({ y_channel: "front-fork", x_bins: 800, y_bins: 400 });
  });

  it("rasterRequestFor — a chart wider than u16 max — clamps width and reports the clamp", () => {
    // Arrange
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 70_000 };
    const params: Histogram2dParams = { y_channel: "front-fork", x_bins: 1, y_bins: 1 };

    // Act
    const request = rasterRequestFor(viewport, "histogram2d", params, 1, 400);

    // Assert
    expect(request.width).toBe(65535);
    expect(request.clamped).toBe(true);
  });

  it("rasterRequestFor — a spectrogram request — passes window, detrend and scaling through unchanged", () => {
    // Arrange
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 800 };
    const params: SpectrogramParams = {
      window_size: 256,
      hop_size: 128,
      window: "hann",
      detrend: "linear",
      scaling: "density",
    };

    // Act
    const request = rasterRequestFor(viewport, "spectrogram", params, 1, 400);

    // Assert
    expect(request.params).toEqual(params);
    expect(request.clamped).toBe(false);
  });

  it("rasterRequestFor — a devicePixelRatio of 2 — requests twice the CSS pixel dimensions", () => {
    // Arrange
    const viewport: Viewport = { startUs: 0, endUs: 10_000_000, pixelWidth: 800 };
    const params: Histogram2dParams = { y_channel: "front-fork", x_bins: 1, y_bins: 1 };

    // Act
    const request = rasterRequestFor(viewport, "histogram2d", params, 2, 400);

    // Assert
    expect(request.width).toBe(1600);
    expect(request.height).toBe(800);
    expect(request.clamped).toBe(false);
  });
});

describe("alignRasterToAxes", () => {
  it("alignRasterToAxes — a raster meta whose x_domain differs from the viewport — returns the source rectangle to draw", () => {
    // Arrange: raster covers the whole session [0s, 20s]; viewport shows the
    // second half only, [10s, 20s] in µs, over an 800 CSS px / 800 raster px chart.
    const meta: RasterMeta = {
      x_domain: [0, 20],
      y_domain: [0, 1],
      x_label: "t",
      y_label: "value",
      scale: { vmin: 0, vmax: 1, kind: "linear" },
      transparent_zero: false,
    };
    const viewport: Viewport = { startUs: 10_000_000, endUs: 20_000_000, pixelWidth: 800 };

    // Act
    const rect = alignRasterToAxes(meta, 800, 200, viewport, 400);

    // Assert: the raster's right half (raster px [400, 800)) maps onto the
    // full destination width (CSS px [0, 800)).
    expect(rect).not.toBeNull();
    expect(rect).toEqual({
      srcX: 400,
      srcY: 0,
      srcWidth: 400,
      srcHeight: 200,
      destX: 0,
      destY: 0,
      destWidth: 800,
      destHeight: 400,
    });
  });

  it("alignRasterToAxes — a raster meta whose domain does not overlap the viewport at all — returns null", () => {
    // Arrange: raster covers [0s, 5s]; viewport is entirely later, [10s, 20s].
    const meta: RasterMeta = {
      x_domain: [0, 5],
      y_domain: [0, 1],
      x_label: "t",
      y_label: "value",
      scale: { vmin: 0, vmax: 1, kind: "linear" },
      transparent_zero: false,
    };
    const viewport: Viewport = { startUs: 10_000_000, endUs: 20_000_000, pixelWidth: 800 };

    // Act
    const rect = alignRasterToAxes(meta, 800, 200, viewport, 400);

    // Assert
    expect(rect).toBeNull();
  });
});

describe("rasterFetchKeyEquals", () => {
  const baseKey: RasterFetchKey = {
    kind: "spectrogram",
    params: { window_size: 256, hop_size: 128, window: "hann", detrend: "linear", scaling: "density" },
    viewport: { startUs: 0, endUs: 10_000_000, pixelWidth: 800 },
    width: 800,
    height: 400,
    devicePixelRatio: 1,
    sessionId: "s1",
    channelId: "front-fork",
  };

  it("rasterFetchKeyEquals — two keys with identical fetch-relevant fields — are equal (an unrelated re-render must not refetch)", () => {
    // Arrange: a fresh object with the same field values, as a re-render
    // building a new key literal from unchanged props would produce —
    // note RasterFetchKey has no `fetchRaster`/`fetchRasterMeta` field at
    // all, so a fresh closure identity for those props can never affect
    // this comparison in the first place.
    const other: RasterFetchKey = { ...baseKey, params: { ...baseKey.params }, viewport: { ...baseKey.viewport } };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, other);

    // Assert
    expect(equal).toBe(true);
  });

  it("rasterFetchKeyEquals — a changed viewport window — are not equal (a settled viewport change must refetch exactly once)", () => {
    // Arrange
    const next: RasterFetchKey = { ...baseKey, viewport: { ...baseKey.viewport, endUs: 20_000_000 } };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, next);

    // Assert
    expect(equal).toBe(false);
  });

  it("rasterFetchKeyEquals — a changed params field — are not equal", () => {
    // Arrange
    const next: RasterFetchKey = { ...baseKey, params: { ...baseKey.params, hop_size: 64 } };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, next);

    // Assert
    expect(equal).toBe(false);
  });

  it("rasterFetchKeyEquals — a changed width — are not equal (a cell resize must refetch)", () => {
    // Arrange
    const next: RasterFetchKey = { ...baseKey, width: 900 };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, next);

    // Assert
    expect(equal).toBe(false);
  });

  it("rasterFetchKeyEquals — a changed height — are not equal (a cell resize must refetch)", () => {
    // Arrange
    const next: RasterFetchKey = { ...baseKey, height: 500 };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, next);

    // Assert
    expect(equal).toBe(false);
  });

  it("rasterFetchKeyEquals — a changed devicePixelRatio — are not equal (a display change must refetch at the new resolution)", () => {
    // Arrange
    const next: RasterFetchKey = { ...baseKey, devicePixelRatio: 2 };

    // Act
    const equal = rasterFetchKeyEquals(baseKey, next);

    // Assert
    expect(equal).toBe(false);
  });
});

describe("devicePxSize", () => {
  it("devicePxSize — devicePixelRatio of 1 — returns the CSS px size unchanged", () => {
    // Arrange / Act
    const size = devicePxSize(400, 1);

    // Assert
    expect(size).toBe(400);
  });

  it("devicePxSize — devicePixelRatio of 2 — doubles and rounds the CSS px size", () => {
    // Arrange / Act
    const size = devicePxSize(400.4, 2);

    // Assert
    expect(size).toBe(801); // 400.4 * 2 = 800.8, rounded to 801
  });
});
