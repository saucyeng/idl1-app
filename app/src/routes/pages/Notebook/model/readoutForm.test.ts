import { describe, expect, it } from "vitest";

import { defaultGaugeRange, defaultReadout, displayUnitLabel, fromDisplay, readoutChannel, toDisplay } from "./readoutForm";

const IMPERIAL = { distance: "mi", temperature: "F" } as const;
const METRIC = { distance: "km", temperature: "C" } as const;
const CHANNELS = [
  { id: "GPS_SpeedKmh", label: "GPS speed", unit: "km/h" },
  { id: "HR_BPM", label: "Heart rate", unit: "bpm" },
  { id: "IMU0_AccelX", label: "IMU0 X", unit: "g" },
];

describe("defaultGaugeRange", () => {
  it("defaultGaugeRange — km/h — 0 to 40 mph, stored in km/h", () => {
    const unit = "km/h";

    const r = defaultGaugeRange(unit);

    expect(toDisplay(r[1], unit, IMPERIAL)).toBe(40);
  });

  it("defaultGaugeRange — bpm and an unknown unit — 60 to 200, and 0 to 100", () => {
    const units = ["bpm", "g"];

    const rs = units.map(defaultGaugeRange);

    expect(rs).toEqual([[60, 200], [0, 100]]);
  });
});

describe("defaultReadout", () => {
  it("defaultReadout — gauge on speed — fixed default range, the channel's label", () => {
    const channel = "GPS_SpeedKmh";

    const props = defaultReadout("gauge", channel, CHANNELS);

    expect(props).toEqual({ readout: "gauge", channel, range: { kind: "fixed", min: 0, max: 64.37376 }, label: "GPS speed" });
  });

  it("defaultReadout — g-g — x carried, y the next other channel, 1.5 g, 0.5 g rings, 2 s tail", () => {
    const channel = "IMU0_AccelX";

    const props = defaultReadout("gg", channel, CHANNELS);

    expect(props).toEqual({ readout: "gg", xChannel: channel, yChannel: "GPS_SpeedKmh", limit: 1.5, rings: 0.5, tailS: 2 });
  });

  it("readoutChannel — g-g — its x channel", () => {
    const props = defaultReadout("gg", "HR_BPM", CHANNELS);

    const carried = readoutChannel(props);

    expect(carried).toBe("HR_BPM");
  });
});

describe("toDisplay / fromDisplay", () => {
  it("fromDisplay — 50 mph typed — stored as 80.4672 km/h, and back to 50", () => {
    const shown = 50;

    const stored = fromDisplay(shown, "km/h", IMPERIAL);

    expect(stored).toBeCloseTo(80.4672, 4);
    expect(toDisplay(stored, "km/h", IMPERIAL)).toBe(50);
  });

  it("fromDisplay — metric, or a unit that never converts — unchanged", () => {
    const cases: [string, typeof METRIC | typeof IMPERIAL][] = [["km/h", METRIC], ["bpm", IMPERIAL]];

    const out = cases.map(([u, d]) => fromDisplay(65, u, d));

    expect(out).toEqual([65, 65]);
  });

  it("displayUnitLabel — km/h with miles — mph", () => {
    const unit = "km/h";

    const label = displayUnitLabel(unit, IMPERIAL);

    expect(label).toBe("mph");
  });
});
