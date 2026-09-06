import { describe, expect, it } from "vitest";

import { formatNeutralZoneVisits, formatSectors } from "./lapDetailFormat";

describe("formatSectors", () => {
  it("formatSectors — null (session-side lap absent) — reads as an em dash", () => {
    const text = formatSectors(null);

    expect(text).toBe("—");
  });

  it("formatSectors — empty array (lap really has no sectors) — reads as blank, not an em dash", () => {
    const text = formatSectors([]);

    expect(text).toBe("");
  });

  it("formatSectors — one sector — name plus its duration in seconds", () => {
    const text = formatSectors([{ name: "S1", start_ms: 1000, end_ms: 13_345, start_time_secs: 1, end_time_secs: 13.345 }]);

    expect(text).toBe("S1 12.345s");
  });

  it("formatSectors — two sectors — both rendered, comma-separated, in array order", () => {
    const text = formatSectors([
      { name: "S1", start_ms: 0, end_ms: 20_000, start_time_secs: 0, end_time_secs: 20 },
      { name: "S2", start_ms: 20_000, end_ms: 30_010, start_time_secs: 20, end_time_secs: 30.01 },
    ]);

    expect(text).toBe("S1 20.000s, S2 10.010s");
  });
});

describe("formatNeutralZoneVisits", () => {
  it("formatNeutralZoneVisits — null (session-side lap absent) — reads as an em dash", () => {
    const text = formatNeutralZoneVisits(null);

    expect(text).toBe("—");
  });

  it("formatNeutralZoneVisits — empty array (lap recorded no visits) — reads as blank, not an em dash", () => {
    const text = formatNeutralZoneVisits([]);

    expect(text).toBe("");
  });

  it("formatNeutralZoneVisits — one visit — name plus its duration in seconds, one decimal place", () => {
    const text = formatNeutralZoneVisits([{ name: "Pit", enter_ms: 1000, exit_ms: 6000 }]);

    expect(text).toBe("Pit 5.0s");
  });
});
