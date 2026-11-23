import { describe, expect, it } from "vitest";

import { heartRateZones, tracePoints, zoneAt } from "./geometry";

describe("heartRateZones", () => {
  it("heartRateZones — 60 to 200 bpm — five zones on 100/120/140/160/180/200", () => {
    const zones = heartRateZones(60, 200);

    expect(zones).toEqual([
      { from: 100, to: 120, n: 1 },
      { from: 120, to: 140, n: 2 },
      { from: 140, to: 160, n: 3 },
      { from: 160, to: 180, n: 4 },
      { from: 180, to: 200, n: 5 },
    ]);
  });

  it("heartRateZones — a dial starting at 130 — Z1 dropped, Z2 cut at 130", () => {
    const zones = heartRateZones(130, 200);

    expect(zones[0]).toEqual({ from: 130, to: 140, n: 2 });
    expect(zones).toHaveLength(4);
  });
});

describe("zoneAt", () => {
  it("zoneAt — inside, on an edge, at the top, below — the right zone or null", () => {
    const zones = heartRateZones(60, 200);

    expect(zoneAt(181, zones)?.n).toBe(5);
    expect(zoneAt(160, zones)?.n).toBe(4);
    expect(zoneAt(200, zones)?.n).toBe(5);
    expect(zoneAt(90, zones)).toBeNull();
    expect(zoneAt(null, zones)).toBeNull();
  });
});

describe("tracePoints", () => {
  it("tracePoints — three samples, newest first — oldest at the left, newest at the right edge", () => {
    const runs = tracePoints([10, 5, 0], 0, 10, 100, 50);

    expect(runs).toEqual([
      [
        { x: 0, y: 50 },
        { x: 50, y: 25 },
        { x: 100, y: 0 },
      ],
    ]);
  });

  it("tracePoints — a gap and a value past max — two runs, the high value held at the top", () => {
    const runs = tracePoints([20, null, 5, 0], 0, 10, 30, 10);

    expect(runs).toHaveLength(2);
    expect(runs[1]).toEqual([{ x: 30, y: 0 }]);
  });
});
