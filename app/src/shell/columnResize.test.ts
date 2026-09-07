import { describe, expect, it } from "vitest";

import { DEFAULT_COLUMN_PREFS } from "./columnPrefs";
import { COLLAPSED_THRESHOLD_PX, decideSettledColumnPrefs } from "./columnResize";

describe("decideSettledColumnPrefs", () => {
  it("decideSettledColumnPrefs — no settled sizes — returns prefs unchanged", () => {
    const next = decideSettledColumnPrefs(DEFAULT_COLUMN_PREFS, {});

    expect(next).toEqual(DEFAULT_COLUMN_PREFS);
  });

  it("decideSettledColumnPrefs — one column settled above the threshold — writes only that column's width", () => {
    const next = decideSettledColumnPrefs(DEFAULT_COLUMN_PREFS, { library: 340.4 });

    expect(next.widths.library).toBe(340);
    expect(next.widths.properties).toBe(DEFAULT_COLUMN_PREFS.widths.properties);
    expect(next.collapsed).toEqual([]);
  });

  it("decideSettledColumnPrefs — a column settled at or below the threshold — added to collapsed once", () => {
    const next = decideSettledColumnPrefs(DEFAULT_COLUMN_PREFS, { library: COLLAPSED_THRESHOLD_PX });

    expect(next.collapsed).toEqual(["library"]);
  });

  it("decideSettledColumnPrefs — a previously collapsed column settled back open — removed from collapsed", () => {
    const collapsedPrefs = { ...DEFAULT_COLUMN_PREFS, collapsed: ["library" as const] };

    const next = decideSettledColumnPrefs(collapsedPrefs, { library: 250 });

    expect(next.collapsed).toEqual([]);
  });

  it("decideSettledColumnPrefs — output settled at zero — never recorded as collapsed", () => {
    const next = decideSettledColumnPrefs(DEFAULT_COLUMN_PREFS, { output: 0 });

    expect(next.widths.output).toBe(0);
    expect(next.collapsed).toEqual([]);
  });

  it("decideSettledColumnPrefs — multiple columns settled at once — each folded independently, order preserved", () => {
    const next = decideSettledColumnPrefs(DEFAULT_COLUMN_PREFS, { library: 2, properties: 300 });

    expect(next.collapsed).toEqual(["library"]);
    expect(next.widths.properties).toBe(300);
  });

  it("decideSettledColumnPrefs — a column absent from the settle snapshot — keeps its previous collapsed membership", () => {
    const collapsedPrefs = { ...DEFAULT_COLUMN_PREFS, collapsed: ["maths" as const] };

    const next = decideSettledColumnPrefs(collapsedPrefs, { library: 260 });

    expect(next.collapsed).toEqual(["maths"]);
  });
});
