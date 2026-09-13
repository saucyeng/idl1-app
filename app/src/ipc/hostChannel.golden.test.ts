/** Cross-language wire golden check (ruling R236): `decodeHostChannel`
 *  against `IDLH` v2 bytes the engine itself encoded, covering both
 *  `axis_kind` values a recorded axis can carry. See `golden/loadFixture.ts`
 *  and `core/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeHostChannel } from "./hostChannel";

describe("decodeHostChannel — wire golden", () => {
  it.each(["idlh-v2-time", "idlh-v2-lap"])("%s — decodes to the engine's own expectation", (name) => {
    // Arrange
    const { bin, json } = loadFixture(name);

    // Act
    const result = decodeHostChannel(bin);

    // Assert
    expect(result.hasT).toBe(json.hasT);
    expect(result.axisKind).toBe(json.axisKind);
    expect(Array.from(result.t)).toEqual(json.t);
    expect(Array.from(result.v)).toEqual(json.v);
  });
});
