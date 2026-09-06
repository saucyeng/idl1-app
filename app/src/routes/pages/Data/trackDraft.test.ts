import { describe, expect, it } from "vitest";

import type { TrackDetail } from "../../../ipc/catalog";
import { initialTrackDraft, isTrackDraftDirty, normalizeTrackDraft, toTrackSaveDraft } from "./trackDraft";

const detail: TrackDetail = {
  track_id: "t1",
  name: "Original Name",
  venue_name: "Original Venue",
  created_at_ms: 100,
  updated_at_ms: 200,
  lap_timing: { kind: "circuit", start_finish: { lat1: 1, lon1: 2, lat2: 3, lon2: 4 } },
  neutral_zones: [{ name: "Pit", enter: { lat1: 1, lon1: 2, lat2: 3, lon2: 4 }, exit: { lat1: 5, lon1: 6, lat2: 7, lon2: 8 } }],
  sector_gates: [{ name: "S1", gate: { lat1: 1, lon1: 2, lat2: 3, lon2: 4 } }],
  reference_polyline: [{ timestamp_ms: 1, lat: 1, lon: 2 }],
};

describe("initialTrackDraft", () => {
  it("initialTrackDraft — a TrackDetail — carries only name and venue over", () => {
    const draft = initialTrackDraft(detail);

    expect(draft).toEqual({ name: "Original Name", venue_name: "Original Venue" });
  });
});

describe("normalizeTrackDraft", () => {
  it("normalizeTrackDraft — surrounding whitespace on both fields — trimmed", () => {
    const normalized = normalizeTrackDraft({ name: "  A Track  ", venue_name: "  A Venue  " });

    expect(normalized).toEqual({ name: "A Track", venue_name: "A Venue" });
  });
});

describe("isTrackDraftDirty", () => {
  it("isTrackDraftDirty — draft matches detail exactly — not dirty", () => {
    expect(isTrackDraftDirty({ name: "Original Name", venue_name: "Original Venue" }, detail)).toBe(false);
  });

  it("isTrackDraftDirty — draft matches detail after trimming whitespace — not dirty", () => {
    expect(isTrackDraftDirty({ name: "  Original Name  ", venue_name: "Original Venue" }, detail)).toBe(false);
  });

  it("isTrackDraftDirty — name changed — dirty", () => {
    expect(isTrackDraftDirty({ name: "New Name", venue_name: "Original Venue" }, detail)).toBe(true);
  });

  it("isTrackDraftDirty — venue changed — dirty", () => {
    expect(isTrackDraftDirty({ name: "Original Name", venue_name: "New Venue" }, detail)).toBe(true);
  });
});

describe("toTrackSaveDraft", () => {
  it("toTrackSaveDraft — a normalised draft — carries the track id and every geometry field through verbatim", () => {
    const saveDraft = toTrackSaveDraft(detail, { name: "New Name", venue_name: "New Venue" });

    expect(saveDraft).toEqual({
      track_id: "t1",
      name: "New Name",
      venue_name: "New Venue",
      lap_timing: detail.lap_timing,
      neutral_zones: detail.neutral_zones,
      sector_gates: detail.sector_gates,
      reference_polyline: detail.reference_polyline,
    });
  });
});
