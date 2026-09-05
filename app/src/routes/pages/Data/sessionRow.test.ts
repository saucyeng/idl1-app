import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../../../ipc/catalog";
import { groupKeyOf, toSessionRow } from "./sessionRow";

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

describe("toSessionRow", () => {
  it("toSessionRow — summary with duration_ms and lap_count set — formats both", () => {
    const summary = baseSummary({ duration_ms: 3_723_000, lap_count: 12 });

    const row = toSessionRow(summary);

    expect(row.durationText).toBe("1:02:03");
    expect(row.lapCountText).toBe("12");
  });

  it("toSessionRow — duration_ms null — duration reads \"—\", never \"0:00\"", () => {
    const summary = baseSummary({ duration_ms: null });

    const row = toSessionRow(summary);

    expect(row.durationText).toBe("—");
  });

  it("toSessionRow — lap_count null — lap count reads \"—\" (laps not indexed yet, C3 §3.2)", () => {
    const summary = baseSummary({ lap_count: null });

    const row = toSessionRow(summary);

    expect(row.lapCountText).toBe("—");
  });

  it("toSessionRow — timestamp_utc_ms is 0 — date reads \"unknown\" (C1 §3.1: 0 = unknown, not 1970)", () => {
    const summary = baseSummary({ timestamp_utc_ms: 0 });

    const row = toSessionRow(summary);

    expect(row.dateText).toBe("unknown");
  });

  it("toSessionRow — venue_name empty — display venue is \"(none)\", matching the facet's synthetic entry", () => {
    const summary = baseSummary({ venue_name: "" });

    const row = toSessionRow(summary);

    expect(row.venueText).toBe("(none)");
  });
});

describe("groupKeyOf", () => {
  it("groupKeyOf — two sessions on the same local date and venue — same key", () => {
    const a = toSessionRow(baseSummary({ session_id: "a", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));
    const b = toSessionRow(baseSummary({ session_id: "b", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));

    expect(groupKeyOf(a)).toBe(groupKeyOf(b));
  });

  it("groupKeyOf — same date, different venue — different keys", () => {
    const a = toSessionRow(baseSummary({ session_id: "a", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));
    const b = toSessionRow(baseSummary({ session_id: "b", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Laguna Seca" }));

    expect(groupKeyOf(a)).not.toBe(groupKeyOf(b));
  });
});
