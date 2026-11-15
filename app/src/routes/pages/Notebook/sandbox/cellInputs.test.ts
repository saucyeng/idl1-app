import { describe, expect, it } from "vitest";

import { cellInputNames } from "./cellInputs";

const BOUND = ["Plot", "channel", "cursor", "Readout", "GPS_SpeedKmh", "HR_BPM"];

describe("cellInputNames", () => {
  it("cellInputNames — a chart that never names cursor — every bound name but cursor", () => {
    const code = 'Plot.plot({ marks: [Plot.lineY(channel("GPS_SpeedKmh"), { x: "t", y: "v" })] })';

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toEqual(["Plot", "channel", "GPS_SpeedKmh", "HR_BPM"]);
  });

  it("cellInputNames — a cell that names cursor — cursor included, Readout not", () => {
    const code = "html`${cursor.t}`";

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toEqual(["Plot", "channel", "cursor", "GPS_SpeedKmh", "HR_BPM"]);
  });

  it("cellInputNames — a readout cell — Readout included, cursor not", () => {
    const code = 'Readout.number("HR_BPM", {})';

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toEqual(["Plot", "channel", "Readout", "GPS_SpeedKmh", "HR_BPM"]);
  });

  it("cellInputNames — a longer identifier containing cursor — is not a mention", () => {
    const code = "const cursorLine = 1; my_cursor + cursor2";

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).not.toContain("cursor");
  });

  it("cellInputNames — cursor as a property access — is a mention", () => {
    const code = "cursor.t";

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toContain("cursor");
  });
});
