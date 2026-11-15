import { describe, expect, it } from "vitest";

import { applyConversion, displayConversion, type DisplayUnits } from "./units";

const IMPERIAL: DisplayUnits = { distance: "mi", temperature: "F" };
const METRIC: DisplayUnits = { distance: "km", temperature: "C" };

describe("displayConversion", () => {
  it("displayConversion — km/h with miles — mph, 100 km/h reads 62.1", () => {
    const unit = "km/h";

    const c = displayConversion(unit, IMPERIAL);

    expect(c.unit).toBe("mph");
    expect(applyConversion(100, c)).toBeCloseTo(62.137, 2);
  });

  it("displayConversion — m/s with miles — mph, 10 m/s reads 22.4", () => {
    const unit = "m/s";

    const c = displayConversion(unit, IMPERIAL);

    expect(c.unit).toBe("mph");
    expect(applyConversion(10, c)).toBeCloseTo(22.369, 2);
  });

  it("displayConversion — °C with F — 20 °C reads 68 °F", () => {
    const unit = "°C";

    const c = displayConversion(unit, IMPERIAL);

    expect(c.unit).toBe("°F");
    expect(applyConversion(20, c)).toBeCloseTo(68);
  });

  it("displayConversion — metric choices — shown as recorded", () => {
    const units = ["km/h", "°C", "bpm"];

    const cs = units.map((u) => displayConversion(u, METRIC));

    expect(cs).toEqual(units.map((u) => ({ unit: u, scale: 1, offset: 0 })));
  });

  it("displayConversion — g, bpm, m with imperial — unchanged (everything else stays metric)", () => {
    const units = ["g", "bpm", "m"];

    const cs = units.map((u) => displayConversion(u, IMPERIAL));

    expect(cs.map((c) => c.scale)).toEqual([1, 1, 1]);
  });

  it("applyConversion — null — null", () => {
    const c = displayConversion("km/h", IMPERIAL);

    const v = applyConversion(null, c);

    expect(v).toBeNull();
  });
});
