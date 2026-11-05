import { describe, expect, it } from "vitest";

import { decodeLatLonTrace } from "./trackEditor";

/** `IDLL` v1 bytes for `lons`/`lats`/`ts`, no colour block. */
function idll(magic: string, lons: number[], lats: number[], ts: number[]): ArrayBuffer {
  const n = lons.length;
  const buf = new ArrayBuffer(16 + n * 24);
  const view = new DataView(buf);
  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i));
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, n, true);
  [lons, lats, ts].forEach((block, b) => block.forEach((v, i) => view.setFloat64(16 + (b * n + i) * 8, v, true)));
  return buf;
}

describe("decodeLatLonTrace", () => {
  it("decodeLatLonTrace — IDLL bytes — longitudes, latitudes and times in order, no colour", () => {
    // Act
    const t = decodeLatLonTrace(idll("IDLL", [-76.1, -76.2], [42.1, 42.2], [0, 1.5]));

    // Assert
    expect(Array.from(t.lons)).toEqual([-76.1, -76.2]);
    expect(Array.from(t.lats)).toEqual([42.1, 42.2]);
    expect(Array.from(t.ts)).toEqual([0, 1.5]);
    expect(t.cs).toBeNull();
  });

  it("decodeLatLonTrace — metre-frame IDLG bytes — refused, never read as degrees", () => {
    expect(() => decodeLatLonTrace(idll("IDLG", [1], [2], [3]))).toThrow(/magic/);
  });
});
