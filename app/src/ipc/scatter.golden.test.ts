/** Cross-language wire golden check (ruling R236): `decodeScatter` against
 *  `IDLS` v1 bytes the engine itself encoded. See `golden/loadFixture.ts`
 *  and `core/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeScatter } from "./scatter";

describe("decodeScatter — wire golden", () => {
  it("idls-v1 — decodes to the engine's own expectation", () => {
    // Arrange
    const { bin, json } = loadFixture("idls-v1");

    // Act
    const result = decodeScatter(bin);

    // Assert
    expect(result.xMin).toBe(json.xMin);
    expect(result.xMax).toBe(json.xMax);
    expect(result.yMin).toBe(json.yMin);
    expect(result.yMax).toBe(json.yMax);
    expect(Array.from(result.xs)).toEqual(json.xs);
    expect(Array.from(result.ys)).toEqual(json.ys);
  });
});
