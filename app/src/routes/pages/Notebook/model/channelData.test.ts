import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { COLUMN_T_US_EMPTY } from "../../../../ipc/tiles";
import { tileToChannelData } from "./channelData";

/** Builds a small fake `DecodedTile` from parallel arrays, so tests can
 *  hand-pick column times/stats without a real fetched/decoded tile. */
function fakeTile(columnTUs: bigint[], columnMean: number[], tileIndex = 0): DecodedTile {
  const columnCount = columnTUs.length;
  return {
    version: 2,
    tier: 0,
    tileIndex,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnCount),
    columnMax: new Float32Array(columnCount),
    columnMean: new Float32Array(columnMean),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

describe("tileToChannelData", () => {
  it("tileToChannelData — one tile covering the window — emits one record per column with t in seconds", () => {
    const tile = fakeTile([0n, 1_000_000n, 2_000_000n], [1, 2, 3]);

    const data = tileToChannelData([tile], 0, 3_000_000, 100);

    expect(data.length).toBe(3);
    expect(Array.from(data.t)).toEqual([0, 1, 2]);
    expect(Array.from(data.v)).toEqual([1, 2, 3]);
  });

  it("tileToChannelData — a column carrying the COLUMN_T_US_EMPTY sentinel — is dropped, not plotted at zero", () => {
    const tile = fakeTile([0n, COLUMN_T_US_EMPTY, 2_000_000n], [1, 2, 3]);

    const data = tileToChannelData([tile], 0, 3_000_000, 100);

    expect(data.length).toBe(2);
    expect(Array.from(data.t)).toEqual([0, 2]);
    expect(Array.from(data.v)).toEqual([1, 3]);
  });

  it("tileToChannelData — a column whose stats are all NaN but whose time is real — keeps the time and emits no value", () => {
    const tile = fakeTile([0n, 1_000_000n], [1, NaN]);

    const data = tileToChannelData([tile], 0, 2_000_000, 100);

    expect(data.length).toBe(2);
    expect(data.t[1]).toBe(1);
    expect(Number.isNaN(data.v[1])).toBe(true);
  });

  it("tileToChannelData — more columns than the point budget — emits at most budget records", () => {
    const columnTUs = Array.from({ length: 100 }, (_, i) => BigInt(i * 1_000_000));
    const columnMean = Array.from({ length: 100 }, (_, i) => i);
    const tile = fakeTile(columnTUs, columnMean);

    const data = tileToChannelData([tile], 0, 100_000_000, 10);

    expect(data.length).toBeLessThanOrEqual(10);
    // Stride, not truncation — the last record's time is near the end of
    // the visible range, not near its start.
    expect(data.t[data.length - 1]).toBeGreaterThan(50);
  });

  it("tileToChannelData — two adjacent tiles — emits records in ascending time with no duplicate at the seam", () => {
    const tileA = fakeTile([0n, 1_000_000n], [1, 2], 0);
    const tileB = fakeTile([1_000_000n, 2_000_000n], [2, 3], 1);

    const data = tileToChannelData([tileA, tileB], 0, 3_000_000, 100);

    expect(Array.from(data.t)).toEqual([0, 1, 2]);
    expect(Array.from(data.v)).toEqual([1, 2, 3]);
    for (let i = 1; i < data.length; i++) {
      expect(data.t[i]).toBeGreaterThan(data.t[i - 1]);
    }
  });
});
