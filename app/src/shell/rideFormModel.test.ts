import { describe, expect, it } from "vitest";

import type { BikeLogView, EntryVersion } from "../ipc/bikelog";
import type { LapDetail, SessionDetail } from "../ipc/catalog";
import { attachedNotes, notesPatch, rideFacts, setupRows } from "./rideFormModel";

function lap(n: number, start: number, end: number): LapDetail {
  return { lap_number: n, start_timestamp_ms: start, end_timestamp_ms: end, raw_elapsed_ms: end - start, lap_time_ms: end - start, start_time_secs: 0, end_time_secs: 0, sectors: [], neutral_zone_visits: [] } as unknown as LapDetail;
}

function detail(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: "S", device_id: null, timestamp_utc_ms: 1_000, config_checksum: null, source_format: "idl1", blob_sha256: "", channels: [],
    rider: "Isaac", bike: "GT", bike_comment: "", venue_name: "Whistler", event_name: "", event_session: "", short_comment: "", long_comment: "", tag: "t",
    bike_profile_snapshot: null, laps: [lap(1, 1_000, 2_000), lap(2, 2_000, 2_900), lap(3, 2_900, 4_000)], track_visits: [], reference_lap_number: null,
    ignored_lap_numbers: [], main_lap_number: null, overlay_lap_key: null, starred_lap_number: null, track_visits_library_hash: null,
    ...over,
  } as SessionDetail;
}

function v(at: number, text: string, extra: Partial<EntryVersion> = {}): EntryVersion {
  return { version_id: `v${at}`, at_ms: at, updated_at_ms: at, device: "phone", text, ...extra };
}

const log: BikeLogView = {
  entries: [
    { entry: { entry_id: "base", bike_id: "gt", kind: "sheet", versions: [] }, current: v(10, "", { sheet: { "fork.lsc": 10, "fork.psi": 70 } }), in_conflict: false, heads: [], deleted: false },
    { entry: { entry_id: "before", bike_id: "gt", kind: "note", versions: [] }, current: v(500, "+1 LSC fork"), in_conflict: false, heads: [], deleted: false },
    { entry: { entry_id: "lap2", bike_id: "gt", kind: "note", versions: [] }, current: v(2_500, "bled the fork"), in_conflict: false, heads: [], deleted: false },
    { entry: { entry_id: "gone", bike_id: "gt", kind: "note", versions: [] }, current: v(600, "x"), in_conflict: false, heads: [], deleted: true },
  ],
  running_sheet: { baseline: "base", values: {}, since: [] },
  skipped: [],
};

describe("notesPatch", () => {
  it("notesPatch — a detail — keeps the other seven fields and sets title and notes", () => {
    // Arrange
    const d = detail();

    // Act
    const p = notesPatch(d, "Whistler · Thu", "dry, felt strong");

    // Assert
    expect(p).toEqual({ rider: "Isaac", bike: "GT", bike_comment: "", venue_name: "Whistler", event_name: "", event_session: "", short_comment: "Whistler · Thu", long_comment: "dry, felt strong", tag: "t" });
  });
});

describe("rideFacts", () => {
  it("rideFacts — laps with one ignored — best lap skips the ignored one", () => {
    // Arrange
    const d = detail({ ignored_lap_numbers: [2] });
    const fmt = { duration: (ms: number) => `${ms}d`, lap: (ms: number) => `${ms}l`, time: (ms: number) => `${ms}t` };

    // Act
    const facts = rideFacts(d, 3_000, fmt);

    // Assert
    expect(facts).toEqual([
      { label: "Started", value: "1000t" },
      { label: "Duration", value: "3000d" },
      { label: "Laps", value: "3" },
      { label: "Best lap", value: "1000l" },
    ]);
  });
});

describe("setupRows", () => {
  it("setupRows — a value changed since the baseline — shows what it was, in sheet order", () => {
    // Arrange
    const sheet = { baseline: "base", values: { "fork.psi": 70, "fork.lsc": 9 }, since: ["before"] };

    // Act
    const rows = setupRows(sheet, log);

    // Assert
    expect(rows).toEqual([
      { label: "Fork Pressure (psi)", value: "70", was: null },
      { label: "Fork LSC (clicks)", value: "9", was: "10" },
    ]);
  });
});

describe("attachedNotes", () => {
  it("attachedNotes — before and during the ride, one deleted — placed at their lap, deleted left out", () => {
    // Arrange
    const d = detail({ bike_log: { entry_ids: ["before", "lap2", "gone"], after_ms: null, until_ms: 4_000, setup_sheet: { baseline: null, values: {}, since: [] } } });

    // Act
    const notes = attachedNotes(d, log);

    // Assert
    expect(notes.map((n) => [n.entryId, n.lap, n.during])).toEqual([
      ["before", null, false],
      ["lap2", 2, true],
    ]);
  });
});
