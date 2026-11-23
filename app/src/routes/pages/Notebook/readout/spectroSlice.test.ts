import { describe, expect, it } from "vitest";

import { sliceRect, type RasterExtent } from "./spectroSlice";

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
