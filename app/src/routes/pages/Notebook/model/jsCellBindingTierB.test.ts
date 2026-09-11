/**
 * The map and spectrogram arms of `bindingFor`/`bindingIdentity`/
 * `unresolvedChannelId` (ruling R217 items 1 and 4). Its own file rather
 * than an appendix to `jsCellBinding.test.ts`, matching this lane's "one
 * chart kind's arm reads as one file" convention
 * (`jsCellBindingHistogram.test.ts`).
 */
import { describe, expect, it } from "vitest";

import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import { gpsBudgetForWidth } from "../../../../ipc/gps";
import { generate } from "../plotForm/generate";
import { gpsKey, rasterKey } from "../plotForm/gpsKey";
import type { FftParams, MapPlotProps, SpectrogramPlotProps } from "../plotForm/types";
import { bindingFor, bindingIdentity, NOMINAL_CELL_WIDTH_PX, unresolvedChannelId } from "./jsCellBinding";

const FFT: FftParams = {
  windowSize: 1024,
  hopSize: 512,
  window: "hann",
  detrend: "mean",
  scaling: "raw_magnitude",
  averaging: "none",
};

function channel(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    channel_id: "IMU0_AccelZ",
    nominal_rate_hz: 400,
    unit: "m/s^2",
    source_kind: "imu0",
    channel_kind: "fixed-rate",
    sample_count: 40_000,
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
  } as unknown as SessionDetail;
}

function mapCode(colourBy: string | null, trackUnderlay = true): string {
  const props: MapPlotProps = {
    chart: "map",
    marks: [{ mark: "line", colourBy }],
    ...(trackUnderlay ? { trackUnderlay: true as const } : {}),
  };
  return generate(props);
}

function spectrogramCode(channelId = "IMU0_AccelZ", fft: FftParams = FFT): string {
  const props: SpectrogramPlotProps = { chart: "spectrogram", mark: { channel: channelId, fft } };
  return generate(props);
}

const SPAN_US = 60_000_000;
const NO_DEFS = new Set<string>();

describe("bindingFor — the map arm", () => {
  it("bindingFor — a map cell coloured by a real channel — binds under that channel's gps key", () => {
    const detail = sessionDetail([channel({ channel_id: "Speed", unit: "m/s" })]);

    const binding = bindingFor({ id: "c1", code: mapCode("Speed") }, detail, SPAN_US, NO_DEFS);

    expect(binding?.kind).toBe("map");
    expect(binding?.kind === "map" && binding.hostVarName).toBe(gpsKey("Speed"));
    expect(binding?.kind === "map" && binding.colourBy).toBe("Speed");
  });

  it("bindingFor — an uncoloured map cell — binds without needing any channel to resolve", () => {
    const binding = bindingFor({ id: "c1", code: mapCode(null) }, sessionDetail([]), SPAN_US, NO_DEFS);

    expect(binding?.kind).toBe("map");
    expect(binding?.kind === "map" && binding.colourBy).toBeNull();
    expect(binding?.kind === "map" && binding.hostVarName).toBe(gpsKey(null));
  });

  it("bindingFor — a colour-by channel this session does not have — refuses to bind at all", () => {
    const binding = bindingFor({ id: "c1", code: mapCode("Speed") }, sessionDetail([channel()]), SPAN_US, NO_DEFS);

    expect(binding).toBeNull();
  });

  it("bindingFor — a map cell — resolves the colour channel's unit and leaves it null when uncoloured", () => {
    const detail = sessionDetail([channel({ channel_id: "Speed", unit: "m/s" })]);

    const coloured = bindingFor({ id: "c1", code: mapCode("Speed") }, detail, SPAN_US, NO_DEFS);
    const plain = bindingFor({ id: "c2", code: mapCode(null) }, detail, SPAN_US, NO_DEFS);

    expect(coloured?.kind === "map" && coloured.colourUnit).toEqual({ state: "known", text: "m/s" });
    expect(plain?.kind === "map" && plain.colourUnit).toBeNull();
  });

  it("bindingFor — a map cell at the default width — sizes its budget by C2 §5.3's four-per-pixel rule", () => {
    const binding = bindingFor({ id: "c1", code: mapCode(null) }, sessionDetail([]), SPAN_US, NO_DEFS);

    expect(binding?.kind === "map" && binding.budget).toBe(gpsBudgetForWidth(NOMINAL_CELL_WIDTH_PX));
  });

  it("bindingFor — a map cell at a measured width — sizes its budget from that width", () => {
    const binding = bindingFor({ id: "c1", code: mapCode(null) }, sessionDetail([]), SPAN_US, NO_DEFS, null, new Map(), 1600);

    expect(binding?.kind === "map" && binding.budget).toBe(gpsBudgetForWidth(1600));
  });
});

describe("bindingFor — the spectrogram arm", () => {
  it("bindingFor — a spectrogram cell over a real channel — binds under that channel's raster key", () => {
    const binding = bindingFor({ id: "c1", code: spectrogramCode() }, sessionDetail([channel()]), SPAN_US, NO_DEFS);

    expect(binding?.kind).toBe("spectrogram");
    expect(binding?.kind === "spectrogram" && binding.hostVarName).toBe(rasterKey("IMU0_AccelZ", FFT));
  });

  it("bindingFor — a spectrogram cell — translates fft_params into C3 §3.6's wire spelling", () => {
    const binding = bindingFor({ id: "c1", code: spectrogramCode() }, sessionDetail([channel()]), SPAN_US, NO_DEFS);

    expect(binding?.kind === "spectrogram" && binding.params).toEqual({
      window_size: 1024,
      hop_size: 512,
      window: "hann",
      detrend: "mean",
      scaling: "raw_magnitude",
    });
  });

  it("bindingFor — a spectrogram cell asking for all samples — resolves 'all' against the channel's own count", () => {
    const fft: FftParams = { ...FFT, windowSize: "all", hopSize: "all" };

    const binding = bindingFor(
      { id: "c1", code: spectrogramCode("IMU0_AccelZ", fft) },
      sessionDetail([channel({ sample_count: 2048 })]),
      SPAN_US,
      NO_DEFS
    );

    expect(binding?.kind === "spectrogram" && binding.params.window_size).toBe(2048);
    expect(binding?.kind === "spectrogram" && binding.params.hop_size).toBe(2048);
  });

  it("bindingFor — a channel with fewer than two samples — refuses before any fetch", () => {
    const binding = bindingFor({ id: "c1", code: spectrogramCode() }, sessionDetail([channel({ sample_count: 1 })]), SPAN_US, NO_DEFS);

    expect(binding?.kind === "spectrogram" && binding.unrequestable).toBe("This channel has too few samples for a spectrogram.");
  });

  it("bindingFor — a window size over the bin cap — refuses before any fetch", () => {
    const fft: FftParams = { ...FFT, windowSize: 1_048_576 };

    const binding = bindingFor({ id: "c1", code: spectrogramCode("IMU0_AccelZ", fft) }, sessionDetail([channel()]), SPAN_US, NO_DEFS);

    expect(binding?.kind === "spectrogram" && binding.unrequestable).toContain("reduce the window size");
  });

  it("bindingFor — a spectrogram channel this session does not have — refuses to bind at all", () => {
    const binding = bindingFor({ id: "c1", code: spectrogramCode("missing") }, sessionDetail([channel()]), SPAN_US, NO_DEFS);

    expect(binding).toBeNull();
  });
});

describe("bindingIdentity — the tier B arms", () => {
  it("bindingIdentity — two map bindings differing only in colour channel — differ", () => {
    const detail = sessionDetail([channel({ channel_id: "Speed" }), channel({ channel_id: "Lean" })]);
    const a = bindingFor({ id: "c1", code: mapCode("Speed") }, detail, SPAN_US, NO_DEFS)!;
    const b = bindingFor({ id: "c1", code: mapCode("Lean") }, detail, SPAN_US, NO_DEFS)!;

    expect(bindingIdentity(a)).not.toBe(bindingIdentity(b));
  });

  it("bindingIdentity — one map binding computed twice — is stable, so no second fetch starts", () => {
    const detail = sessionDetail([channel({ channel_id: "Speed" })]);
    const a = bindingFor({ id: "c1", code: mapCode("Speed") }, detail, SPAN_US, NO_DEFS)!;
    const b = bindingFor({ id: "c1", code: mapCode("Speed") }, detail, SPAN_US, NO_DEFS)!;

    expect(bindingIdentity(a)).toBe(bindingIdentity(b));
  });

  it("bindingIdentity — a map and a spectrogram binding — carry disjoint prefixes", () => {
    const detail = sessionDetail([channel()]);
    const map = bindingFor({ id: "c1", code: mapCode(null) }, detail, SPAN_US, NO_DEFS)!;
    const raster = bindingFor({ id: "c2", code: spectrogramCode() }, detail, SPAN_US, NO_DEFS)!;

    expect(bindingIdentity(map).startsWith("map|")).toBe(true);
    expect(bindingIdentity(raster).startsWith("spectrogram|")).toBe(true);
  });

  it("bindingIdentity — two spectrogram bindings differing only in fft_params — differ", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "c1", code: spectrogramCode() }, detail, SPAN_US, NO_DEFS)!;
    const b = bindingFor({ id: "c1", code: spectrogramCode("IMU0_AccelZ", { ...FFT, hopSize: 256 }) }, detail, SPAN_US, NO_DEFS)!;

    expect(bindingIdentity(a)).not.toBe(bindingIdentity(b));
  });
});

describe("unresolvedChannelId — the tier B arms", () => {
  it("unresolvedChannelId — a map cell's missing colour channel — names it", () => {
    expect(unresolvedChannelId(mapCode("Speed"), sessionDetail([channel()]), NO_DEFS)).toBe("Speed");
  });

  it("unresolvedChannelId — an uncoloured map cell — names nothing, there being no channel to miss", () => {
    expect(unresolvedChannelId(mapCode(null), sessionDetail([]), NO_DEFS)).toBeNull();
  });

  it("unresolvedChannelId — a spectrogram cell's missing channel — names it", () => {
    expect(unresolvedChannelId(spectrogramCode("missing"), sessionDetail([channel()]), NO_DEFS)).toBe("missing");
  });

  it("unresolvedChannelId — a map cell's colour channel that does resolve — names nothing", () => {
    const detail = sessionDetail([channel({ channel_id: "Speed" })]);

    expect(unresolvedChannelId(mapCode("Speed"), detail, NO_DEFS)).toBeNull();
  });

  it("unresolvedChannelId — a map cell's colour channel is never resolved against definitions — names it even so", () => {
    const detail = sessionDetail([channel()]);

    expect(unresolvedChannelId(mapCode("Speed"), detail, new Set(["Speed"]))).toBe("Speed");
  });
});
