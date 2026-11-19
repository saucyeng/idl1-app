import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({})),
  Channel: class {
    onmessage: unknown = null;
  },
}));

import { decodeSimRun, toPx, type PhotoFrame } from "./simulate";

function encode(head: object, arrays: number[][]): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(head));
  const bodyStart = Math.ceil((12 + json.length) / 4) * 4;
  const count = arrays.reduce((n, a) => n + a.length, 0);
  const buf = new ArrayBuffer(bodyStart + 4 * count);
  const bytes = new Uint8Array(buf);
  bytes.set([73, 68, 76, 83]);
  const view = new DataView(buf);
  view.setUint32(4, 1, true);
  view.setUint32(8, json.length, true);
  bytes.set(json, 12);
  let off = bodyStart;
  for (const a of arrays) {
    for (const x of a) {
      view.setFloat32(off, x, true);
      off += 4;
    }
  }
  return buf;
}

describe("drivetrain sim IPC", () => {
  it("decodeSimRun — an IDLS v1 buffer — gives every array at its length and in order", () => {
    // Arrange
    const head = {
      frames: 2,
      nodes: 2,
      gear: 3,
      points: ["rear_axle"],
      wheels: [{ role: "cog", radius_m: 0.04, teeth: 21 }],
      channels: [{ name: "Cage angle", unit: "deg" }],
      summary: {},
      frame: { rear_axle_px: [0, 0], front_axle_px: [100, 0], wheelbase_m: 1 },
      input: {},
    };
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8];
    const points = [10, 11, 12, 13];
    const angles = [0.5, 0.25];
    const cage = [-1, 2];
    const t = [0, 0.002];

    // Act
    const run = decodeSimRun(encode(head, [nodes, points, angles, cage, t]));

    // Assert
    expect(Array.from(run.nodeXy)).toEqual(nodes);
    expect(Array.from(run.pointXy)).toEqual(points);
    expect(Array.from(run.wheelAngle)).toEqual(angles);
    expect(run.channels[0].name).toBe("Cage angle");
    expect(Array.from(run.channels[0].values)).toEqual(cage);
    expect(run.frameT[1]).toBeCloseTo(0.002);
  });

  it("decodeSimRun — bad magic or a short body — throws", () => {
    // Arrange
    const short = encode({ frames: 5, nodes: 2, points: [], wheels: [], channels: [] }, [[1, 2]]);
    const bad = new ArrayBuffer(16);

    // Act / Assert
    expect(() => decodeSimRun(bad)).toThrow(/magic/);
    expect(() => decodeSimRun(short)).toThrow(/shorter/);
  });

  it("toPx — a level photo — puts metres up as pixels up the image", () => {
    // Arrange: axles 1000 px apart for a 1.25 m wheelbase, image y down
    const frame: PhotoFrame = { rear_axle_px: [200, 800], front_axle_px: [1200, 800], wheelbase_m: 1.25 };

    // Act
    const front = toPx(frame, [1.25, 0]);
    const up = toPx(frame, [0, 0.1]);

    // Assert
    expect(front[0]).toBeCloseTo(1200);
    expect(front[1]).toBeCloseTo(800);
    expect(up[0]).toBeCloseTo(200);
    expect(up[1]).toBeCloseTo(720);
  });
});
