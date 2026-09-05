import { describe, expect, it } from "vitest";

import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";
import { spanFromCoarsestTile } from "./sessionSpan";

function tile(columnTUs: bigint[]): DecodedTile {
  const columnCount = columnTUs.length;
  return {
    version: 2,
    tier: 10,
    tileIndex: 0,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnCount),
    columnMax: new Float32Array(columnCount),
    columnMean: new Float32Array(columnCount),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

describe("spanFromCoarsestTile", () => {
  it("spanFromCoarsestTile — a tile with populated columns — spans the first to the last non-empty column", () => {
    const t = tile([COLUMN_T_US_EMPTY, 1_000_000n, 2_000_000n, 3_000_000n, COLUMN_T_US_EMPTY]);

    const span = spanFromCoarsestTile(t);

    expect(span).toEqual({ startUs: 1_000_000, endUs: 3_000_000 });
  });

  it("spanFromCoarsestTile — every column empty — returns null", () => {
    const t = tile([COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY]);

    expect(spanFromCoarsestTile(t)).toBeNull();
  });

  it("spanFromCoarsestTile — a single populated column — start and end are the same instant", () => {
    const t = tile([COLUMN_T_US_EMPTY, 5_000_000n, COLUMN_T_US_EMPTY]);

    expect(spanFromCoarsestTile(t)).toEqual({ startUs: 5_000_000, endUs: 5_000_000 });
  });
});
