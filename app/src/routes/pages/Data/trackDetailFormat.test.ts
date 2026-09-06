import { describe, expect, it } from "vitest";

import type { Gate, LapTiming, NeutralZone, SectorGate } from "../../../ipc/catalog";
import {
  formatGate,
  formatLapTiming,
  formatNeutralZones,
  formatRescanSessionsLabel,
  formatReferencePolylineSummary,
  formatSectorGates,
} from "./trackDetailFormat";

const gate1: Gate = { lat1: 51.5, lon1: -0.1, lat2: 51.501, lon2: -0.099 };
const gate2: Gate = { lat1: 51.6, lon1: -0.2, lat2: 51.601, lon2: -0.199 };

describe("formatGate", () => {
  it("formatGate — two endpoints — six decimal places, degree symbol, arrow between them", () => {
    const text = formatGate(gate1);

    expect(text).toBe("51.500000°, -0.100000° → 51.501000°, -0.099000°");
  });
});

describe("formatLapTiming", () => {
  it("formatLapTiming — null — reads as not configured", () => {
    expect(formatLapTiming(null)).toBe("Not configured");
  });

  it("formatLapTiming — circuit — names the kind and the one gate", () => {
    const timing: LapTiming = { kind: "circuit", start_finish: gate1 };

    const text = formatLapTiming(timing);

    expect(text).toBe(`Circuit — start/finish ${formatGate(gate1)}`);
  });

  it("formatLapTiming — point_to_point — names both gates", () => {
    const timing: LapTiming = { kind: "point_to_point", start: gate1, finish: gate2 };

    const text = formatLapTiming(timing);

    expect(text).toBe(`Point to point — start ${formatGate(gate1)}, finish ${formatGate(gate2)}`);
  });
});

describe("formatSectorGates", () => {
  it("formatSectorGates — empty — reads as None", () => {
    expect(formatSectorGates([])).toBe("None");
  });

  it("formatSectorGates — two gates — both named, semicolon-joined", () => {
    const gates: SectorGate[] = [
      { name: "S1", gate: gate1 },
      { name: "S2", gate: gate2 },
    ];

    const text = formatSectorGates(gates);

    expect(text).toBe(`S1: ${formatGate(gate1)}; S2: ${formatGate(gate2)}`);
  });
});

describe("formatNeutralZones", () => {
  it("formatNeutralZones — empty — reads as None", () => {
    expect(formatNeutralZones([])).toBe("None");
  });

  it("formatNeutralZones — one zone — names enter and exit gates", () => {
    const zones: NeutralZone[] = [{ name: "Pit", enter: gate1, exit: gate2 }];

    const text = formatNeutralZones(zones);

    expect(text).toBe(`Pit — enter ${formatGate(gate1)}, exit ${formatGate(gate2)}`);
  });
});

describe("formatReferencePolylineSummary", () => {
  it("formatReferencePolylineSummary — empty — reads as no points recorded", () => {
    expect(formatReferencePolylineSummary([])).toBe("No points recorded.");
  });

  it("formatReferencePolylineSummary — one point — singular noun, first equals last", () => {
    const points = [{ lat: 51.5, lon: -0.1 }];

    const text = formatReferencePolylineSummary(points);

    expect(text).toBe("1 point (51.500000°, -0.100000° → 51.500000°, -0.100000°)");
  });

  it("formatReferencePolylineSummary — three points — plural noun, first and last named, middle omitted", () => {
    const points = [
      { lat: 51.5, lon: -0.1 },
      { lat: 51.55, lon: -0.15 },
      { lat: 51.6, lon: -0.2 },
    ];

    const text = formatReferencePolylineSummary(points);

    expect(text).toBe("3 points (51.500000°, -0.100000° → 51.600000°, -0.200000°)");
  });
});

describe("formatRescanSessionsLabel", () => {
  it("formatRescanSessionsLabel — one session — singular noun", () => {
    expect(formatRescanSessionsLabel(1)).toBe("Rescan 1 session");
  });

  it("formatRescanSessionsLabel — three sessions — plural noun", () => {
    expect(formatRescanSessionsLabel(3)).toBe("Rescan 3 sessions");
  });
});
