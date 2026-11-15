import { describe, expect, it } from "vitest";

import { arcPath, formatReadoutValue, gaugeTicks, ggPoint, ggRings, needleAngleDeg, polar, tailOpacity } from "./geometry";

describe("needleAngleDeg", () => {
  it("needleAngleDeg — min, middle, max — sweep ends and 12 o'clock", () => {
    const [min, max] = [0, 60];

    const angles = [0, 30, 60].map((v) => needleAngleDeg(v, min, max));

    expect(angles).toEqual([-120, 0, 120]);
  });

  it("needleAngleDeg — value past either end — clamped to the dial", () => {
    const [min, max] = [0, 60];

    const angles = [-5, 90].map((v) => needleAngleDeg(v, min, max));

    expect(angles).toEqual([-120, 120]);
  });

  it("needleAngleDeg — missing value or empty range — null", () => {
    const cases: [number | null, number, number][] = [[null, 0, 60], [Number.NaN, 0, 60], [10, 5, 5]];

    const angles = cases.map(([v, a, b]) => needleAngleDeg(v, a, b));

    expect(angles).toEqual([null, null, null]);
  });
});

describe("polar / arcPath", () => {
  it("polar — 90 degrees — to the right of centre (clockwise from up)", () => {
    const at = { cx: 50, cy: 50, r: 10 };

    const p = polar(at.cx, at.cy, at.r, 90);

    expect(p.x).toBeCloseTo(60);
    expect(p.y).toBeCloseTo(50);
  });

  it("arcPath — over 180 degrees — large-arc flag set", () => {
    const sweep = [-120, 120];

    const d = arcPath(50, 50, 40, sweep[0], sweep[1]);

    expect(d).toMatch(/A40,40 0 1 1 /);
  });

  it("arcPath — zero length — empty", () => {
    const a = 30;

    const d = arcPath(50, 50, 40, a, a);

    expect(d).toBe("");
  });
});

describe("gaugeTicks", () => {
  it("gaugeTicks — 0 to 40 — steps of 10 from 0 to 40", () => {
    const range = [0, 40];

    const ticks = gaugeTicks(range[0], range[1]);

    expect(ticks).toEqual([0, 10, 20, 30, 40]);
  });

  it("gaugeTicks — 60 to 200 bpm — steps of 20 inside the range", () => {
    const range = [60, 200];

    const ticks = gaugeTicks(range[0], range[1]);

    expect(ticks).toEqual([60, 80, 100, 120, 140, 160, 180, 200]);
  });

  it("gaugeTicks — empty range — no ticks", () => {
    const range = [5, 5];

    const ticks = gaugeTicks(range[0], range[1]);

    expect(ticks).toEqual([]);
  });
});

describe("ggRings / ggPoint", () => {
  it("ggRings — limit 1.5, step 0.5 — three rings", () => {
    const [limit, step] = [1.5, 0.5];

    const rings = ggRings(limit, step);

    expect(rings).toEqual([0.5, 1, 1.5]);
  });

  it("ggPoint — 1 g right, 1 g up, limit 2 — half way out, y up", () => {
    const [x, y] = [1, 1];

    const p = ggPoint(x, y, 2, 100, 100, 80);

    expect(p).toEqual({ x: 140, y: 60 });
  });

  it("ggPoint — beyond the edge — pulled to the edge along its direction", () => {
    const [x, y] = [3, 4];

    const p = ggPoint(x, y, 1, 0, 0, 10);

    expect(p!.x).toBeCloseTo(6);
    expect(p!.y).toBeCloseTo(-8);
  });

  it("ggPoint — a missing value — null", () => {
    const [x, y] = [0.3, null];

    const p = ggPoint(x, y, 1, 0, 0, 10);

    expect(p).toBeNull();
  });
});

describe("tailOpacity / formatReadoutValue", () => {
  it("tailOpacity — first and last of 3 — fades toward zero, never reaches the dot's 1", () => {
    const count = 3;

    const o = [1, 2, 3].map((k) => tailOpacity(k, count));

    expect(o).toEqual([0.75, 0.5, 0.25]);
  });

  it("tailOpacity — out of range — 0", () => {
    const count = 3;

    const o = [0, 4].map((k) => tailOpacity(k, count));

    expect(o).toEqual([0, 0]);
  });

  it("formatReadoutValue — missing — en dash", () => {
    const v = null;

    const s = formatReadoutValue(v, 1);

    expect(s).toBe("–");
  });

  it("formatReadoutValue — 23.456 at 1 digit — 23.5", () => {
    const v = 23.456;

    const s = formatReadoutValue(v, 1);

    expect(s).toBe("23.5");
  });
});
