import { describe, expect, it } from "vitest";
import { COLUMN_T_US_EMPTY, decodeTile } from "./tiles";

/** Builds a tile buffer matching C3 §3.5's v2 worked example: tier 3, 512
 *  samples, 256 columns — total 9248 bytes (32 header + 4096 sample region
 *  + 3072 column region + 2048 column time region). */
function buildWorkedExampleTile(version = 2): ArrayBuffer {
  const sampleCount = 512;
  const columnCount = 256;
  const total = 32 + sampleCount * 8 + columnCount * 12 + columnCount * 8;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x54); // "IDLT"
  view.setUint16(4, version, true);
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
  const timeOffset = colOffset + columnCount * 12;
  for (let j = 0; j < columnCount; j++) {
    // Even columns carry a real t_us; odd columns are past-end (sentinel).
    if (j % 2 === 0) {
      view.setBigInt64(timeOffset + j * 8, BigInt(j) * 1000n, true);
    } else {
      view.setBigInt64(timeOffset + j * 8, COLUMN_T_US_EMPTY, true);
    }
  }
  return buf;
}

describe("decodeTile", () => {
  it("C3 §3.5 v2 worked example (tier 3, 512 samples, 256 columns, 9248 bytes) — decodes — header and all three regions match", () => {
    // Arrange
    const buf = buildWorkedExampleTile();

    // Act
    const tile = decodeTile(buf);

    // Assert
    expect(buf.byteLength).toBe(9248);
    expect(tile.version).toBe(2);
    expect(tile.tier).toBe(3);
    expect(tile.tileIndex).toBe(0);
    expect(tile.sampleMin.length).toBe(512);
    expect(tile.sampleMax.length).toBe(512);
    expect(tile.columnMin.length).toBe(256);
    expect(tile.columnMean.length).toBe(256);
    expect(tile.columnTUs.length).toBe(256);
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

  it("version 1 buffer — throws naming the version", () => {
    // Arrange — the old v1 layout (no column time region) was never shipped
    // (C3 §3.5), but the decoder must still reject a version-1 header
    // rather than mis-decode it as v2.
    const buf = buildWorkedExampleTile(1);

    // Act / Assert
    expect(() => decodeTile(buf)).toThrowError(/version 1.*2|version.*1.*2/i);
  });

  it("column time region — decodes the i64 values and the i64::MIN sentinel", () => {
    // Arrange
    const buf = buildWorkedExampleTile();

    // Act
    const tile = decodeTile(buf);

    // Assert — even columns carry a real t_us, odd columns are the sentinel.
    expect(tile.columnTUs[0]).toBe(0n);
    expect(tile.columnTUs[10]).toBe(10000n);
    expect(tile.columnTUs[1]).toBe(COLUMN_T_US_EMPTY);
    expect(tile.columnTUs[11]).toBe(COLUMN_T_US_EMPTY);
  });
});
