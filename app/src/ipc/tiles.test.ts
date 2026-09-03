import { describe, expect, it } from "vitest";
import { decodeTile } from "./tiles";

/** Builds a tile buffer matching C3 §3.5's worked example: tier 3, 512
 *  samples, 256 columns — total 7200 bytes. */
function buildWorkedExampleTile(): ArrayBuffer {
  const sampleCount = 512;
  const columnCount = 256;
  const total = 32 + sampleCount * 8 + columnCount * 12;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x54); // "IDLT"
  view.setUint16(4, 1, true);   // version
  view.setUint16(6, 3, true);   // tier
  view.setUint32(8, 0, true);   // tile_index
  view.setUint32(12, sampleCount, true);
  view.setUint32(16, columnCount, true);
  view.setUint32(20, 0, true);  // flags
  for (let i = 0; i < sampleCount; i++) {
    view.setFloat32(32 + i * 8, i, true);
    view.setFloat32(32 + i * 8 + 4, i + 0.5, true);
  }
  const colOffset = 32 + sampleCount * 8;
  for (let j = 0; j < columnCount; j++) {
    view.setFloat32(colOffset + j * 12, j, true);
    view.setFloat32(colOffset + j * 12 + 4, j + 1, true);
    view.setFloat32(colOffset + j * 12 + 8, j + 0.5, true);
  }
  return buf;
}

describe("decodeTile", () => {
  it("C3 §3.5 worked example (tier 3, 512 samples, 256 columns) — decodes — header and both regions match", () => {
    // Arrange
    const buf = buildWorkedExampleTile();

    // Act
    const tile = decodeTile(buf);

    // Assert
    expect(tile.tier).toBe(3);
    expect(tile.tileIndex).toBe(0);
    expect(tile.sampleMin.length).toBe(512);
    expect(tile.sampleMax.length).toBe(512);
    expect(tile.columnMin.length).toBe(256);
    expect(tile.columnMean.length).toBe(256);
    expect(tile.sampleMin[10]).toBeCloseTo(10);
    expect(tile.sampleMax[10]).toBeCloseTo(10.5);
    expect(tile.columnMean[10]).toBeCloseTo(10.5);
  });

  it("wrong magic bytes — throws — typed error naming the mismatch", () => {
    // Arrange
    const buf = buildWorkedExampleTile();
    new DataView(buf).setUint8(0, 0x00);

    // Act / Assert
    expect(() => decodeTile(buf)).toThrowError(/magic/i);
  });

  it("buffer shorter than the header — throws — typed error", () => {
    // Arrange
    const buf = new ArrayBuffer(10);

    // Act / Assert
    expect(() => decodeTile(buf)).toThrowError(/32 bytes/);
  });
});
