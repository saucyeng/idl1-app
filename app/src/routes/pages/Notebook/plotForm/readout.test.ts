import { describe, expect, it } from "vitest";

import { generateReadout, parseReadout, type ReadoutProps } from "./readout";

describe("parseReadout / generateReadout round trip", () => {
  const cases: [string, ReadoutProps][] = [
    ["fixed gauge", { readout: "gauge", channel: "GPS_SpeedKmh", range: { kind: "fixed", min: 0, max: 64.37376 }, label: "Speed" }],
    ["ride gauge, every option", { readout: "gauge", channel: "HR_BPM", range: { kind: "ride" }, label: "Heart rate", digits: 0, style: "tach", icon: "heart" }],
    ["bare number", { readout: "number", channel: "HR_BPM" }],
    ["number with options", { readout: "number", channel: "HR_BPM", label: "HR", digits: 1, icon: "heart" }],
    ["g-g", { readout: "gg", xChannel: "lat_g", yChannel: "lon_g", limit: 1.5, rings: 0.5, tailS: 2, label: "g-g" }],
  ];

  for (const [name, props] of cases) {
    it(`round trip — ${name} — parse(generate(p)) is p`, () => {
      const code = generateReadout(props);

      const back = parseReadout(code);

      expect(back).toEqual(props);
    });
  }
});

describe("generateReadout", () => {
  it("generateReadout — fixed gauge — the C2 option order", () => {
    const props: ReadoutProps = { readout: "gauge", channel: "s", range: { kind: "fixed", min: 0, max: 65 }, label: "Speed", style: "speedo" };

    const code = generateReadout(props);

    expect(code).toBe('Readout.gauge("s", { min: 0, max: 65, label: "Speed", style: "speedo" })');
  });

  it("generateReadout — bare number — empty braces", () => {
    const props: ReadoutProps = { readout: "number", channel: "x" };

    const code = generateReadout(props);

    expect(code).toBe('Readout.number("x", {})');
  });
});

describe("parseReadout", () => {
  it("parseReadout — keys hand-reordered — still parses", () => {
    const code = 'Readout.gg("a", "b", { tail_s: 1, rings: 0.25, limit: 2 })';

    const props = parseReadout(code);

    expect(props).toEqual({ readout: "gg", xChannel: "a", yChannel: "b", limit: 2, rings: 0.25, tailS: 1 });
  });

  it("parseReadout — a negative minimum — kept", () => {
    const code = 'Readout.gauge("t", { min: -10, max: 40 })';

    const props = parseReadout(code);

    expect(props).toEqual({ readout: "gauge", channel: "t", range: { kind: "fixed", min: -10, max: 40 } });
  });

  const custom: [string, string][] = [
    ["an unknown option", 'Readout.gauge("s", { min: 0, max: 1, colour: "red" })'],
    ["both a range and min/max", 'Readout.gauge("s", { range: "ride", min: 0, max: 1 })'],
    ["min above max", 'Readout.gauge("s", { min: 5, max: 1 })'],
    ["a gauge with no range", 'Readout.gauge("s", { label: "x" })'],
    ["a g-g missing tail_s", 'Readout.gg("a", "b", { limit: 1, rings: 0.5 })'],
    ["a name built at run time", "Readout.number(name, {})"],
    ["a second statement", 'Readout.number("x", {})\nPlot.plot({})'],
    ["an unknown readout", 'Readout.dial("x", {})'],
    ["a chart", 'Plot.plot({ marks: [] })'],
    ["fractional digits", 'Readout.number("x", { digits: 1.5 })'],
  ];
  for (const [name, code] of custom) {
    it(`parseReadout — ${name} — null (custom code)`, () => {
      const source = code;

      const props = parseReadout(source);

      expect(props).toBeNull();
    });
  }
});

describe("readout options added 2026-11-23", () => {
  it("parseReadout / generateReadout — a heart-rate gauge with zones and smoothing — round trips", () => {
    const code = 'Readout.gauge("HR_BPM", { min: 60, max: 200, label: "Heart rate", style: "tach", icon: "heart", zones: "hr", smooth_s: 2 })';

    const props = parseReadout(code);

    expect(props).toMatchObject({ readout: "gauge", zones: "hr", smoothS: 2 });
    expect(generateReadout(props!)).toBe(code);
  });

  it("parseReadout / generateReadout — a g-g with a vertical bar — round trips", () => {
    const code = 'Readout.gg("corner_g", "brake_g", { limit: 1.5, rings: 0.5, tail_s: 2, label: "G-G", vertical: "up_g", vertical_limit: 4 })';

    const props = parseReadout(code);

    expect(props).toMatchObject({ readout: "gg", vertical: "up_g", verticalLimit: 4 });
    expect(generateReadout(props!)).toBe(code);
  });
});
