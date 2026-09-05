import { describe, expect, it } from "vitest";

import { dropCellHeight, initialCellHeights, recordCellHeight } from "./cellLayout";

describe("recordCellHeight", () => {
  it("recordCellHeight — a new cell id — adds it without disturbing other entries", () => {
    const state = recordCellHeight(initialCellHeights, "cell-a", 240);

    const next = recordCellHeight(state, "cell-b", 120);

    expect(next.get("cell-a")).toBe(240);
    expect(next.get("cell-b")).toBe(120);
  });

  it("recordCellHeight — a cell id already recorded — replaces its height, leaves others untouched", () => {
    const state = recordCellHeight(recordCellHeight(initialCellHeights, "cell-a", 240), "cell-b", 120);

    const next = recordCellHeight(state, "cell-a", 300);

    expect(next.get("cell-a")).toBe(300);
    expect(next.get("cell-b")).toBe(120);
  });

  it("recordCellHeight — never mutates the state passed in", () => {
    const state = recordCellHeight(initialCellHeights, "cell-a", 240);

    recordCellHeight(state, "cell-a", 999);

    expect(state.get("cell-a")).toBe(240);
  });
});

describe("dropCellHeight", () => {
  it("dropCellHeight — a recorded cell id — removes only that entry", () => {
    const state = recordCellHeight(recordCellHeight(initialCellHeights, "cell-a", 240), "cell-b", 120);

    const next = dropCellHeight(state, "cell-a");

    expect(next.has("cell-a")).toBe(false);
    expect(next.get("cell-b")).toBe(120);
  });

  it("dropCellHeight — a cell id not recorded — returns the same map instance", () => {
    const state = recordCellHeight(initialCellHeights, "cell-a", 240);

    const next = dropCellHeight(state, "cell-b");

    expect(next).toBe(state);
  });
});
