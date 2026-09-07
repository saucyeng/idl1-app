import { describe, expect, it } from "vitest";

import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";
import { findPeakTUs } from "./peak";

function makeTile(columnTUs: bigint[], columnMean: number[]): DecodedTile {
  return {
    version: 1,
    tier: 0,
    tileIndex: 0,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: Float32Array.from(columnMean),
    columnMax: Float32Array.from(columnMean),
    columnMean: Float32Array.from(columnMean),
    columnTUs: BigInt64Array.from(columnTUs),
  };
}

describe("findPeakTUs", () => {
  it("findPeakTUs — several columns — the time of the largest-magnitude column", () => {
    const tile = makeTile([0n, 100n, 200n, 300n], [1, -9, 3, 5]);

    expect(findPeakTUs([tile])).toBe(100n);
  });

  it("findPeakTUs — an empty-sentinel column — skipped even if its raw mean would otherwise win", () => {
    const tile = makeTile([0n, COLUMN_T_US_EMPTY, 200n], [1, 999, 3]);

    expect(findPeakTUs([tile])).toBe(200n);
  });

  it("findPeakTUs — no tiles — null", () => {
    expect(findPeakTUs([])).toBeNull();
  });

  it("findPeakTUs — every column empty — null", () => {
    const tile = makeTile([COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY], [1, 2]);

    expect(findPeakTUs([tile])).toBeNull();
  });

  it("findPeakTUs — across multiple tiles — the global peak", () => {
    const tileA = makeTile([0n, 100n], [1, 2]);
    const tileB = makeTile([200n, 300n], [7, 3]);

    expect(findPeakTUs([tileA, tileB])).toBe(200n);
  });
});
