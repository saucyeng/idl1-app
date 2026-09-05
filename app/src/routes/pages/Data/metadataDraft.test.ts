import { describe, expect, it } from "vitest";

import type { SessionDetail, TrackSummary } from "../../../ipc/catalog";
import { initialDraft, isDirty, normalizeDraft, toSavePayload, venueOptions, type MetadataDraft } from "./metadataDraft";

/** A minimal, otherwise-valid `SessionDetail` — tests override only the
 *  fields they care about. */
function baseDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: "s1",
    device_id: "dev1",
    timestamp_utc_ms: 1_725_000_000_000,
    config_checksum: "cfg1",
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: [],
    rider: "Isaac",
    bike: "SV650",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    bike_profile_snapshot: null,
    laps: [],
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
    ...overrides,
  };
}

/** A minimal, otherwise-valid `TrackSummary` — tests override only the
 *  fields they care about. */
function baseTrack(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    track_id: "t1",
    name: "Portland International Raceway",
    venue_name: "Portland",
    created_at_ms: 1_725_000_000_000,
    updated_at_ms: 1_725_100_000_000,
    ...overrides,
  };
}

describe("initialDraft", () => {
  it("initialDraft — session with an empty venue_name and a visited track that has one — venue pre-filled from the track", () => {
    const detail = baseDetail({
      venue_name: "",
      track_visits: [
        {
          visit_id: "v1",
          track_id: "t1",
          start_timestamp_ms: 1_725_000_000_000,
          end_timestamp_ms: 1_725_001_000_000,
          laps: [],
        },
      ],
    });
    const tracks = [baseTrack({ track_id: "t1", venue_name: "Portland" })];

    const draft = initialDraft(detail, tracks);

    expect(draft.venue_name).toBe("Portland");
  });

  it("initialDraft — session with its own venue_name — venue is the session's, not the track's", () => {
    const detail = baseDetail({
      venue_name: "Laguna Seca",
      track_visits: [
        {
          visit_id: "v1",
          track_id: "t1",
          start_timestamp_ms: 1_725_000_000_000,
          end_timestamp_ms: 1_725_001_000_000,
          laps: [],
        },
      ],
    });
    const tracks = [baseTrack({ track_id: "t1", venue_name: "Portland" })];

    const draft = initialDraft(detail, tracks);

    expect(draft.venue_name).toBe("Laguna Seca");
  });
});

describe("isDirty", () => {
  it("isDirty — nothing typed — false; one character typed — true", () => {
    const detail = baseDetail({ venue_name: "Laguna Seca" });
    const draft = initialDraft(detail, []);

    expect(isDirty(draft, detail)).toBe(false);

    const typed: MetadataDraft = { ...draft, rider: `${draft.rider}x` };

    expect(isDirty(typed, detail)).toBe(true);
  });

  it("isDirty — a field changed to a value differing only by surrounding whitespace — false after normalisation", () => {
    const detail = baseDetail({ venue_name: "Laguna Seca", rider: "Isaac" });
    const draft = initialDraft(detail, []);

    const padded: MetadataDraft = { ...draft, rider: "  Isaac  " };

    expect(isDirty(padded, detail)).toBe(false);
  });
});

describe("normalizeDraft", () => {
  it('normalizeDraft — fields with leading/trailing spaces — trimmed; a field cleared — becomes "", never null (C1 §6)', () => {
    const draft: MetadataDraft = {
      rider: "  Isaac  ",
      bike: "SV650",
      bike_comment: "",
      venue_name: "  Laguna Seca  ",
      event_name: "",
      event_session: "  ",
      tag: "  fast  ",
      short_comment: "hi",
      long_comment: "",
    };

    const normalized = normalizeDraft(draft);

    expect(normalized.rider).toBe("Isaac");
    expect(normalized.venue_name).toBe("Laguna Seca");
    expect(normalized.tag).toBe("fast");
    expect(normalized.event_session).toBe("");
    expect(normalized.event_name).toBe("");
  });
});

describe("venueOptions", () => {
  it("venueOptions — tracks with duplicate and empty venues — deduped, empties dropped, sorted", () => {
    const tracks = [
      baseTrack({ track_id: "t1", venue_name: "Thunderhill" }),
      baseTrack({ track_id: "t2", venue_name: "Portland" }),
      baseTrack({ track_id: "t3", venue_name: "Portland" }),
      baseTrack({ track_id: "t4", venue_name: "" }),
    ];

    expect(venueOptions(tracks)).toEqual(["Portland", "Thunderhill"]);
  });
});

describe("toSavePayload", () => {
  it("toSavePayload — a draft — carries exactly the nine C1 §6 fields plus session_id, nothing else", () => {
    const draft: MetadataDraft = {
      rider: "Isaac",
      bike: "SV650",
      bike_comment: "Fresh tires",
      venue_name: "Portland",
      event_name: "Track day",
      event_session: "AM",
      tag: "fast",
      short_comment: "good day",
      long_comment: "long notes",
    };

    const payload = toSavePayload("s1", draft);

    expect(Object.keys(payload).sort()).toEqual(
      [
        "bike",
        "bike_comment",
        "event_name",
        "event_session",
        "long_comment",
        "rider",
        "session_id",
        "short_comment",
        "tag",
        "venue_name",
      ].sort(),
    );
    expect(payload.session_id).toBe("s1");
    expect(payload.rider).toBe("Isaac");
  });
});
