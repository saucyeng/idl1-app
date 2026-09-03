import { describe, expect, it } from "vitest";
import { decodeTile } from "./tiles";

describe("decodeTile", () => {
  it("four little-endian f32s — decodes — returns [0,1,2,3]", () => {
    // Arrange
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    [0, 1, 2, 3].forEach((v, i) => view.setFloat32(i * 4, v, true));

    // Act
    const tile = decodeTile(bytes.buffer);

    // Assert
    expect(Array.from(tile)).toEqual([0, 1, 2, 3]);
  });

  it("byte length not a multiple of 4 — throws — typed error", () => {
    // Arrange
    const bytes = new Uint8Array(6);

    // Act / Assert
    expect(() => decodeTile(bytes.buffer)).toThrowError(/multiple of 4/);
  });
});
