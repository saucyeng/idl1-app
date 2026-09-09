import { describe, expect, it } from "vitest";

import { MARK_NAMES } from "../plotForm/types";
import { CHART_TYPE_CATALOG, chartTypeInfo } from "./chartTypeCatalog";

describe("CHART_TYPE_CATALOG", () => {
  it("CHART_TYPE_CATALOG — one entry per MARK_NAMES value, same set — no drift between the two", () => {
    // Act
    const catalogMarks = CHART_TYPE_CATALOG.map((c) => c.mark);

    // Assert
    expect(new Set(catalogMarks)).toEqual(new Set(MARK_NAMES));
    expect(catalogMarks).toHaveLength(MARK_NAMES.length);
  });

  it("CHART_TYPE_CATALOG — every entry has a non-empty label and blurb", () => {
    // Assert
    for (const entry of CHART_TYPE_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("chartTypeInfo", () => {
  it("chartTypeInfo — \"lineY\" — the Line entry", () => {
    // Act
    const info = chartTypeInfo("lineY");

    // Assert
    expect(info.label).toBe("Line");
  });

  it("chartTypeInfo — every MARK_NAMES value resolves without throwing", () => {
    // Assert
    for (const mark of MARK_NAMES) {
      expect(() => chartTypeInfo(mark)).not.toThrow();
    }
  });
});
