import { describe, expect, it } from "vitest";

import { cursorCardRow } from "./cursorCard";

const WINDOW = { startUs: 0, endUs: 10_000_000 };

describe("cursorCardRow", () => {
  it("cursorCardRow — a normal reading within the window — one row, value is the reading's mean", () => {
    const row = cursorCardRow(1_000_000, WINDOW, { mean: 42 }, "Front travel", "mm", "--chart-1", 1, "Session A");

    expect(row).toEqual({ windowLabel: null, colour: "--chart-1", seriesLabel: "Front travel", unit: "mm", value: 42 });
  });

  it("cursorCardRow — exactly one window selected — windowLabel is null (R127 item 3: no marker)", () => {
    const row = cursorCardRow(1_000_000, WINDOW, { mean: 1 }, "Speed", "km/h", "--chart-1", 1, "Lap 2");

    expect(row?.windowLabel).toBeNull();
  });

  it("cursorCardRow — more than one window selected — windowLabel names the primary window (R132)", () => {
    const row = cursorCardRow(1_000_000, WINDOW, { mean: 1 }, "Speed", "km/h", "--chart-1", 3, "Lap 2");

    expect(row?.windowLabel).toBe("Lap 2");
  });

  it("cursorCardRow — the offset runs past the window's own end — null, not a row holding a stale value (decision 55's absence rule)", () => {
    const row = cursorCardRow(20_000_000, WINDOW, { mean: 42 }, "Front travel", "mm", "--chart-1", 1, "Session A");

    expect(row).toBeNull();
  });

  it("cursorCardRow — no reading at the cursor's pixel (a gap) — a row with value: null, distinct from no row at all", () => {
    const row = cursorCardRow(1_000_000, WINDOW, null, "Front travel", "mm", "--chart-1", 1, "Session A");

    expect(row).toEqual({ windowLabel: null, colour: "--chart-1", seriesLabel: "Front travel", unit: "mm", value: null });
  });
});
