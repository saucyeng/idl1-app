import { describe, expect, it } from "vitest";

import type { SessionSummary, TrackSummary, TrackVisitSummary } from "../../../ipc/catalog";
import { resolveDisplayVenue, toTrackRow } from "./trackRow";

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

/** A minimal, otherwise-valid `SessionSummary` — tests override only the
 *  fields they care about. */
function baseSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: "s1",
    blob_sha256: "0".repeat(64),
    source_format: "idl0",
    device_id: "dev1",
    config_checksum: "cfg1",
    importer_version: "0.1.0",
    seam_correction_version: "v1",
    engine_version: "0.1.0",
    timestamp_utc_ms: 1_725_000_000_000,
    created_at_ms: 1_725_000_000_000,
    rider: "Isaac",
    bike: "SV650",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    tag: "",
    lap_count: 12,
    duration_ms: 3_723_000,
    ...overrides,
  };
}

/** A minimal, otherwise-valid `TrackVisitSummary` — tests override only the
 *  fields they care about. */
function baseVisit(overrides: Partial<TrackVisitSummary> = {}): TrackVisitSummary {
  return {
    visit_id: "v1",
    track_id: "t1",
    start_timestamp_ms: 1_725_000_000_000,
    end_timestamp_ms: 1_725_001_000_000,
    laps: [],
    ...overrides,
  };
}

describe("toTrackRow", () => {
  it("toTrackRow — a TrackSummary — formats created/updated timestamps and carries venue", () => {
    const summary = baseTrack({
      created_at_ms: 1_725_000_000_000,
      updated_at_ms: 1_725_100_000_000,
      venue_name: "Portland",
    });

    const row = toTrackRow(summary);

    expect(row.createdText).toBe(new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(1_725_000_000_000)));
    expect(row.updatedText).toBe(new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(1_725_100_000_000)));
    expect(row.venueText).toBe("Portland");
  });
});

describe("resolveDisplayVenue", () => {
  it("resolveDisplayVenue — session has its own venue_name — uses it, ignoring tracks", () => {
    const session = baseSession({ venue_name: "Laguna Seca" });
    const visits = [baseVisit({ track_id: "t1" })];
    const tracksById = new Map([["t1", baseTrack({ venue_name: "Portland" })]]);

    expect(resolveDisplayVenue(session, visits, tracksById)).toBe("Laguna Seca");
  });

  it("resolveDisplayVenue — session venue empty, first visited track has a venue — uses the track's", () => {
    const session = baseSession({ venue_name: "" });
    const visits = [baseVisit({ track_id: "t1" })];
    const tracksById = new Map([["t1", baseTrack({ venue_name: "Portland" })]]);

    expect(resolveDisplayVenue(session, visits, tracksById)).toBe("Portland");
  });

  it("resolveDisplayVenue — a visit whose track_id no longer resolves — skipped, next visit considered (idl0's §12.3 skip-on-resolve rule)", () => {
    const session = baseSession({ venue_name: "" });
    const visits = [baseVisit({ track_id: "stale-track" }), baseVisit({ track_id: "t2" })];
    const tracksById = new Map([["t2", baseTrack({ track_id: "t2", venue_name: "Thunderhill" })]]);

    expect(resolveDisplayVenue(session, visits, tracksById)).toBe("Thunderhill");
  });

  it('resolveDisplayVenue — nothing resolves — returns "", which renders as "(none)"', () => {
    const session = baseSession({ venue_name: "" });
    const visits = [baseVisit({ track_id: "stale-track" })];
    const tracksById = new Map<string, TrackSummary>();

    expect(resolveDisplayVenue(session, visits, tracksById)).toBe("");
  });
});
