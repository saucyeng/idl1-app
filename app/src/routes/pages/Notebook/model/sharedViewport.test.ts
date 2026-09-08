import { describe, expect, it } from "vitest";

import { commitSharedViewport, viewportForCell } from "./sharedViewport";

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
