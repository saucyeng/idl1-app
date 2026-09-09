import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellOutput, Window as SelectedWindow } from "../../../../ipc/workbook";
import { buildGraphModel } from "./graphModel";
import { buildSourcePalette, filterSourcePalette } from "./sourcePalette";

function window(sessionId: string): SelectedWindow {
  return { session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" };
}

function session(sessionId: string, channelIds: string[]): SessionDetail {
  return {
    session_id: sessionId,
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: channelIds.map((id) => ({ channel_id: id, nominal_rate_hz: 100, unit: "", source_kind: "imu0", channel_kind: "fixed-rate" as const, sample_count: 0 })),
    rider: "",
    bike: "",
    track: "",
    conditions: "",
    notes: "",
    laps: [],
  } as unknown as SessionDetail;
}

const DOC =
  "---\n" +
  "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
  "name: Fork tuning\n" +
  "constants:\n" +
  "  rider_mass_kg: \"82 kg\"\n" +
  "  g: 9.80665\n" +
  "---\n" +
  "```math id=a1b2c3d4\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "fork_bottom_out = [fork_velocity] > 5\n" +
  "```\n";

const FLOW_DOC =
  "---\n" + "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" + "name: Fork tuning\n" + "constants: { rider_mass_kg: 82, wheel_diam: \"29 in\" }\n" + "---\n" + "```math id=a1b2c3d4\n" + "x = 1\n" + "```\n";

describe("buildSourcePalette — channels", () => {
  it("buildSourcePalette — no windows selected — channelsAvailability is no-selection, no channel groups", () => {
    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.channelsAvailability).toBe("no-selection");
    expect(palette.channelGroups).toEqual([]);
    expect(palette.pendingSessionCount).toBe(0);
  });

  it("buildSourcePalette — a window selected but its session not yet resolved — channelsAvailability is loading, not an empty ready list", () => {
    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [window("s1")], sessionDetails: new Map() });

    // Assert
    expect(palette.channelsAvailability).toBe("loading");
    expect(palette.pendingSessionCount).toBe(1);
    expect(palette.channelGroups).toEqual([]);
  });

  it("buildSourcePalette — one resolved session — channels grouped by prefix, each row carries its rate", () => {
    // Arrange
    const details = new Map([["s1", session("s1", ["IMU1_AccelZ", "IMU1_AccelX", "GPS_SpeedKmh"])]]);

    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [window("s1")], sessionDetails: details });

    // Assert
    expect(palette.channelsAvailability).toBe("ready");
    expect(palette.pendingSessionCount).toBe(0);
    const groupLabels = palette.channelGroups.map((g) => g.label);
    expect(groupLabels).toEqual(["GPS", "IMU1"]);
    const imu1 = palette.channelGroups.find((g) => g.label === "IMU1");
    expect(imu1?.rows.map((r) => r.name)).toEqual(["IMU1_AccelX", "IMU1_AccelZ"]);
    expect(imu1?.rows.every((r) => r.rateHz === 100 && r.partial === false)).toBe(true);
  });

  it("buildSourcePalette — a channel with no recorded C1 unit — row is unknown, not dimensionless (R154 item 6)", () => {
    // Arrange
    const details = new Map([["s1", session("s1", ["IMU1_AccelZ"])]]); // session()'s fixture channels all carry unit: ""

    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [window("s1")], sessionDetails: details });

    // Assert
    const row = palette.channelGroups.flatMap((g) => g.rows).find((r) => r.name === "IMU1_AccelZ");
    expect(row?.unit).toEqual({ state: "unknown", reason: "no unit recorded for this channel" });
  });

  it("buildSourcePalette — a channel with a recorded C1 unit — row is known, verbatim", () => {
    // Arrange
    const detail = session("s1", ["GPS_SpeedKmh"]);
    detail.channels = detail.channels.map((c) => ({ ...c, unit: "km/h" }));
    const details = new Map([["s1", detail]]);

    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [window("s1")], sessionDetails: details });

    // Assert
    const row = palette.channelGroups.flatMap((g) => g.rows).find((r) => r.name === "GPS_SpeedKmh");
    expect(row?.unit).toEqual({ state: "known", text: "km/h" });
  });

  it("buildSourcePalette — two resolved sessions disagreeing on a channel — union, the missing one marked partial, none hidden", () => {
    // Arrange
    const details = new Map([
      ["s1", session("s1", ["IMU1_AccelZ", "GPS_SpeedKmh"])],
      ["s2", session("s2", ["IMU1_AccelZ"])],
    ]);

    // Act
    const palette = buildSourcePalette({
      markdown: DOC,
      model: buildGraphModel(DOC, []),
      selectedWindows: [window("s1"), window("s2")],
      sessionDetails: details,
    });

    // Assert
    const allRows = palette.channelGroups.flatMap((g) => g.rows);
    expect(allRows.map((r) => r.name).sort()).toEqual(["GPS_SpeedKmh", "IMU1_AccelZ"]);
    expect(allRows.find((r) => r.name === "IMU1_AccelZ")?.partial).toBe(false);
    expect(allRows.find((r) => r.name === "GPS_SpeedKmh")?.partial).toBe(true);
  });

  it("buildSourcePalette — one resolved, one still-pending session — ready with a positive pendingSessionCount, no channel wrongly marked partial for the pending one", () => {
    // Arrange
    const details = new Map([["s1", session("s1", ["IMU1_AccelZ"])]]);

    // Act
    const palette = buildSourcePalette({
      markdown: DOC,
      model: buildGraphModel(DOC, []),
      selectedWindows: [window("s1"), window("s2")],
      sessionDetails: details,
    });

    // Assert
    expect(palette.channelsAvailability).toBe("ready");
    expect(palette.pendingSessionCount).toBe(1);
    const row = palette.channelGroups.flatMap((g) => g.rows).find((r) => r.name === "IMU1_AccelZ");
    expect(row?.partial).toBe(false); // present on the only *resolved* session — s2's pending status must not grey it
  });
});

describe("buildSourcePalette — constants", () => {
  it("buildSourcePalette — block-style front-matter constants — a bare number and a unit-suffixed one, both read", () => {
    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.constants).toEqual([
      { label: "Constants", rows: [{ kind: "constant", name: "g", value: 9.80665 }, { kind: "constant", name: "rider_mass_kg", value: 82 }] },
    ]);
  });

  it("buildSourcePalette — flow-style front-matter constants on one line — both entries read", () => {
    // Act
    const palette = buildSourcePalette({ markdown: FLOW_DOC, model: buildGraphModel(FLOW_DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    const names = palette.constants[0]?.rows.map((r) => r.name);
    expect(names).toEqual(["rider_mass_kg", "wheel_diam"]);
    expect(palette.constants[0]?.rows.find((r) => r.name === "wheel_diam")?.value).toBe(29);
  });

  it("buildSourcePalette — a math cell's own const line — listed alongside front-matter constants", () => {
    // Arrange
    const doc = DOC.replace("fork_velocity = differentiate([fork_travel])", "const stroke_mm = 195\nfork_velocity = differentiate([fork_travel])");

    // Act
    const palette = buildSourcePalette({ markdown: doc, model: buildGraphModel(doc, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.constants[0]?.rows.map((r) => r.name)).toContain("stroke_mm");
    expect(palette.constants[0]?.rows.find((r) => r.name === "stroke_mm")?.value).toBe(195);
  });

  it("buildSourcePalette — no constants: key and no const lines — no Constants group at all", () => {
    // Arrange
    const doc = "---\nid: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\nname: Fork tuning\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const palette = buildSourcePalette({ markdown: doc, model: buildGraphModel(doc, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.constants).toEqual([]);
  });
});

describe("buildSourcePalette — definitions", () => {
  it("buildSourcePalette — every def_line in the document — one Definitions group, rate null until CellDefResult carries it", () => {
    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.definitions[0]?.rows.map((r) => r.name)).toEqual(["fork_velocity", "fork_bottom_out"]);
    expect(palette.definitions[0]?.rows.every((r) => r.sampleRateHz === null)).toBe(true);
  });

  it("buildSourcePalette — no outputs — every definition row is UNIT_NOT_YET_EVALUATED", () => {
    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Assert
    expect(palette.definitions[0]?.rows.every((r) => r.unit.state === "unknown" && r.unit.reason === "not evaluated yet")).toBe(true);
  });

  it("buildSourcePalette — outputs carrying this definition's CellDefResult — the row's own unit, not the fallback", () => {
    // Arrange
    const outputs: CellOutput[] = [
      {
        cell_id: "a1b2c3d4",
        kind: "math",
        value: null,
        defs: [
          { name: "fork_velocity", label: null, value: null, error: null, sample_rate_hz: null, unit: { state: "known", text: "mm/s" }, unit_notes: [] },
          { name: "fork_bottom_out", label: null, value: null, error: null, sample_rate_hz: null, unit: { state: "dimensionless" }, unit_notes: [] },
        ],
        errors: [],
        prose_before_html: null,
        prose_after_html: null,
        prose_spans: [],
      },
    ];

    // Act
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map(), outputs });

    // Assert
    const rows = palette.definitions[0]?.rows ?? [];
    expect(rows.find((r) => r.name === "fork_velocity")?.unit).toEqual({ state: "known", text: "mm/s" });
    expect(rows.find((r) => r.name === "fork_bottom_out")?.unit).toEqual({ state: "dimensionless" });
  });
});

describe("filterSourcePalette", () => {
  it("filterSourcePalette — empty query — returns the same palette object, unfiltered", () => {
    // Arrange
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Act
    const filtered = filterSourcePalette(palette, "");

    // Assert
    expect(filtered).toBe(palette);
  });

  it("filterSourcePalette — a query matching one definition — other groups and non-matching rows drop out", () => {
    // Arrange
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Act
    const filtered = filterSourcePalette(palette, "fork_velo");

    // Assert
    expect(filtered.definitions).toEqual([{ label: "Definitions", rows: [expect.objectContaining({ name: "fork_velocity" })] }]);
    expect(filtered.constants.flatMap((g) => g.rows).some((r) => r.name === "fork_velocity")).toBe(false);
  });

  it("filterSourcePalette — a query matching nothing — every group drops, none left empty-but-present", () => {
    // Arrange
    const palette = buildSourcePalette({ markdown: DOC, model: buildGraphModel(DOC, []), selectedWindows: [], sessionDetails: new Map() });

    // Act
    const filtered = filterSourcePalette(palette, "zzz_no_match");

    // Assert
    expect(filtered.definitions).toEqual([]);
    expect(filtered.constants).toEqual([]);
    expect(filtered.channelGroups).toEqual([]);
  });
});
