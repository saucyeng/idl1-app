/**
 * The histogram arm of `bindingFor`/`bindingIdentity`/`unresolvedChannelId`
 * (ruling R215 item 2). Its own file rather than an appendix to
 * `jsCellBinding.test.ts`, matching this lane's "one chart kind's arm reads
 * as one file" convention (`plotForm/histogram.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { MAX_HISTOGRAM_BINS } from "../../../../ipc/histogram";
import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import { generate } from "../plotForm/generate";
import { histogramKey } from "../plotForm/histogramKey";
import type { HistogramParams, HistogramPlotProps } from "../plotForm/types";
import { bindingFor, bindingIdentity, unresolvedChannelId } from "./jsCellBinding";

const PARAMS: HistogramParams = { binMode: "count", binValue: 64, symmetric: true, normalise: "fraction" };

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
  } as unknown as SessionDetail;
}

function code(params: HistogramParams = PARAMS, channelId = "fork_velocity"): string {
  const props: HistogramPlotProps = { chart: "histogram", mark: { channel: channelId, histogram: params } };
  return generate(props);
}

const DETAIL = sessionDetail([channel()]);
const NO_DEFS: ReadonlySet<string> = new Set();

describe("bindingFor — histogram cell", () => {
  it("bindingFor — a histogram cell over a session channel — binds the histogram arm with the wire params", () => {
    // Act
    const binding = bindingFor({ id: "c1", code: code() }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    expect(binding?.kind).toBe("histogram");
    if (binding?.kind === "histogram") {
      expect(binding.channelId).toBe("fork_velocity");
      expect(binding.params).toEqual({ bin_mode: "count", bin_value: 64, symmetric: true, normalise: "fraction" });
      expect(binding.hostVarName).toBe(histogramKey("fork_velocity", PARAMS));
      expect(binding.unrequestable).toBeNull();
      expect(binding.unit).toEqual({ state: "known", text: "m/s" });
    }
  });

  it("bindingFor — a histogram cell naming a channel this session lacks — is null, never a fetch", () => {
    // Act
    const binding = bindingFor({ id: "c1", code: code(PARAMS, "not_a_channel") }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    expect(binding).toBeNull();
  });

  it("bindingFor — a histogram cell naming a workbook definition — is null (fetch_histogram takes a session channel)", () => {
    // Act — the name resolves as a definition for a *time* cell, but a
    // histogram slices `data.parquet`, which a definition has no column in.
    const binding = bindingFor({ id: "c1", code: code(PARAMS, "my_def") }, DETAIL, 1_000_000, new Set(["my_def"]));

    // Assert
    expect(binding).toBeNull();
  });

  it("bindingFor — a bin count over C3 §3.6's cap — is unrequestable with its reason, not a fetch", () => {
    // Act
    const binding = bindingFor(
      { id: "c1", code: code({ ...PARAMS, binValue: MAX_HISTOGRAM_BINS + 1 }) },
      DETAIL,
      1_000_000,
      NO_DEFS
    );

    // Assert
    expect(binding?.kind).toBe("histogram");
    if (binding?.kind === "histogram") {
      expect(binding.unrequestable).toContain(String(MAX_HISTOGRAM_BINS));
    }
  });

  it("bindingFor — a non-integer bin count — is unrequestable, never silently rounded", () => {
    // Act
    const binding = bindingFor({ id: "c1", code: code({ ...PARAMS, binValue: 10.5 }) }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    if (binding?.kind === "histogram") {
      expect(binding.unrequestable).not.toBeNull();
      expect(binding.params.bin_value).toBe(10.5);
    }
  });

  it("bindingFor — a non-positive bin width — is unrequestable with its own reason", () => {
    // Act
    const binding = bindingFor({ id: "c1", code: code({ ...PARAMS, binMode: "width", binValue: -1 }) }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    if (binding?.kind === "histogram") {
      expect(binding.unrequestable).toBe("Bin width must be greater than zero.");
    }
  });

  it("bindingFor — a fractional bin width — is requestable (only \"count\" mode requires an integer)", () => {
    // Act
    const binding = bindingFor({ id: "c1", code: code({ ...PARAMS, binMode: "width", binValue: 0.25 }) }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    if (binding?.kind === "histogram") {
      expect(binding.unrequestable).toBeNull();
    }
  });

  it("bindingFor — a cell making both a histogram() and a channel() call — binds the histogram arm", () => {
    // Arrange — a hand-written cell outside the grammar (R148 part 2 still
    // binds it); the histogram call wins, mirroring the spectrum arm's
    // precedence over channel calls.
    const hand = `${code()}\n// also mentions channel("fork_velocity")`;

    // Act
    const binding = bindingFor({ id: "c1", code: hand }, DETAIL, 1_000_000, NO_DEFS);

    // Assert
    expect(binding?.kind).toBe("histogram");
  });
});

describe("bindingIdentity — histogram cell", () => {
  it("bindingIdentity — two different binnings of the same channel — differ", () => {
    // Arrange
    const a = bindingFor({ id: "c1", code: code() }, DETAIL, 1_000_000, NO_DEFS)!;
    const b = bindingFor({ id: "c1", code: code({ ...PARAMS, binValue: 32 }) }, DETAIL, 1_000_000, NO_DEFS)!;

    // Assert
    expect(bindingIdentity(a)).not.toBe(bindingIdentity(b));
  });

  it("bindingIdentity — the same cell bound twice — is stable, so no second fetch starts", () => {
    // Arrange
    const a = bindingFor({ id: "c1", code: code() }, DETAIL, 1_000_000, NO_DEFS)!;
    const b = bindingFor({ id: "c1", code: code() }, DETAIL, 1_000_000, NO_DEFS)!;

    // Assert
    expect(bindingIdentity(a)).toBe(bindingIdentity(b));
  });

  it("bindingIdentity — a histogram identity — is distinguishable from an FFT or time identity", () => {
    // Arrange
    const histogram = bindingFor({ id: "c1", code: code() }, DETAIL, 1_000_000, NO_DEFS)!;

    // Assert
    expect(bindingIdentity(histogram).startsWith("histogram|")).toBe(true);
  });
});

describe("unresolvedChannelId — histogram cell", () => {
  it("unresolvedChannelId — a histogram cell naming a missing channel — names it", () => {
    // Assert
    expect(unresolvedChannelId(code(PARAMS, "nope"), DETAIL, NO_DEFS)).toBe("nope");
  });

  it("unresolvedChannelId — a histogram cell naming a definition — still names it (never a session channel)", () => {
    // Assert
    expect(unresolvedChannelId(code(PARAMS, "my_def"), DETAIL, new Set(["my_def"]))).toBe("my_def");
  });

  it("unresolvedChannelId — a histogram cell over a real channel — is null", () => {
    // Assert
    expect(unresolvedChannelId(code(), DETAIL, NO_DEFS)).toBeNull();
  });
});
