import { describe, expect, it } from "vitest";
import { decodeRaster } from "./rasters";

/** Builds a raster buffer matching C3 §3.6's worked example: 64×32, format 0. */
function buildWorkedExampleRaster(): ArrayBuffer {
  const width = 64, height = 32;
  const buf = new ArrayBuffer(16 + width * height * 4);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x52); // "IDLR"
  view.setUint16(4, 1, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setUint16(10, 0, true); // format = RGBA8
  const pixels = new Uint8Array(buf, 16);
  pixels[0] = 255; pixels[1] = 0; pixels[2] = 0; pixels[3] = 255; // first pixel red-opaque
  return buf;
}

describe("decodeRaster", () => {
  it("C3 §3.6 worked example (64x32, format 0) — decodes — dimensions and pixel region match", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();

    // Act
    const raster = decodeRaster(buf);

    // Assert
    expect(raster.width).toBe(64);
    expect(raster.height).toBe(32);
    expect(raster.pixels.length).toBe(64 * 32 * 4);
    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("unsupported format value — throws — typed error", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();
    new DataView(buf).setUint16(10, 7, true);

    // Act / Assert
    expect(() => decodeRaster(buf)).toThrowError(/format/i);
  });
});
