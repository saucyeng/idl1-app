import { describe, expect, it } from "vitest";

import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { bindingFor, bindingIdentity, unresolvedChannelId, type JsCellBinding, type TimeCellBinding } from "./jsCellBinding";

function lapWindow(lapNumber: number): SelectedWindow {
  return { session_id: "session-a", span: { kind: "lap", lap_number: lapNumber }, colour: "--chart-1" };
}

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

/** Empty by default -- most cases here don't involve a workbook definition. */
const noDefinitions: ReadonlySet<string> = new Set();

/** Narrows a binding to its time arm for assertions -- every fixture in
 *  this file below the FFT describe block is a time cell. */
function asTime(binding: JsCellBinding | null): TimeCellBinding {
  if (binding === null || binding.kind !== "time") throw new Error("expected a time binding");
  return binding;
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

const definitionMarkCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("avg_speed"), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const mixedMarkCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" }),',
  '    Plot.lineY(channel("avg_speed"), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const twoDefinitionsCode = [
  "Plot.plot({",
  "  marks: [",
  '    Plot.lineY(channel("avg_speed"), { x: "t", y: "v" }),',
  '    Plot.lineY(channel("max_speed"), { x: "t", y: "v" })',
  "  ]",
  "})",
].join("\n");

const customCode = "const x = 1;\nreturn x + 1;";

describe("bindingFor", () => {
  it("bindingFor — form-generated code, one mark, known channel — a non-null binding with one channels entry", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000, noDefinitions);

    expect(binding).not.toBeNull();
    expect(asTime(binding).channels).toEqual([{ channelId: "fork_velocity", source: "session", sampleRateHz: 200, lap: null }]);
    expect(asTime(binding).initialSpan).toEqual({ startUs: 0, endUs: 60_000_000 });
    expect(asTime(binding).mountedChannelId).toBe("fork_velocity");
  });

  it("bindingFor — form-generated code, multiple marks on distinct channels — one channels entry per distinct channel", () => {
    const detail = sessionDetail([channel(), channel({ channel_id: "rear_wheel_speed", nominal_rate_hz: 50 })]);

    const binding = bindingFor({ id: "cell-a", code: twoDistinctChannelsCode }, detail, 60_000_000, noDefinitions);

    expect(asTime(binding).channels).toEqual([
      { channelId: "fork_velocity", source: "session", sampleRateHz: 200, lap: null },
      { channelId: "rear_wheel_speed", source: "session", sampleRateHz: 50, lap: null },
    ]);
  });

  it("bindingFor — two marks on the same channel — exactly one channels entry for it, not two", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: twoMarksSameChannelCode }, detail, 60_000_000, noDefinitions);

    expect(asTime(binding).channels).toHaveLength(1);
    expect(asTime(binding).channels).toEqual([{ channelId: "fork_velocity", source: "session", sampleRateHz: 200, lap: null }]);
  });

  it("bindingFor — custom code — returns null", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: customCode }, detail, 60_000_000, noDefinitions);

    expect(binding).toBeNull();
  });

  it("bindingFor — a mark's channel not present in sessionDetail.channels or definitionNames — returns null", () => {
    const detail = sessionDetail([channel({ channel_id: "unrelated_channel" })]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000, noDefinitions);

    expect(binding).toBeNull();
  });

  it("bindingFor — sessionDetail is null — returns null for every cell, form-generated or not", () => {
    const boundFormGenerated = bindingFor({ id: "cell-a", code: oneMarkCode }, null, 60_000_000, noDefinitions);
    const boundCustom = bindingFor({ id: "cell-b", code: customCode }, null, 60_000_000, noDefinitions);

    expect(boundFormGenerated).toBeNull();
    expect(boundCustom).toBeNull();
  });

  it("bindingFor — sessionSpanUs not yet resolved — returns null even for an otherwise-bindable cell", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, null, noDefinitions);

    expect(binding).toBeNull();
  });

  it("bindingFor — a mark naming a workbook definition — one channels entry with source \"definition\" and no mounted channel", () => {
    const detail = sessionDetail([channel()]);
    const definitionNames = new Set(["avg_speed"]);

    const binding = bindingFor({ id: "cell-a", code: definitionMarkCode }, detail, 60_000_000, definitionNames);

    expect(asTime(binding).channels).toEqual([{ channelId: "avg_speed", source: "definition", sampleRateHz: 0, lap: null }]);
    expect(asTime(binding).mountedChannelId).toBeNull();
  });

  it("bindingFor — a cell mixing a session channel and a definition — both resolve, the session channel is mounted", () => {
    const detail = sessionDetail([channel()]);
    const definitionNames = new Set(["avg_speed"]);

    const binding = bindingFor({ id: "cell-a", code: mixedMarkCode }, detail, 60_000_000, definitionNames);

    expect(asTime(binding).channels).toEqual([
      { channelId: "fork_velocity", source: "session", sampleRateHz: 200, lap: null },
      { channelId: "avg_speed", source: "definition", sampleRateHz: 0, lap: null },
    ]);
    expect(asTime(binding).mountedChannelId).toBe("fork_velocity");
  });

  it("bindingFor — a cell whose marks are all definitions — resolves with no mounted channel", () => {
    const detail = sessionDetail([channel()]);
    const definitionNames = new Set(["avg_speed", "max_speed"]);

    const binding = bindingFor({ id: "cell-a", code: twoDefinitionsCode }, detail, 60_000_000, definitionNames);

    expect(binding).not.toBeNull();
    expect(asTime(binding).channels.map((c) => c.source)).toEqual(["definition", "definition"]);
    expect(asTime(binding).mountedChannelId).toBeNull();
  });

  it("bindingFor — session channel resolution is tried before a same-named definition — resolves as \"session\"", () => {
    const detail = sessionDetail([channel({ channel_id: "avg_speed" })]);
    const definitionNames = new Set(["avg_speed"]);

    const binding = bindingFor({ id: "cell-a", code: definitionMarkCode }, detail, 60_000_000, definitionNames);

    expect(asTime(binding).channels).toEqual([{ channelId: "avg_speed", source: "session", sampleRateHz: 200, lap: null }]);
  });
});

describe("bindingIdentity", () => {
  it("bindingIdentity — two calls with the same channel/lap/span — produce the same identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000, noDefinitions);
    const b = bindingFor({ id: "cell-b", code: oneMarkCode }, detail, 60_000_000, noDefinitions);

    expect(bindingIdentity(a!)).toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — a different resolved session span — produces a different identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000, noDefinitions);
    const b = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 90_000_000, noDefinitions);

    expect(bindingIdentity(a!)).not.toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — the same name resolving as a definition, then as a session channel — produces a different identity", () => {
    const detailWithoutChannel = sessionDetail([channel({ channel_id: "unrelated_channel" })]);
    const detailWithChannel = sessionDetail([channel({ channel_id: "avg_speed" })]);
    const definitionNames = new Set(["avg_speed"]);

    const asDefinition = bindingFor({ id: "cell-a", code: definitionMarkCode }, detailWithoutChannel, 60_000_000, definitionNames);
    const asSession = bindingFor({ id: "cell-a", code: definitionMarkCode }, detailWithChannel, 60_000_000, definitionNames);

    expect(bindingIdentity(asDefinition!)).not.toBe(bindingIdentity(asSession!));
  });
});

describe("unresolvedChannelId", () => {
  it("unresolvedChannelId — custom code — returns null", () => {
    const detail = sessionDetail([channel()]);

    expect(unresolvedChannelId(customCode, detail, noDefinitions)).toBeNull();
  });

  it("unresolvedChannelId — form-generated code naming an unresolvable channel — names it", () => {
    const detail = sessionDetail([channel({ channel_id: "unrelated_channel" })]);

    expect(unresolvedChannelId(oneMarkCode, detail, noDefinitions)).toBe("fork_velocity");
  });

  it("unresolvedChannelId — every referenced channel resolves — returns null", () => {
    const detail = sessionDetail([channel()]);

    expect(unresolvedChannelId(oneMarkCode, detail, noDefinitions)).toBeNull();
  });

  it("unresolvedChannelId — a mark naming a workbook definition — is not reported as unresolved", () => {
    const detail = sessionDetail([channel()]);
    const definitionNames = new Set(["avg_speed"]);

    expect(unresolvedChannelId(definitionMarkCode, detail, definitionNames)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FFT arm (L6 Task 20, C2 §5.3).
// ---------------------------------------------------------------------------

/** Narrows a binding to its FFT arm for assertions. */
function asFft(binding: JsCellBinding | null): import("./jsCellBinding").FftCellBinding {
  if (binding === null || binding.kind !== "fft") throw new Error("expected an FFT binding");
  return binding;
}

function fftCode(channelId: string, windowSize: number | "all" = 1024, hopSize: number | "all" = 512, averaging = "mean"): string {
  return [
    "Plot.plot({",
    '  x: { type: "log" },',
    "  marks: [",
    `    Plot.lineY(spectrum(${JSON.stringify(channelId)}, { windowSize: ${JSON.stringify(windowSize)}, hopSize: ${JSON.stringify(hopSize)}, window: "hann", detrend: "mean", scaling: "magnitude", averaging: ${JSON.stringify(averaging)} }), { x: "f", y: "m" })`,
    "  ]",
    "})",
  ].join("\n");
}

describe("bindingFor — FFT arm", () => {
  it("bindingFor — an FFT cell naming a real session channel — binds with kind fft", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);

    expect(asFft(binding).channelId).toBe("fork_velocity");
    expect(asFft(binding).kind).toBe("fft");
  });

  it("bindingFor — an FFT cell with windowSize/hopSize \"all\" — resolves both to the channel's sample_count", () => {
    const detail = sessionDetail([channel({ sample_count: 12_345 })]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity", "all", "all", "none") }, detail, 60_000_000, noDefinitions);

    expect(asFft(binding).sampleCount).toBe(12_345);
    expect(asFft(binding).request.params.window_size).toBe(12_345);
    expect(asFft(binding).request.params.hop_size).toBe(12_345);
  });

  it("bindingFor — a channel with fewer than two samples — unrequestable with a note, request still built", () => {
    const detail = sessionDetail([channel({ sample_count: 1 })]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);

    expect(asFft(binding).unrequestable).toBe("This channel has too few samples for an FFT.");
    expect(asFft(binding).request).not.toBeNull();
  });

  it("bindingFor — a resolved window over MAX_FFT_BINS — unrequestable with a note", () => {
    const detail = sessionDetail([channel({ sample_count: 100_000 })]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity", 20_000, 10_000) }, detail, 60_000_000, noDefinitions);

    expect(asFft(binding).unrequestable).toBe("This spectrum has more bins than the chart can draw — reduce the window size.");
  });

  it("bindingFor — a window at or under MAX_FFT_BINS with enough samples — requestable (unrequestable is null)", () => {
    const detail = sessionDetail([channel({ sample_count: 100_000 })]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity", 2048, 1024) }, detail, 60_000_000, noDefinitions);

    expect(asFft(binding).unrequestable).toBeNull();
  });

  it("bindingFor — an FFT cell naming a channel this session doesn't have — returns null, and unresolvedChannelId names it", () => {
    const detail = sessionDetail([channel({ channel_id: "unrelated_channel" })]);

    const binding = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);

    expect(binding).toBeNull();
    expect(unresolvedChannelId(fftCode("fork_velocity"), detail, noDefinitions)).toBe("fork_velocity");
  });

  it("bindingFor — a custom-code cell calling spectrum(...) outside the grammar — binds nothing", () => {
    const detail = sessionDetail([channel()]);
    const custom = 'const s = spectrum("fork_velocity", { windowSize: 1024 });\nreturn s;';

    const binding = bindingFor({ id: "cell-a", code: custom }, detail, 60_000_000, noDefinitions);

    expect(binding).toBeNull();
  });

  it("bindingFor — hostVarName matches spectrumKey(channelId, fft) exactly", () => {
    const detail = sessionDetail([channel()]);

    const binding = asFft(bindingFor({ id: "cell-a", code: fftCode("fork_velocity", 1024, 512, "mean") }, detail, 60_000_000, noDefinitions));

    expect(binding.hostVarName).toBe("fork_velocity | 1024 | 512 | hann | mean | magnitude | mean");
  });

  it("bindingFor — no window argument — request.window defaults to null (R117/R127)", () => {
    const detail = sessionDetail([channel()]);

    const binding = asFft(bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions));

    expect(binding.request.window).toBeNull();
  });

  it("bindingFor — a window selected — request.window carries it straight through", () => {
    const detail = sessionDetail([channel()]);
    const window = lapWindow(3);

    const binding = asFft(bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, window));

    expect(binding.request.window).toBe(window);
  });

  it("bindingFor — a window selected on a time cell — unaffected (window is consulted only by the FFT arm)", () => {
    const detail = sessionDetail([channel()]);

    const binding = bindingFor({ id: "cell-a", code: oneMarkCode }, detail, 60_000_000, noDefinitions, lapWindow(3));

    expect(binding?.kind).toBe("time");
  });

  it("bindingFor — hostVarName never varies by window (ruling R129, amending R127 item 5) — two different selected windows over the same channel/params produce the same hostVarName", () => {
    const detail = sessionDetail([channel()]);

    const a = asFft(bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(1)));
    const b = asFft(bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(2)));

    expect(a.hostVarName).toBe(b.hostVarName);
  });
});

describe("bindingIdentity — FFT arm", () => {
  it("bindingIdentity — two FFT bindings with the same hostVarName/sampleCount/unrequestable — produce the same identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);
    const b = bindingFor({ id: "cell-b", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);

    expect(bindingIdentity(a!)).toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — a different fft_params (different hostVarName) — produces a different identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: fftCode("fork_velocity", 1024, 512) }, detail, 60_000_000, noDefinitions);
    const b = bindingFor({ id: "cell-a", code: fftCode("fork_velocity", 2048, 1024) }, detail, 60_000_000, noDefinitions);

    expect(bindingIdentity(a!)).not.toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — an FFT binding and a time binding — never collide", () => {
    const detail = sessionDetail([channel()]);
    const fft = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions);
    const time = bindingFor({ id: "cell-b", code: oneMarkCode }, detail, 60_000_000, noDefinitions);

    expect(bindingIdentity(fft!)).not.toBe(bindingIdentity(time!));
  });

  it("bindingIdentity — a different selected window, everything else unchanged — produces a different identity (R83/L2b Task 6, extended by R117/R127)", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(1));
    const b = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(2));

    expect(bindingIdentity(a!)).not.toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — same window content on both sides, including both null — produces the same identity", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, null);
    const b = bindingFor({ id: "cell-b", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, null);

    expect(bindingIdentity(a!)).toBe(bindingIdentity(b!));
  });

  it("bindingIdentity — two different windows sharing the same hostVarName (ruling R129) — still produce a different identity, from request.window's content alone", () => {
    const detail = sessionDetail([channel()]);
    const a = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(1));
    const b = bindingFor({ id: "cell-a", code: fftCode("fork_velocity") }, detail, 60_000_000, noDefinitions, lapWindow(2));

    expect(asFft(a).hostVarName).toBe(asFft(b).hostVarName);
    expect(bindingIdentity(a!)).not.toBe(bindingIdentity(b!));
  });
});
