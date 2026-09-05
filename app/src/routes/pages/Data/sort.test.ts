import { describe, expect, it } from "vitest";

import type { SessionSummary, TrackSummary } from "../../../ipc/catalog";
import { compareSessions, compareTracks, defaultAscendingFor, sortFieldsForView } from "./sort";

/** A minimal, otherwise-valid `SessionSummary` — tests override only the
 *  fields they care about. */
function baseSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
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
    venue_name: "Portland",
    event_name: "",
    event_session: "",
    short_comment: "",
    tag: "",
    lap_count: 12,
    duration_ms: 3_723_000,
    ...overrides,
  };
}

describe("sortFieldsForView", () => {
  it("sortFieldsForView — sessions view — date leads the list (its default field)", () => {
    const fields = sortFieldsForView("sessions");

    expect(fields[0]).toBe("date");
  });

  it("sortFieldsForView — tracks view — lastRidden leads the list", () => {
    const fields = sortFieldsForView("tracks");

    expect(fields[0]).toBe("lastRidden");
  });
});

describe("defaultAscendingFor", () => {
  it("defaultAscendingFor — bestLap and name — ascending; every other field — descending", () => {
    expect(defaultAscendingFor("bestLap")).toBe(true);
    expect(defaultAscendingFor("name")).toBe(true);
    expect(defaultAscendingFor("date")).toBe(false);
    expect(defaultAscendingFor("duration")).toBe(false);
    expect(defaultAscendingFor("lapCount")).toBe(false);
    expect(defaultAscendingFor("lastRidden")).toBe(false);
  });
});

describe("compareSessions", () => {
  it("compareSessions — sorting by duration with one null duration_ms — nulls sort last in both directions", () => {
    const withDuration = baseSummary({ session_id: "a", duration_ms: 1000 });
    const noDuration = baseSummary({ session_id: "b", duration_ms: null });

    const ascending = [withDuration, noDuration].sort((a, b) => compareSessions(a, b, "duration", true));
    const descending = [withDuration, noDuration].sort((a, b) => compareSessions(a, b, "duration", false));

    expect(ascending.map((s) => s.session_id)).toEqual(["a", "b"]);
    expect(descending.map((s) => s.session_id)).toEqual(["a", "b"]);
  });

  it("compareSessions — sorting by date ascending then descending — exactly reverses the order", () => {
    const earlier = baseSummary({ session_id: "a", timestamp_utc_ms: 1000 });
    const later = baseSummary({ session_id: "b", timestamp_utc_ms: 2000 });

    const ascending = [later, earlier].sort((a, b) => compareSessions(a, b, "date", true));
    const descending = [later, earlier].sort((a, b) => compareSessions(a, b, "date", false));

    expect(ascending.map((s) => s.session_id)).toEqual(["a", "b"]);
    expect(descending.map((s) => s.session_id)).toEqual(["b", "a"]);
  });

  it("compareSessions — two sessions with equal keys — order is stable by session_id", () => {
    const b = baseSummary({ session_id: "b", timestamp_utc_ms: 5000 });
    const a = baseSummary({ session_id: "a", timestamp_utc_ms: 5000 });

    const ascending = [b, a].sort((x, y) => compareSessions(x, y, "date", true));
    const descending = [b, a].sort((x, y) => compareSessions(x, y, "date", false));

    expect(ascending.map((s) => s.session_id)).toEqual(["a", "b"]);
    expect(descending.map((s) => s.session_id)).toEqual(["a", "b"]);
  });

  it("compareSessions — sorting by lapCount — orders by lap_count, session_id tie-break", () => {
    const fewer = baseSummary({ session_id: "a", lap_count: 3 });
    const more = baseSummary({ session_id: "b", lap_count: 9 });

    const ascending = [more, fewer].sort((x, y) => compareSessions(x, y, "lapCount", true));

    expect(ascending.map((s) => s.session_id)).toEqual(["a", "b"]);
  });

  it("compareSessions — sorting by bestLap — no SessionSummary field backs it yet, so it ties by session_id", () => {
    const b = baseSummary({ session_id: "b" });
    const a = baseSummary({ session_id: "a" });

    const ascending = [b, a].sort((x, y) => compareSessions(x, y, "bestLap", true));

    expect(ascending.map((s) => s.session_id)).toEqual(["a", "b"]);
  });

  it("compareSessions — a Tracks-only field (name) — falls back to the session_id tie-break", () => {
    const b = baseSummary({ session_id: "b" });
    const a = baseSummary({ session_id: "a" });

    const result = compareSessions(b, a, "name", true);

    expect(result).toBeGreaterThan(0);
  });
});

/** A minimal, otherwise-valid `TrackSummary` — tests override only the
 *  fields they care about. */
function baseTrack(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    track_id: "t1",
    name: "Portland International Raceway",
    venue_name: "Portland",
    created_at_ms: 1_725_000_000_000,
    updated_at_ms: 1_725_000_000_000,
    ...overrides,
  };
}

describe("compareTracks", () => {
  it("compareTracks — sorting by name — orders alphabetically, track_id tie-break", () => {
    const zed = baseTrack({ track_id: "a", name: "Zandvoort" });
    const alpha = baseTrack({ track_id: "b", name: "Alpine" });

    const ascending = [zed, alpha].sort((x, y) => compareTracks(x, y, "name", true));
    const descending = [zed, alpha].sort((x, y) => compareTracks(x, y, "name", false));

    expect(ascending.map((t) => t.track_id)).toEqual(["b", "a"]);
    expect(descending.map((t) => t.track_id)).toEqual(["a", "b"]);
  });

  it("compareTracks — lastRidden, bestLap, lapCount — no TrackSummary field backs any of them yet, so each ties by track_id", () => {
    const b = baseTrack({ track_id: "b" });
    const a = baseTrack({ track_id: "a" });

    for (const field of ["lastRidden", "bestLap", "lapCount"] as const) {
      const ascending = [b, a].sort((x, y) => compareTracks(x, y, field, true));
      expect(ascending.map((t) => t.track_id)).toEqual(["a", "b"]);
    }
  });

  it("compareTracks — a Sessions-only field (date, duration) — falls back to the track_id tie-break", () => {
    const b = baseTrack({ track_id: "b" });
    const a = baseTrack({ track_id: "a" });

    expect(compareTracks(b, a, "date", true)).toBeGreaterThan(0);
    expect(compareTracks(b, a, "duration", true)).toBeGreaterThan(0);
  });
});
