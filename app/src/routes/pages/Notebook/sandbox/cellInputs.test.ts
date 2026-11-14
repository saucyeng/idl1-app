import { describe, expect, it } from "vitest";

import { cellInputNames } from "./cellInputs";

const BOUND = ["Plot", "channel", "cursor", "GPS_SpeedKmh", "HR_BPM"];

describe("cellInputNames", () => {
  it("cellInputNames — a chart that never names cursor — every bound name but cursor", () => {
    const code = 'Plot.plot({ marks: [Plot.lineY(channel("GPS_SpeedKmh"), { x: "t", y: "v" })] })';

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toEqual(["Plot", "channel", "GPS_SpeedKmh", "HR_BPM"]);
  });

  it("cellInputNames — a readout that names cursor — every bound name, cursor included", () => {
    const code = 'Readout.number(channel("HR_BPM"), cursor, {})';

    const inputs = cellInputNames(code, BOUND);

    expect(inputs).toEqual(BOUND);
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
