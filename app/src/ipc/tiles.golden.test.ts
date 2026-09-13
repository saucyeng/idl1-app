/** Cross-language wire golden check (ruling R236): `decodeTile` against
 *  `IDLT` v2 bytes the engine itself encoded — 1024 raw samples at tier 0
 *  (one bucket per sample) split across a 4-column tile, so every bucket
 *  and every column carries real data (no NaN/sentinel — `serde_json` has
 *  no JSON spelling for `NaN`, so the golden JSON sticks to finite values).
 *  See `golden/loadFixture.ts` and `core/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeTile } from "./tiles";

/** Interleaves `min`/`max` typed arrays back into `[min, max, min, max, …]`
 *  pairs, matching the golden JSON's own `firstSamplePairs`/`lastSamplePairs`
 *  shape (the pre-encoding bucket-pair order, not the decoder's two
 *  separate arrays). */
function interleave(min: Float32Array, max: Float32Array, from: number, count: number): number[] {
  const out: number[] = [];
  for (let i = from; i < from + count; i++) {
    out.push(min[i], max[i]);
  }
  return out;
}

describe("decodeTile — wire golden", () => {
  it("idlt-v2 — decodes to the engine's own expectation", () => {
    // Arrange
    const { bin, json } = loadFixture("idlt-v2");

    // Act
    const result = decodeTile(bin);

    // Assert — header.
    expect(result.version).toBe(json.version);
    expect(result.tier).toBe(json.tier);
    expect(result.tileIndex).toBe(json.tileIndex);
    expect(result.sampleMin.length).toBe(json.sampleCount);
    expect(result.columnMin.length).toBe(json.columnCount);

    // Assert — first/last bucket pairs (two buckets = four interleaved values).
    expect(interleave(result.sampleMin, result.sampleMax, 0, 2)).toEqual(json.firstSamplePairs);
    const n = result.sampleMin.length;
    expect(interleave(result.sampleMin, result.sampleMax, n - 2, 2)).toEqual(json.lastSamplePairs);

    // Assert — column region (all 4 columns real data, no NaN/sentinel).
    expect(Array.from(result.columnMin)).toEqual(json.columnMin);
    expect(Array.from(result.columnMax)).toEqual(json.columnMax);
    expect(Array.from(result.columnMean)).toEqual(json.columnMean);
    expect(Array.from(result.columnTUs).map(Number)).toEqual(json.columnTUs);
  });
});
