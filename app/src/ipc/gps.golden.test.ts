/** Cross-language wire golden check (ruling R236): `decodeGpsTrace` against
 *  `IDLG` v1 bytes the engine itself encoded, with a colour-by channel
 *  present. See `golden/loadFixture.ts` and `core/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeGpsTrace } from "./gps";

describe("decodeGpsTrace — wire golden", () => {
  it("idlg-v1 — decodes to the engine's own expectation", () => {
    // Arrange
    const { bin, json } = loadFixture("idlg-v1");

    // Act
    const result = decodeGpsTrace(bin);

    // Assert
    expect(Array.from(result.xs)).toEqual(json.xs);
    expect(Array.from(result.ys)).toEqual(json.ys);
    expect(Array.from(result.ts)).toEqual(json.ts);
    expect(result.cs).not.toBeNull();
    expect(Array.from(result.cs as Float64Array)).toEqual(json.cs);
  });
});
