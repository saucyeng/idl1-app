/** Cross-language wire golden check (ruling R236): `decodeSimResult` against
 *  `IDLM` v1 bytes the engine itself encoded. See `golden/loadFixture.ts`
 *  and `crates/idl1-bridge/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeSimResult, track } from "./simResult";

describe("decodeSimResult — wire golden", () => {
  it("idlm-v1 — decodes to the engine's own expectation", () => {
    // Arrange
    const { bin, json } = loadFixture("idlm-v1");
    const want = json.tracks as { name: string; component: string; kind: string; count: number; unit: string; labels?: string[]; values: number[] }[];

    // Act
    const r = decodeSimResult(bin);

    // Assert
    expect(r.version).toBe(json.version);
    expect(r.frames).toBe(json.frames);
    expect(r.components).toEqual(json.components);
    expect(Array.from(r.frameT)).toEqual(json.frameT);
    expect(r.tracks.map(({ values, ...meta }) => ({ ...meta, values: Array.from(values) }))).toEqual(want);
    expect(track(r, "wheel_angle").labels).toEqual(["cog", "ring"]);
  });
});
