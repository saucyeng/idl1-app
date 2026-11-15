import { describe, expect, it } from "vitest";

import { EMPTY_READOUT_FRAME, gaugeRange, gaugeView, ggView, numberView, type ReadoutFrame } from "./frame";

const FRAME: ReadoutFrame = {
  values: { speed: 50, hr: 150, ax: 0.4, ay: -0.2 },
  tail: { ax: [0.3, 0.2], ay: [-0.1, 0] },
  units: { speed: "km/h", hr: "bpm", ax: "g", ay: "g" },
  extent: { speed: [0, 80], hr: [70, 185] },
  display: { distance: "mi", temperature: "F" },
};

describe("gaugeRange", () => {
  it("gaugeRange — range ride — the ride's extent", () => {
    const opts = { range: "ride" as const, min: 5, max: 6 };

    const r = gaugeRange(FRAME, "hr", opts);

    expect(r).toEqual([70, 185]);
  });

  it("gaugeRange — range ride with no extent — 0 to 1", () => {
    const opts = { range: "ride" as const };

    const r = gaugeRange(FRAME, "missing", opts);

    expect(r).toEqual([0, 1]);
  });

  it("gaugeRange — typed — min and max, defaulting to 0 and 100", () => {
    const opts = { max: 65 };

    const r = gaugeRange(FRAME, "speed", opts);

    expect(r).toEqual([0, 65]);
  });
});

describe("gaugeView", () => {
  it("gaugeView — km/h shown in miles — value and range both in mph", () => {
    const opts = { min: 0, max: 64.37376 };

    const v = gaugeView(FRAME, "speed", opts);

    expect(v.unit).toBe("mph");
    expect(v.value).toBeCloseTo(31.07, 2);
    expect(v.max).toBeCloseTo(40, 4);
  });

  it("gaugeView — no options — speedo, 0 digits, no icon", () => {
    const opts = {};

    const v = gaugeView(FRAME, "hr", opts);

    expect([v.style, v.digits, v.icon]).toEqual(["speedo", 0, undefined]);
  });

  it("gaugeView — a name with no value — null value, gauge still drawn", () => {
    const opts = { min: 0, max: 10 };

    const v = gaugeView(EMPTY_READOUT_FRAME, "speed", opts);

    expect(v.value).toBeNull();
    expect([v.min, v.max]).toEqual([0, 10]);
  });
});

describe("numberView / ggView", () => {
  it("numberView — bpm — shown as recorded", () => {
    const opts = { label: "Heart rate", icon: "heart" as const };

    const v = numberView(FRAME, "hr", opts);

    expect(v).toEqual({ value: 150, unit: "bpm", label: "Heart rate", digits: 0, icon: "heart" });
  });

  it("ggView — two names — values, tails and default limit and rings", () => {
    const opts = {};

    const v = ggView(FRAME, "ax", "ay", opts);

    expect(v).toEqual({ x: 0.4, y: -0.2, tailX: [0.3, 0.2], tailY: [-0.1, 0], limit: 1.5, rings: 0.5, label: undefined });
  });
});
