/** Cross-language wire golden check (ruling R236): `decodeRaster` against
 *  `IDLR` v1 bytes the engine itself encoded (a `histogram2d` raster). See
 *  `golden/loadFixture.ts` and `core/src/wire_golden.rs`. */
import { describe, expect, it } from "vitest";

import { loadFixture } from "./golden/loadFixture";
import { decodeRaster } from "./rasters";

describe("decodeRaster — wire golden", () => {
  it("idlr-v1 — decodes to the engine's own expectation", () => {
    // Arrange
    const { bin, json } = loadFixture("idlr-v1");

    // Act
    const result = decodeRaster(bin);

    // Assert
    expect(result.width).toBe(json.width);
    expect(result.height).toBe(json.height);
    const firstPixels = Array.from(result.pixels.slice(0, 8));
    const lastPixels = Array.from(result.pixels.slice(-8));
    expect(firstPixels).toEqual(json.firstPixels);
    expect(lastPixels).toEqual(json.lastPixels);
  });
});
