import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../../../ipc/catalog";
import { facetCounts, matchesFilters } from "./facets";
import { initialFilters } from "./filters";

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

describe("matchesFilters", () => {
  it("matchesFilters — no active facets — every row matches", () => {
    const row = baseSummary();

    expect(matchesFilters(row, initialFilters)).toBe(true);
  });

  it("matchesFilters — two bikes selected — a row matching either passes (OR within a facet)", () => {
    const row = baseSummary({ bike: "SV650" });
    const filters = { ...initialFilters, bikes: new Set(["SV650", "R6"]) };

    expect(matchesFilters(row, filters)).toBe(true);
  });

  it("matchesFilters — a bike and a rider selected — a row must match both (AND across facets)", () => {
    const matchingRow = baseSummary({ bike: "SV650", rider: "Isaac" });
    const wrongRider = baseSummary({ bike: "SV650", rider: "Someone Else" });
    const filters = { ...initialFilters, bikes: new Set(["SV650"]), riders: new Set(["Isaac"]) };

    expect(matchesFilters(matchingRow, filters)).toBe(true);
    expect(matchesFilters(wrongRider, filters)).toBe(false);
  });

  it('matchesFilters — "(none)" selected for tag — matches only rows whose tag is ""', () => {
    const untagged = baseSummary({ tag: "" });
    const tagged = baseSummary({ tag: "Practice" });
    const filters = { ...initialFilters, tags: new Set([""]) };

    expect(matchesFilters(untagged, filters)).toBe(true);
    expect(matchesFilters(tagged, filters)).toBe(false);
  });

  it("matchesFilters — date range — a row on the range's own last day still matches (inclusive)", () => {
    const startOfLastDay = new Date(2026, 8, 5, 0, 0, 0).getTime();
    const lateOnLastDay = baseSummary({ timestamp_utc_ms: new Date(2026, 8, 5, 23, 30, 0).getTime() });
    const filters = {
      ...initialFilters,
      dateRange: { startMs: new Date(2026, 8, 1).getTime(), endMs: startOfLastDay },
    };

    expect(matchesFilters(lateOnLastDay, filters)).toBe(true);
  });

  it("matchesFilters — search text — matches case-insensitively across venue, comments and tag", () => {
    const byVenue = baseSummary({ venue_name: "Portland International Raceway" });
    const byComment = baseSummary({ short_comment: "Wet track, careful on T1" });
    const byTag = baseSummary({ tag: "Practice" });
    const noMatch = baseSummary({ venue_name: "Laguna Seca", short_comment: "", tag: "" });

    expect(matchesFilters(byVenue, { ...initialFilters, searchText: "PORTLAND" })).toBe(true);
    expect(matchesFilters(byComment, { ...initialFilters, searchText: "wet" })).toBe(true);
    expect(matchesFilters(byTag, { ...initialFilters, searchText: "practice" })).toBe(true);
    expect(matchesFilters(noMatch, { ...initialFilters, searchText: "portland" })).toBe(false);
  });

  it("matchesFilters — lap-time range with a null duration row — the row is excluded, not included by default", () => {
    const noDuration = baseSummary({ duration_ms: null });
    const filters = { ...initialFilters, lapTimeMs: { startMs: 0, endMs: 3_600_000 } };

    expect(matchesFilters(noDuration, filters)).toBe(false);
  });
});

describe("facetCounts", () => {
  it("facetCounts — counts each option against the other facets, not against its own — selecting one bike leaves the other bikes' counts visible", () => {
    const rows = [
      baseSummary({ session_id: "s1", bike: "SV650", rider: "Isaac" }),
      baseSummary({ session_id: "s2", bike: "R6", rider: "Isaac" }),
      baseSummary({ session_id: "s3", bike: "R6", rider: "Someone Else" }),
    ];
    const filters = { ...initialFilters, bikes: new Set(["SV650"]) };

    const counts = facetCounts(rows, filters);

    expect(counts.bikes.get("SV650")).toBe(1);
    expect(counts.bikes.get("R6")).toBe(2);
  });
});
