import { describe, expect, it } from "vitest";

import { logFrequencyAt, logFrequencyTicks, logFrequencyY, sliceRect, spectroExtentUs, type RasterExtent } from "./spectroSlice";

/** 100 s of raster, 1000 px wide (10 px a second), 0–200 Hz over 100 px. */
const R: RasterExtent = { t0Us: 0, t1Us: 100_000_000, width: 1000, height: 100, fLoHz: 0, fHiHz: 200 };

describe("sliceRect", () => {
  it("sliceRect — 6 s ending at 50 s, cut at 100 Hz — columns 440–500, the bottom half, filling the strip", () => {
    const s = sliceRect(R, 50_000_000, 6, 100);

    expect(s).not.toBeNull();
    expect(s!.sx).toBeCloseTo(440);
    expect(s!.sw).toBeCloseTo(60);
    expect(s!.sy).toBeCloseTo(50);
    expect(s!.sh).toBeCloseTo(50);
    expect(s!.destX).toBeCloseTo(0);
    expect(s!.destW).toBeCloseTo(1);
  });

  it("sliceRect — the cursor 2 s into the raster with a 6 s window — the left two-thirds empty", () => {
    const s = sliceRect(R, 2_000_000, 6, 300);

    expect(s!.sx).toBeCloseTo(0);
    expect(s!.sw).toBeCloseTo(20);
    expect(s!.destX).toBeCloseTo(4 / 6);
    expect(s!.destW).toBeCloseTo(2 / 6);
    expect(s!.sy).toBeCloseTo(0);
  });

  it("sliceRect — a cursor before the raster, or an fmax below its range — null", () => {
    expect(sliceRect(R, -1_000_000, 6, 100)).toBeNull();
    expect(sliceRect({ ...R, fLoHz: 50 }, 50_000_000, 6, 40)).toBeNull();
  });
});

describe("sliceRect — cursor in the middle", () => {
  it("sliceRect — 6 s with 3 s ahead at 50 s — columns 470–530, filling the strip", () => {
    const s = sliceRect(R, 50_000_000, 6, 200, 3);

    expect(s!.sx).toBeCloseTo(470);
    expect(s!.sw).toBeCloseTo(60);
    expect(s!.destX).toBeCloseTo(0);
    expect(s!.destW).toBeCloseTo(1);
  });

  it("sliceRect — 1 s before the raster ends with 3 s ahead — the right third empty", () => {
    const s = sliceRect(R, 99_000_000, 6, 200, 3);

    expect(s!.destW).toBeCloseTo(4 / 6);
  });
});

describe("log frequency axis", () => {
  it("logFrequencyAt / logFrequencyY — 2 to 80 Hz — the ends and a round trip", () => {
    expect(logFrequencyAt(0, 2, 80)).toBeCloseTo(80);
    expect(logFrequencyAt(1, 2, 80)).toBeCloseTo(2);
    expect(logFrequencyAt(logFrequencyY(10, 2, 80), 2, 80)).toBeCloseTo(10);
  });

  it("logFrequencyTicks — 2 to 80 Hz — 5, 10, 20, 50", () => {
    expect(logFrequencyTicks(2, 80)).toEqual([5, 10, 20, 50]);
  });
});

describe("spectroExtentUs", () => {
  it("spectroExtentUs — centres 0.25 s to 9.75 s over 20 columns — each column's middle on its segment's centre", () => {
    const [a, b] = spectroExtentUs(1_000_000, [0.25, 9.75], 20);

    const col = (b - a) / 20;
    expect(a + 0.5 * col).toBeCloseTo(1_250_000, 3);
    expect(a + 19.5 * col).toBeCloseTo(10_750_000, 3);
  });
});
