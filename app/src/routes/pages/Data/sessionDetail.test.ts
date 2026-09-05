import { describe, expect, it } from "vitest";

import type { ChannelSummary, LapDetail, LapSummary, SessionDetail } from "../../../ipc/catalog";
import { bestLapMs, toDetailView } from "./sessionDetail";

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
    venue_name: "Portland",
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

/** A minimal, otherwise-valid `session.json`-native `LapDetail`. */
function lapDetail(overrides: Partial<LapDetail> = {}): LapDetail {
  return {
    lap_number: 1,
    start_timestamp_ms: 0,
    end_timestamp_ms: 60_000,
    raw_elapsed_ms: 60_000,
    lap_time_ms: 60_000,
    start_time_secs: 0,
    end_time_secs: 60,
    sectors: [],
    neutral_zone_visits: [],
    ...overrides,
  };
}

/** A minimal, otherwise-valid catalog-cached `LapSummary`. */
function lapSummary(overrides: Partial<LapSummary> = {}): LapSummary {
  return {
    lap_number: 1,
    lap_time_ms: 60_000,
    track_id: null,
    channel_stats: [],
    ...overrides,
  };
}

/** A minimal, otherwise-valid `ChannelSummary`. */
function channelSummary(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    channel_id: "imu0.accel_x",
    nominal_rate_hz: 100,
    unit: "g",
    source_kind: "imu0",
    channel_kind: "fixed-rate",
    sample_count: 6000,
    ...overrides,
  };
}

describe("toDetailView", () => {
  it("toDetailView — laps present in both sources — one row per lap_number, catalog stats attached, presence \"both\"", () => {
    const detail = baseDetail({ laps: [lapDetail({ lap_number: 1, lap_time_ms: 60_000 })] });
    const laps = [lapSummary({ lap_number: 1, lap_time_ms: 60_000, track_id: "trk1" })];

    const view = toDetailView(detail, laps);

    expect(view.laps).toHaveLength(1);
    expect(view.laps[0].presence).toBe("both");
    expect(view.laps[0].lapTimeMs).toBe(60_000);
    expect(view.laps[0].trackId).toBe("trk1");
  });

  it("toDetailView — a lap in session.json with no catalog row — row present, stats marked unavailable, presence \"session-only\", never dropped", () => {
    const detail = baseDetail({ laps: [lapDetail({ lap_number: 1 })] });

    const view = toDetailView(detail, []);

    expect(view.laps).toHaveLength(1);
    expect(view.laps[0].presence).toBe("session-only");
    expect(view.laps[0].channelStats).toEqual([]);
    expect(view.laps[0].trackId).toBeNull();
  });

  it("toDetailView — a catalog lap with no session.json lap — row present, presence \"catalog-only\", never dropped", () => {
    const detail = baseDetail({ laps: [] });
    const laps = [lapSummary({ lap_number: 1 })];

    const view = toDetailView(detail, laps);

    expect(view.laps).toHaveLength(1);
    expect(view.laps[0].presence).toBe("catalog-only");
    expect(view.laps[0].sectorCount).toBeNull();
  });

  it("toDetailView — ignored_lap_numbers contains lap 3 — lap 3's row is flagged ignored", () => {
    const detail = baseDetail({
      laps: [lapDetail({ lap_number: 1 }), lapDetail({ lap_number: 3 })],
      ignored_lap_numbers: [3],
    });

    const view = toDetailView(detail, []);

    const lap1 = view.laps.find((l) => l.lapNumber === 1);
    const lap3 = view.laps.find((l) => l.lapNumber === 3);
    expect(lap1?.ignored).toBe(false);
    expect(lap3?.ignored).toBe(true);
  });

  it("toDetailView — reference_lap_number null — the fastest lap (by lap_time_ms among non-ignored laps) is marked as reference (C1 §6: null means \"use fastest lap\")", () => {
    const detail = baseDetail({
      laps: [
        lapDetail({ lap_number: 1, lap_time_ms: 55_000 }),
        lapDetail({ lap_number: 2, lap_time_ms: 50_000 }),
        lapDetail({ lap_number: 3, lap_time_ms: 40_000 }),
      ],
      ignored_lap_numbers: [3],
      reference_lap_number: null,
    });

    const view = toDetailView(detail, []);

    const lap1 = view.laps.find((l) => l.lapNumber === 1);
    const lap2 = view.laps.find((l) => l.lapNumber === 2);
    const lap3 = view.laps.find((l) => l.lapNumber === 3);
    expect(lap2?.isReference).toBe(true);
    expect(lap1?.isReference).toBe(false);
    expect(lap3?.isReference).toBe(false);
  });

  it("bestLapMs — every lap ignored — returns null, not Infinity", () => {
    const detail = baseDetail({
      laps: [lapDetail({ lap_number: 1, lap_time_ms: 55_000 }), lapDetail({ lap_number: 2, lap_time_ms: 40_000 })],
      ignored_lap_numbers: [1, 2],
    });

    const view = toDetailView(detail, []);

    expect(bestLapMs(view.laps)).toBeNull();
  });

  it("toDetailView — a channel with nominal_rate_hz 0 — renders as an event channel (C1 §4.2), matching ChannelSummary.channel_kind", () => {
    const detail = baseDetail({
      channels: [channelSummary({ nominal_rate_hz: 0, channel_kind: "event", channel_id: "gps.fix" })],
    });

    const view = toDetailView(detail, []);

    expect(view.channels[0].channelKind).toBe("event");
    expect(view.channels[0].nominalRateHz).toBe(0);
  });

  it("toDetailView — a lap's sectors array is non-empty — the row carries a sector count only, never parses element shape (R53 Q5; C3 §6 item 11 leaves the element shape unfixed)", () => {
    const detail = baseDetail({
      laps: [lapDetail({ lap_number: 1, sectors: [{ weird: "shape" }, "not even an object", 42] as unknown[] })],
    });

    const view = toDetailView(detail, []);

    expect(view.laps[0].sectorCount).toBe(3);
  });
});
