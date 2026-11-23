import { describe, expect, it } from "vitest";

import { scanReadouts, tailCount } from "./scan";

describe("scanReadouts", () => {
  it("scanReadouts — gauge, number and g-g across cells — every name once, first-seen order", () => {
    const codes = [
      'Readout.gauge("GPS_SpeedKmh", { min: 0, max: 65 })',
      "Readout.number('HR_BPM', {})\nReadout.gauge(\"GPS_SpeedKmh\", { range: \"ride\" })",
      'Readout.gg("lat_g", "lon_g", { tail_s: 2 })',
    ];

    const scan = scanReadouts(codes);

    expect(scan.names).toEqual(["GPS_SpeedKmh", "HR_BPM", "lat_g", "lon_g"]);
  });

  it("scanReadouts — two g-g tails — the longest", () => {
    const codes = ['Readout.gg("a", "b", { tail_s: 1.5 })', 'Readout.gg("c", "d", { limit: 2, tail_s: 3 })'];

    const scan = scanReadouts(codes);

    expect(scan.tailS).toBe(3);
  });

  it("scanReadouts — tail_s in a cell with no g-g — ignored", () => {
    const codes = ['const opts = { tail_s: 9 }; Readout.gauge("x", {})'];

    const scan = scanReadouts(codes);

    expect(scan.tailS).toBe(0);
  });

  it("scanReadouts — a name built at run time — not found", () => {
    const codes = ["Readout.gauge(name, {})", "Plot.plot({})"];

    const scan = scanReadouts(codes);

    expect(scan).toEqual({ names: [], tailS: 0 });
  });

  it("scanReadouts — an escaped quote in the name — unescaped", () => {
    const codes = ['Readout.number("odd\\"name", {})'];

    const scan = scanReadouts(codes);

    expect(scan.names).toEqual(['odd"name']);
  });
});

describe("tailCount", () => {
  it("tailCount — 2 s at 59.94 fps — 120 points", () => {
    const [tailS, fps] = [2, 59.94];

    const n = tailCount(tailS, fps);

    expect(n).toBe(120);
  });

  it("tailCount — beyond the cap — 1024", () => {
    const [tailS, fps] = [60, 60];

    const n = tailCount(tailS, fps);

    expect(n).toBe(1024);
  });

  it("tailCount — no tail — 0", () => {
    const [tailS, fps] = [0, 60];

    const n = tailCount(tailS, fps);

    expect(n).toBe(0);
  });
});

describe("scanReadouts — traces", () => {
  it("scanReadouts — a trace with and without window_s — its name read, the longest window as the tail", () => {
    const scan = scanReadouts(['Readout.trace("fork_g", { window_s: 6 })', 'Readout.trace("rear_g")', 'Readout.gg("x", "y", { tail_s: 2 })']);

    expect(scan.names).toEqual(["fork_g", "rear_g", "x", "y"]);
    expect(scan.tailS).toBe(8);
  });
});
