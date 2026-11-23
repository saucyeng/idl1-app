import { describe, expect, it } from "vitest";

import { parseOptions, parseReadoutCall } from "./call";

describe("parseReadoutCall", () => {
  it("parseReadoutCall — a gauge with options — name and options", () => {
    const call = parseReadoutCall('Readout.gauge("GPS_SpeedKmh", { range: "ride", label: "Speed" })');

    expect(call).toEqual({ kind: "gauge", name: "GPS_SpeedKmh", opts: { range: "ride", label: "Speed" } });
  });

  it("parseReadoutCall — a g-g with numbers and single quotes — both names and numbers", () => {
    const call = parseReadoutCall("Readout.gg('corner_g', 'brake_g', { limit: 1.5, rings: 0.5, tail_s: 2, label: 'g' })");

    expect(call).toEqual({ kind: "gg", x: "corner_g", y: "brake_g", opts: { limit: 1.5, rings: 0.5, tail_s: 2, label: "g" } });
  });

  it("parseReadoutCall — a number with no options and a chart cell — the number, then null", () => {
    expect(parseReadoutCall('Readout.number("fork_g")')).toEqual({ kind: "number", name: "fork_g", opts: {} });
    expect(parseReadoutCall("Plot.plot({ marks: [] })")).toBeNull();
  });
});

describe("parseOptions", () => {
  it("parseOptions — a trailing comma and a non-literal — parsed, then null", () => {
    expect(parseOptions("{ min: 0, max: 80, }")).toEqual({ min: 0, max: 80 });
    expect(parseOptions("{ max: someVar }")).toBeNull();
  });
});

describe("parseReadoutCall — trace", () => {
  it("parseReadoutCall — a trace with a window — name and options", () => {
    expect(parseReadoutCall('Readout.trace("fork_g", { window_s: 6, min: 0, max: 40, label: "Fork" })')).toEqual({
      kind: "trace",
      name: "fork_g",
      opts: { window_s: 6, min: 0, max: 40, label: "Fork" },
    });
  });
});
