import { describe, expect, it } from "vitest";

import { MARK_NAMES } from "../plotForm/types";
import { CHART_TYPE_CATALOG, CHART_TYPE_IDS, chartTypeInfo } from "./chartTypeCatalog";

describe("CHART_TYPE_CATALOG", () => {
  it("CHART_TYPE_CATALOG — one entry per CHART_TYPE_IDS value, same set — no drift between the two", () => {
    // Act
    const catalogIds = CHART_TYPE_CATALOG.map((c) => c.id);

    // Assert
    expect(new Set(catalogIds)).toEqual(new Set(CHART_TYPE_IDS));
    expect(catalogIds).toHaveLength(CHART_TYPE_IDS.length);
  });

  it("CHART_TYPE_IDS — contains every MARK_NAMES value — the five time marks are still all offered", () => {
    // Assert
    for (const mark of MARK_NAMES) {
      expect(CHART_TYPE_IDS).toContain(mark);
    }
  });

  it("CHART_TYPE_CATALOG — every entry has a non-empty label and blurb", () => {
    // Assert
    for (const entry of CHART_TYPE_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.blurb.length).toBeGreaterThan(0);
    }
  });

  it("CHART_TYPE_CATALOG — a mark entry's mark equals its id and charts \"time\"; every other entry's mark is null", () => {
    // Assert — a non-mark entry is either a whole-cell chart kind (its
    // `chart` is not `"time"`) or a preset over the time cell whose picture
    // is not a plain line (`"variance"`, R215 item 4, which does chart
    // `"time"`); both carry `mark: null`, which is what `NodeCard.tsx`'s
    // header glyph reads.
    for (const entry of CHART_TYPE_CATALOG) {
      if ((MARK_NAMES as readonly string[]).includes(entry.id)) {
        expect(entry.mark).toBe(entry.id);
        expect(entry.chart).toBe("time");
      } else {
        expect(entry.mark).toBeNull();
      }
    }
  });

  it("CHART_TYPE_CATALOG — \"variance\" — is a time-cell preset: charts \"time\" but carries no mark", () => {
    // Assert
    const variance = CHART_TYPE_CATALOG.find((c) => c.id === "variance");
    expect(variance?.chart).toBe("time");
    expect(variance?.mark).toBeNull();
  });
});

describe("chartTypeInfo", () => {
  it("chartTypeInfo — \"lineY\" — the Line entry", () => {
    // Act
    const info = chartTypeInfo("lineY");

    // Assert
    expect(info.label).toBe("Line");
  });

  it("chartTypeInfo — \"fft\" — the FFT entry, charting \"fft\" with no mark (R215 item 1)", () => {
    // Act
    const info = chartTypeInfo("fft");

    // Assert
    expect(info.label).toBe("FFT");
    expect(info.chart).toBe("fft");
    expect(info.mark).toBeNull();
  });

  it("chartTypeInfo — every CHART_TYPE_IDS value resolves without throwing", () => {
    // Assert
    for (const id of CHART_TYPE_IDS) {
      expect(() => chartTypeInfo(id)).not.toThrow();
    }
  });
});
