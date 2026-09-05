import { describe, expect, it } from "vitest";

import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import { bindingFor, bindingIdentity, unresolvedChannelId } from "./jsCellBinding";

function channel(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    channel_id: "fork_velocity",
    nominal_rate_hz: 200,
    unit: "m/s",
    source_kind: "imu0",
    channel_kind: "fixed-rate",
    sample_count: 20_000,
    ...overrides,
  };
}

function sessionDetail(channels: ChannelSummary[]): SessionDetail {
  return {
    session_id: "session-a",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "a".repeat(64),
    channels,
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
    laps: [],
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
  };
}

const oneMarkCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const twoDistinctChannelsCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" }),',
  '    Plot.lineY(channel("rear_wheel_speed"), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const twoMarksSameChannelCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" }),',
  '    Plot.dot(channel("fork_velocity", { lap: 3 }), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const customCode = "const x = 1;\nreturn x + 1;";

describe("bindingFor", () => {
  it("bindingFor — form-generated code, one mark, known channel — a non-null binding with one channels entry", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000);

    expect(binding).not.toBeNull();
    expect(binding?.channels).toEqual([{ channelId: "fork_velocity", sampleRateHz: 200, lap: null }]);
    expect(binding?.initialSpan).toEqual({ startUs: 0, endUs: 60_000_000 });
  });

  it("bindingFor — form-generated code, multiple marks on distinct channels — one channels entry per distinct channel", () => {
    const detail = sessionDetail([channel(), channel({ channel_id: "rear_wheel_speed", nominal_rate_hz: 50 })]);

    const binding = bindingFor({ id: "cell-a", code: twoDistinctChannelsCode }, detail, 60_000_000);

    expect(binding?.channels).toEqual([
      { channelId: "fork_velocity", sampleRateHz: 200, lap: null },
      { channelId: "rear_wheel_speed", sampleRateHz: 50, lap: null },
    ]);
  });

  it("bindingFor — two marks on the same channel — exactly one channels entry for it, not two", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: twoMarksSameChannelCode }, detail, 60_000_000);

    expect(binding?.channels).toHaveLength(1);
    expect(binding?.channels).toEqual([{ channelId: "fork_velocity", sampleRateHz: 200, lap: null }]);
  });

  it("bindingFor — custom code — returns null", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: customCode }, detail, 60_000_000);

    expect(binding).toBeNull();
  });

  it("bindingFor — a mark's channel not present in sessionDetail.channels — returns null", () => {
    const detail = sessionDetail([channel({ channel_id: "unrelated_channel" })]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000);

    expect(binding).toBeNull();
  });

  it("bindingFor — sessionDetail is null — returns null for every cell, form-generated or not", () => {
    const boundFormGenerated = bindingFor({ id: "cell-a", code: oneMarkCode }, null, 60_000_000);
    const boundCustom = bindingFor({ id: "cell-b", code: customCode }, null, 60_000_000);

    expect(boundFormGenerated).toBeNull();
    expect(boundCustom).toBeNull();
  });

  it("bindingFor — sessionSpanUs not yet resolved — returns null even for an otherwise-bindable cell", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, null);

    expect(binding).toBeNull();
  });
});

describe("bindingIdentity", () => {
  it("bindingIdentity — two calls with the same channel/lap/span — produce the same identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000);
    const b = bindingFor({ id: "cell-b", code: oneMarkCode }, detail, 60_000_000);

    expect(bindingIdentity(a!)).toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — a different resolved session span — produces a different identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000);
    const b = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 90_000_000);

    expect(bindingIdentity(a!)).not.toBe(bindingIdentity(b!));
  });
});

describe("unresolvedChannelId", () => {
  it("unresolvedChannelId — custom code — returns null", () => {
    const detail = sessionDetail([channel()]);

    expect(unresolvedChannelId(customCode, detail)).toBeNull();
  });

  it("unresolvedChannelId — form-generated code naming an unresolvable channel — names it", () => {
    const detail = sessionDetail([channel({ channel_id: "unrelated_channel" })]);

    expect(unresolvedChannelId(oneMarkCode, detail)).toBe("fork_velocity");
  });

  it("unresolvedChannelId — every referenced channel resolves — returns null", () => {
    const detail = sessionDetail([channel()]);

    expect(unresolvedChannelId(oneMarkCode, detail)).toBeNull();
  });
});
