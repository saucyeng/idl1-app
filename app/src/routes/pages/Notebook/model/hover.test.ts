import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { COLUMN_T_US_EMPTY } from "../../../../ipc/tiles";
import { hoverAt } from "./hover";

/** Builds a small fake `DecodedTile` from parallel arrays, so tests can
 *  hand-pick column times/stats without a real fetched/decoded tile. */
function fakeTile(columnTUs: bigint[], columnMin: number[], columnMax: number[], columnMean: number[]): DecodedTile {
  return {
    version: 2,
    tier: 0,
    tileIndex: 0,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnMin),
    columnMax: new Float32Array(columnMax),
    columnMean: new Float32Array(columnMean),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

describe("hoverAt", () => {
  it("hoverAt — a pixel inside the plotted area — returns that column's min, max, mean and recorded t_us", () => {
    const tile = fakeTile([0n, 1_000_000n, 2_000_000n, 3_000_000n], [10, 11, 12, 13], [20, 21, 22, 23], [15, 16, 17, 18]);
    const geometry = { originPx: 0, pixelWidth: 400 };

    // 4 columns over 400px -> 100px per column; pixelX 150 lands in column 1.
    const result = hoverAt([tile], 150, geometry);

    expect(result).toEqual({ tUs: 1_000_000n, min: 11, max: 21, mean: 16 });
  });

  it("hoverAt — a pixel outside the plotted area — returns null", () => {
    const tile = fakeTile([0n, 1_000_000n], [10, 11], [20, 21], [15, 16]);
    const geometry = { originPx: 50, pixelWidth: 200 };

    const result = hoverAt([tile], 10, geometry);

    expect(result).toBeNull();
  });

  it("hoverAt — a column with the empty-time sentinel — returns null rather than a bogus instant", () => {
    const tile = fakeTile([0n, COLUMN_T_US_EMPTY], [10, 11], [20, 21], [15, 16]);
    const geometry = { originPx: 0, pixelWidth: 200 };

    // 2 columns over 200px -> pixelX 150 lands in column 1 (the sentinel column).
    const result = hoverAt([tile], 150, geometry);

    expect(result).toBeNull();
  });

  it("hoverAt — no tiles at all — returns null", () => {
    const geometry = { originPx: 0, pixelWidth: 200 };

    const result = hoverAt([], 100, geometry);

    expect(result).toBeNull();
  });

  it("hoverAt — a pixel resolving into the second of two tiles — returns that tile's column", () => {
    const tileA = fakeTile([0n, 1_000_000n], [10, 11], [20, 21], [15, 16]);
    const tileB = fakeTile([2_000_000n, 3_000_000n], [12, 13], [22, 23], [17, 18]);
    const geometry = { originPx: 0, pixelWidth: 400 };

    // 4 total columns over 400px -> pixelX 350 lands in global column 3 (tileB's index 1).
    const result = hoverAt([tileA, tileB], 350, geometry);

    expect(result).toEqual({ tUs: 3_000_000n, min: 13, max: 23, mean: 18 });
  });
});
