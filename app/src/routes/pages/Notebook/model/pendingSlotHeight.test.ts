import { describe, expect, it } from "vitest";

import { DEFAULT_JS_CELL_HEIGHT_PX } from "./jsCellFrameHeight";
import { DEFAULT_TEXT_CELL_HEIGHT_PX, pendingSlotHeightPx } from "./pendingSlotHeight";

describe("pendingSlotHeightPx", () => {
  it("pendingSlotHeightPx — a js cell — the height its chart will render at, so nothing jumps", () => {
    const height = pendingSlotHeightPx("js");

    expect(height).toBe(DEFAULT_JS_CELL_HEIGHT_PX);
  });

  it("pendingSlotHeightPx — a math cell — a text-sized slot, not a chart-sized hole", () => {
    const height = pendingSlotHeightPx("math");

    expect(height).toBe(DEFAULT_TEXT_CELL_HEIGHT_PX);
  });

  it("pendingSlotHeightPx — a table cell — the same text-sized slot", () => {
    const height = pendingSlotHeightPx("table");

    expect(height).toBe(DEFAULT_TEXT_CELL_HEIGHT_PX);
  });

  it("pendingSlotHeightPx — an unrecognised kind — the text height, never zero", () => {
    const height = pendingSlotHeightPx("prose");

    expect(height).toBeGreaterThan(0);
  });
});
