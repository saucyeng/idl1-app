import { describe, expect, it } from "vitest";

import { decodeHostChannel, HostChannelDecodeError } from "./hostChannel";

const MAGIC_BYTES = [0x49, 0x44, 0x4c, 0x48]; // "IDLH"

/** Builds an `IDLH` v1 buffer per C3 §3.4: 24-byte header, then `tLength`
 *  `f64`s (seconds), then `values.length` `f64`s. */
function buildHostChannel(hasT: boolean, t: number[], values: number[]): ArrayBuffer {
  const total = 24 + t.length * 8 + values.length * 8;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  MAGIC_BYTES.forEach((b, i) => view.setUint8(i, b));
  view.setUint16(4, 1, true); // version
  view.setUint16(6, hasT ? 0x1 : 0x0, true); // flags
  view.setUint32(8, values.length, true); // length
  view.setUint32(12, t.length, true); // t_length
  // reserved [16, 24) left zero
  t.forEach((value, i) => view.setFloat64(24 + i * 8, value, true));
  const vOffset = 24 + t.length * 8;
  values.forEach((value, i) => view.setFloat64(vOffset + i * 8, value, true));
  return buf;
}

describe("decodeHostChannel", () => {
  it("decodeHostChannel — a buffer with a recorded time axis — decodes t and v in order", () => {
    // Arrange
    const buf = buildHostChannel(true, [0, 0.5, 1], [10, 20, 30]);

    // Act
    const result = decodeHostChannel(buf);

    // Assert
    expect(result.hasT).toBe(true);
    expect(Array.from(result.t)).toEqual([0, 0.5, 1]);
    expect(Array.from(result.v)).toEqual([10, 20, 30]);
  });

  it("decodeHostChannel — a scalar/table-column result with no recorded axis — t is empty and hasT is false", () => {
    // Arrange
    const buf = buildHostChannel(false, [], [42]);

    // Act
    const result = decodeHostChannel(buf);

    // Assert
    expect(result.hasT).toBe(false);
    expect(result.t.length).toBe(0);
    expect(Array.from(result.v)).toEqual([42]);
  });

  it("decodeHostChannel — a buffer shorter than the header — throws an internal HostChannelDecodeError", () => {
    // Arrange
    const buf = new ArrayBuffer(10);

    // Act / Assert
    expect(() => decodeHostChannel(buf)).toThrowError(/header needs 24 bytes/);
    try {
      decodeHostChannel(buf);
    } catch (e) {
      expect(e).toBeInstanceOf(HostChannelDecodeError);
      expect((e as HostChannelDecodeError).kind).toBe("internal");
    }
  });

  it("decodeHostChannel — bad magic bytes — throws naming the mismatch", () => {
    // Arrange
    const buf = buildHostChannel(false, [], [1]);
    new DataView(buf).setUint8(0, 0x00);

    // Act / Assert
    expect(() => decodeHostChannel(buf)).toThrowError(/magic/i);
  });

  it("decodeHostChannel — an unsupported version — throws naming the mismatch", () => {
    // Arrange
    const buf = buildHostChannel(false, [], [1]);
    new DataView(buf).setUint16(4, 2, true);

    // Act / Assert
    expect(() => decodeHostChannel(buf)).toThrowError(/version/i);
  });

  it("decodeHostChannel — a buffer shorter than the declared lengths require — throws", () => {
    // Arrange
    const full = buildHostChannel(true, [0, 1], [1, 2, 3]);
    const truncated = full.slice(0, full.byteLength - 8);

    // Act / Assert
    expect(() => decodeHostChannel(truncated)).toThrowError(/too short/);
  });
});
