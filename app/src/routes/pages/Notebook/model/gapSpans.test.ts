import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { COLUMN_T_US_EMPTY } from "../../../../ipc/tiles";
import { gapBandsPx, gapSpansFromTiles } from "./gapSpans";

/** Builds a small fake `DecodedTile` from a column-time array — the same
 *  helper shape `channelData.test.ts` uses, trimmed to the one region this
 *  module reads. */
function fakeTile(columnTUs: bigint[], tileIndex = 0): DecodedTile {
  const columnCount = columnTUs.length;
  return {
    version: 2,
    tier: 0,
    tileIndex,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnCount),
    columnMax: new Float32Array(columnCount),
    columnMean: new Float32Array(columnCount),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

describe("gapSpansFromTiles", () => {
  it("gapSpansFromTiles — an empty column between two filled ones — one span edge to edge", () => {
    const tile = fakeTile([0n, COLUMN_T_US_EMPTY, 2_000_000n]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([{ startUs: 0, endUs: 2_000_000, columns: 1 }]);
  });

  it("gapSpansFromTiles — a run of empty columns — one span, counted", () => {
    const tile = fakeTile([0n, COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY, 4_000_000n]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([{ startUs: 0, endUs: 4_000_000, columns: 3 }]);
  });

  it("gapSpansFromTiles — a tile with no empty columns — no spans", () => {
    const tile = fakeTile([0n, 1_000_000n, 2_000_000n]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([]);
  });

  it("gapSpansFromTiles — leading empty columns — dropped, they are the fetched range's edge", () => {
    const tile = fakeTile([COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY, 2_000_000n, 3_000_000n]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([]);
  });

  it("gapSpansFromTiles — trailing empty columns — dropped, no closing filled column", () => {
    const tile = fakeTile([0n, 1_000_000n, COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([]);
  });

  it("gapSpansFromTiles — all columns empty — no spans at all", () => {
    const tile = fakeTile([COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([]);
  });

  it("gapSpansFromTiles — two gaps in one tile — both reported in time order", () => {
    const tile = fakeTile([0n, COLUMN_T_US_EMPTY, 2_000_000n, COLUMN_T_US_EMPTY, 4_000_000n]);

    const spans = gapSpansFromTiles([tile]);

    expect(spans).toEqual([
      { startUs: 0, endUs: 2_000_000, columns: 1 },
      { startUs: 2_000_000, endUs: 4_000_000, columns: 1 },
    ]);
  });

  it("gapSpansFromTiles — a gap spanning the seam between two tiles — one span, not two", () => {
    const first = fakeTile([0n, COLUMN_T_US_EMPTY], 0);
    const second = fakeTile([COLUMN_T_US_EMPTY, 3_000_000n], 1);

    const spans = gapSpansFromTiles([first, second]);

    expect(spans).toEqual([{ startUs: 0, endUs: 3_000_000, columns: 2 }]);
  });

  it("gapSpansFromTiles — no tiles at all — no spans", () => {
    const tiles: DecodedTile[] = [];

    const spans = gapSpansFromTiles(tiles);

    expect(spans).toEqual([]);
  });
});

describe("gapBandsPx", () => {
  /** A 100 px wide chart showing 0–10 s, so 1 s = 10 px. */
  const VIEWPORT = { startUs: 0, endUs: 10_000_000, pixelWidth: 100 };

  it("gapBandsPx — a span inside the viewport — placed at its own pixels", () => {
    const spans = [{ startUs: 2_000_000, endUs: 5_000_000, columns: 3 }];

    const bands = gapBandsPx(spans, VIEWPORT);

    expect(bands).toEqual([{ leftPx: 20, widthPx: 30 }]);
  });

  it("gapBandsPx — a span straddling the left edge — clamped, not dropped", () => {
    const spans = [{ startUs: -4_000_000, endUs: 3_000_000, columns: 7 }];

    const bands = gapBandsPx(spans, VIEWPORT);

    expect(bands).toEqual([{ leftPx: 0, widthPx: 30 }]);
  });

  it("gapBandsPx — a span straddling the right edge — clamped to the plotted width", () => {
    const spans = [{ startUs: 8_000_000, endUs: 40_000_000, columns: 30 }];

    const bands = gapBandsPx(spans, VIEWPORT);

    expect(bands).toEqual([{ leftPx: 80, widthPx: 20 }]);
  });

  it("gapBandsPx — a span entirely outside the viewport — dropped", () => {
    const spans = [{ startUs: 20_000_000, endUs: 30_000_000, columns: 10 }];

    const bands = gapBandsPx(spans, VIEWPORT);

    expect(bands).toEqual([]);
  });

  it("gapBandsPx — a span narrower than minWidthPx — dropped as a rendering artefact", () => {
    const spans = [{ startUs: 2_000_000, endUs: 2_050_000, columns: 1 }];

    const bands = gapBandsPx(spans, VIEWPORT);

    expect(bands).toEqual([]);
  });

  it("gapBandsPx — the same narrow span with minWidthPx 0 — kept", () => {
    const spans = [{ startUs: 2_000_000, endUs: 2_050_000, columns: 1 }];

    const bands = gapBandsPx(spans, VIEWPORT, 0);

    expect(bands).toEqual([{ leftPx: 20, widthPx: 0.5 }]);
  });

  it("gapBandsPx — a degenerate viewport — no bands rather than a divide by zero", () => {
    const spans = [{ startUs: 0, endUs: 1_000_000, columns: 1 }];

    const bands = gapBandsPx(spans, { startUs: 5_000_000, endUs: 5_000_000, pixelWidth: 100 });

    expect(bands).toEqual([]);
  });

  it("gapBandsPx — a chart with no width yet — no bands", () => {
    const spans = [{ startUs: 2_000_000, endUs: 5_000_000, columns: 3 }];

    const bands = gapBandsPx(spans, { ...VIEWPORT, pixelWidth: 0 });

    expect(bands).toEqual([]);
  });
});
