import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import { mapViewportToWindow, resolveWindowSpan } from "./viewportWindows";

function detailWithLaps(laps: Array<{ lap_number: number; start_time_secs: number; end_time_secs: number }>): SessionDetail {
  return {
    session_id: "s",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: [],
    rider: "",
    bike: "",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    bike_profile_snapshot: null,
    laps: laps.map((l) => ({ ...l, sectors: [], neutral_zone_visits: [], start_timestamp_ms: 0, end_timestamp_ms: 0, raw_elapsed_ms: 0, lap_time_ms: 0 })),
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
  };
}

describe("mapViewportToWindow", () => {
  it("mapViewportToWindow — window equals the primary window (single-window case) — the mapped span equals the viewport exactly", () => {
    const viewport = { startUs: 100_000, endUs: 900_000 };
    const primary = { startUs: 0, endUs: 10_000_000 };

    expect(mapViewportToWindow(viewport, 0, primary)).toEqual(viewport);
  });

  it("mapViewportToWindow — a later window, same-length viewport offset — re-based from the window's own start, not wall-clock", () => {
    // Primary starts at 10s; viewport is [15s, 25s) -- offset [5s, 15s) from
    // the primary's own start. A second window starting at 100s maps to
    // [105s, 115s), never [15s, 25s) (which would compare by wall-clock).
    const viewport = { startUs: 15_000_000, endUs: 25_000_000 };
    const primaryStartUs = 10_000_000;
    const window = { startUs: 100_000_000, endUs: 200_000_000 };

    expect(mapViewportToWindow(viewport, primaryStartUs, window)).toEqual({ startUs: 105_000_000, endUs: 115_000_000 });
  });

  it("mapViewportToWindow — window shorter than the mapped span — clamps the end to the window's own end (absence past it)", () => {
    const viewport = { startUs: 0, endUs: 100_000_000 };
    const window = { startUs: 0, endUs: 30_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toEqual({ startUs: 0, endUs: 30_000_000 });
  });

  it("mapViewportToWindow — the mapped span starts at or past the window's own end — null (no data in view at all)", () => {
    const viewport = { startUs: 50_000_000, endUs: 100_000_000 };
    const window = { startUs: 0, endUs: 30_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toBeNull();
  });

  it("mapViewportToWindow — a session-kind window whose recorded span exceeds the viewport — not clamped by its own end", () => {
    const viewport = { startUs: 0, endUs: 1_000_000_000 };
    const window = { startUs: 0, endUs: 2_000_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toEqual({ startUs: 0, endUs: 1_000_000_000 });
  });
});

describe("resolveWindowSpan", () => {
  it("resolveWindowSpan — session span, recorded span resolved — [0, recordedSpanUs)", () => {
    expect(resolveWindowSpan({ kind: "session" }, detailWithLaps([]), 900_000_000)).toEqual({ startUs: 0, endUs: 900_000_000 });
  });

  it("resolveWindowSpan — session span — window end unresolved — excluded, not treated as whole session", () => {
    expect(resolveWindowSpan({ kind: "session" }, detailWithLaps([]), null)).toBeNull();
  });

  it("resolveWindowSpan — range span — the span's own t0_us/t1_us verbatim", () => {
    expect(resolveWindowSpan({ kind: "range", t0_us: 12_000, t1_us: 34_000 }, detailWithLaps([]), null)).toEqual({ startUs: 12_000, endUs: 34_000 });
  });

  it("resolveWindowSpan — lap span, lap found — the lap's start_time_secs/end_time_secs converted to µs", () => {
    const detail = detailWithLaps([{ lap_number: 2, start_time_secs: 30.5, end_time_secs: 61 }]);

    expect(resolveWindowSpan({ kind: "lap", lap_number: 2 }, detail, null)).toEqual({ startUs: 30_500_000, endUs: 61_000_000 });
  });

  it("resolveWindowSpan — lap span, no matching lap — null", () => {
    const detail = detailWithLaps([{ lap_number: 1, start_time_secs: 0, end_time_secs: 30 }]);

    expect(resolveWindowSpan({ kind: "lap", lap_number: 5 }, detail, null)).toBeNull();
  });
});
