import { describe, expect, it } from "vitest";

import { commitSharedViewport, rebaseSharedViewport, viewportForCell } from "./sharedViewport";

describe("viewportForCell", () => {
  it("viewportForCell — combines the shared range with this chart's own pixel width", () => {
    const shared = { startUs: 1_000, endUs: 5_000 };

    const viewport = viewportForCell(shared, 640);

    expect(viewport).toEqual({ startUs: 1_000, endUs: 5_000, pixelWidth: 640 });
  });

  it("viewportForCell — two charts of different widths reading the same shared range — same startUs/endUs, different pixelWidth", () => {
    const shared = { startUs: 0, endUs: 10_000 };

    const narrow = viewportForCell(shared, 320);
    const wide = viewportForCell(shared, 960);

    expect(narrow.startUs).toBe(wide.startUs);
    expect(narrow.endUs).toBe(wide.endUs);
    expect(narrow.pixelWidth).not.toBe(wide.pixelWidth);
  });
});

describe("commitSharedViewport", () => {
  it("commitSharedViewport — drops the settling chart's own pixelWidth", () => {
    const viewport = { startUs: 2_000, endUs: 8_000, pixelWidth: 640 };

    const shared = commitSharedViewport(viewport);

    expect(shared).toEqual({ startUs: 2_000, endUs: 8_000 });
  });

  it("commitSharedViewport then viewportForCell — round-trips startUs/endUs unchanged at a different chart's own width", () => {
    const settled = { startUs: 3_000, endUs: 9_000, pixelWidth: 640 };

    const shared = commitSharedViewport(settled);
    const otherChart = viewportForCell(shared, 480);

    expect(otherChart.startUs).toBe(settled.startUs);
    expect(otherChart.endUs).toBe(settled.endUs);
    expect(otherChart.pixelWidth).toBe(480);
  });
});

describe("rebaseSharedViewport", () => {
  const RIDE = { startUs: 0, endUs: 10_015_000_000 };
  const LAP1 = { startUs: 3_693_332_000, endUs: 3_782_355_000 };
  const LAP3 = { startUs: 6_943_063_000, endUs: 7_032_273_000 };

  it("rebaseSharedViewport — a whole-ride range, then a lap is selected — null, the lap opens on itself", () => {
    const shared = { startUs: 0, endUs: 3_782_000_000 };

    const next = rebaseSharedViewport(shared, RIDE, LAP1);

    expect(next).toBeNull();
  });

  it("rebaseSharedViewport — a zoom inside lap 1, then lap 3 — the same offset from lap 3's start", () => {
    const shared = { startUs: LAP1.startUs + 10_000_000, endUs: LAP1.startUs + 20_000_000 };

    const next = rebaseSharedViewport(shared, LAP1, LAP3);

    expect(next).toEqual({ startUs: LAP3.startUs + 10_000_000, endUs: LAP3.startUs + 20_000_000 });
  });

  it("rebaseSharedViewport — a zoom past the new window's length — null", () => {
    const shared = { startUs: RIDE.startUs + 50_000_000, endUs: RIDE.startUs + 200_000_000 };

    const next = rebaseSharedViewport(shared, RIDE, LAP1);

    expect(next).toBeNull();
  });

  it("rebaseSharedViewport — the same window — the range unchanged", () => {
    const shared = { startUs: LAP1.startUs + 1, endUs: LAP1.startUs + 2 };

    const next = rebaseSharedViewport(shared, LAP1, { ...LAP1 });

    expect(next).toBe(shared);
  });

  it("rebaseSharedViewport — no range yet or an unresolved window — null", () => {
    expect(rebaseSharedViewport(null, LAP1, LAP3)).toBeNull();
    expect(rebaseSharedViewport({ startUs: 0, endUs: 1 }, null, LAP3)).toBeNull();
    expect(rebaseSharedViewport({ startUs: 0, endUs: 1 }, LAP1, null)).toBeNull();
  });
});
