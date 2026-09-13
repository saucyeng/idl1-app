/**
 * `model/lapDriver.ts` and `bindingFor`'s lap-progression arm (ruling R233,
 * C2 §5.3's lap cell) — its own file, matching this lane's "one chart kind's
 * arm reads as one file" convention (`jsCellBindingTierB.test.ts`).
 */
import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import { AxisKind, type DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { generate } from "../plotForm/generate";
import type { LapPlotProps } from "../plotForm/types";
import { bindingFor, bindingIdentity, LAP_SERIES_BUDGET } from "./jsCellBinding";
import { lapColumns, runLapSeries, type LapAction, type LapDeps } from "./lapDriver";

function sessionDetail(): SessionDetail {
  return {
    session_id: "session-a",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "a".repeat(64),
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
    laps: [],
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
  } as unknown as SessionDetail;
}

const lapProps: LapPlotProps = {
  chart: "lap",
  mark: { definition: "lap_time_s", mark: "lineY", seriesBy: "w" },
};

const window1: SelectedWindow = { session_id: "session-a", span: { kind: "session" }, colour: "--chart-1" };

function decoded(overrides: Partial<DecodedHostChannel> = {}): DecodedHostChannel {
  return {
    hasT: true,
    axisKind: AxisKind.Lap,
    t: new Float64Array([1, 2, 3]),
    v: new Float64Array([92.4, 91.8, 93.1]),
    ...overrides,
  };
}

describe("bindingFor — the lap arm", () => {
  it("lap binding — a generated lap cell over a known definition — binds the definition as its host variable", () => {
    const code = generate(lapProps);

    const binding = bindingFor({ id: "c1", code }, sessionDetail(), 1_000_000, new Set(["lap_time_s"]));

    expect(binding).toEqual({
      kind: "lap",
      props: lapProps,
      definition: "lap_time_s",
      hostVarName: "lap_time_s",
      budget: LAP_SERIES_BUDGET,
      unrequestable: null,
    });
  });

  it("lap binding — a definition this workbook does not have — binds with a reason rather than refusing", () => {
    const code = generate(lapProps);

    const binding = bindingFor({ id: "c1", code }, sessionDetail(), 1_000_000, new Set(["something_else"]));

    expect(binding?.kind).toBe("lap");
    expect(binding?.kind === "lap" && binding.unrequestable).toContain("lap_time_s");
  });

  it("lap identity — the same definition, a different refusal state — differs", () => {
    const code = generate(lapProps);

    const found = bindingFor({ id: "c1", code }, sessionDetail(), 1_000_000, new Set(["lap_time_s"]));
    const missing = bindingFor({ id: "c1", code }, sessionDetail(), 1_000_000, new Set());

    expect(bindingIdentity(found!)).not.toBe(bindingIdentity(missing!));
  });

  it("lap binding — a cell whose code is not the lap form — is not a lap binding", () => {
    const binding = bindingFor({ id: "c1", code: "Plot.plot({ marks: [] })" }, sessionDetail(), 1_000_000, new Set(["lap_time_s"]));

    expect(binding).toBeNull();
  });
});

describe("runLapSeries", () => {
  function deps(result: Promise<DecodedHostChannel>): LapDeps {
    return { fetchHostChannel: () => result };
  }

  it("lap series — a [lap] definition — dispatches its lap numbers and values", async () => {
    const actions: LapAction[] = [];

    await runLapSeries(deps(Promise.resolve(decoded())), "c1", window1, "lap_time_s", LAP_SERIES_BUDGET, (a) => actions.push(a), () => false);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("lapSeries");
    expect(actions[0].type === "lapSeries" && Array.from(actions[0].lap)).toEqual([1, 2, 3]);
  });

  it("lap series — a [t] definition — dispatches a shape mismatch naming both shapes", async () => {
    const actions: LapAction[] = [];
    const timeSeries = decoded({ axisKind: AxisKind.Time });

    await runLapSeries(deps(Promise.resolve(timeSeries)), "c1", window1, "fork_smooth", LAP_SERIES_BUDGET, (a) => actions.push(a), () => false);

    expect(actions[0].type).toBe("lapSeriesError");
    expect(actions[0].type === "lapSeriesError" && actions[0].error.kind).toBe("invalid_argument");
    expect(actions[0].type === "lapSeriesError" && actions[0].error.message).toContain("[t]");
    expect(actions[0].type === "lapSeriesError" && actions[0].error.message).toContain("[lap]");
  });

  it("lap series — a scalar definition — names the rank-0 shape it found", async () => {
    const actions: LapAction[] = [];
    const scalar = decoded({ hasT: false, axisKind: AxisKind.None, t: new Float64Array(0) });

    await runLapSeries(deps(Promise.resolve(scalar)), "c1", window1, "fork_max", LAP_SERIES_BUDGET, (a) => actions.push(a), () => false);

    expect(actions[0].type === "lapSeriesError" && actions[0].error.message).toContain("[]");
  });

  it("lap series — a rejected fetch — dispatches the typed error, never throws out", async () => {
    const actions: LapAction[] = [];

    await runLapSeries(
      deps(Promise.reject({ kind: "not_found", message: "no such definition" })),
      "c1",
      window1,
      "lap_time_s",
      LAP_SERIES_BUDGET,
      (a) => actions.push(a),
      () => false
    );

    expect(actions).toEqual([{ type: "lapSeriesError", cellId: "c1", window: window1, error: { kind: "not_found", message: "no such definition" } }]);
  });

  it("lap series — an untyped rejection — becomes an internal IpcError", async () => {
    const actions: LapAction[] = [];

    await runLapSeries(deps(Promise.reject(new Error("boom"))), "c1", window1, "lap_time_s", 1, (a) => actions.push(a), () => false);

    expect(actions[0].type === "lapSeriesError" && actions[0].error).toEqual({ kind: "internal", message: "boom" });
  });

  it("lap series — a superseded run — dispatches nothing at all", async () => {
    const actions: LapAction[] = [];

    await runLapSeries(deps(Promise.resolve(decoded())), "c1", window1, "lap_time_s", 1, (a) => actions.push(a), () => true);

    expect(actions).toEqual([]);
  });

  it("lap series — a window with no complete lap — is an empty series, not an error", async () => {
    const actions: LapAction[] = [];
    const empty = decoded({ t: new Float64Array(0), v: new Float64Array(0) });

    await runLapSeries(deps(Promise.resolve(empty)), "c1", window1, "lap_time_s", 1, (a) => actions.push(a), () => false);

    expect(actions[0].type).toBe("lapSeries");
  });
});

describe("lapColumns", () => {
  it("lap columns — columns of unequal length — truncates both to the shorter", () => {
    const { lap, v } = lapColumns(new Float64Array([1, 2, 3]), new Float64Array([90, 91]));

    expect(Array.from(lap)).toEqual([1, 2]);
    expect(Array.from(v)).toEqual([90, 91]);
  });

  it("lap columns — matching lengths — returns the same arrays untouched", () => {
    const lapIn = new Float64Array([1, 2]);
    const vIn = new Float64Array([90, 91]);

    const out = lapColumns(lapIn, vIn);

    expect(out.lap).toBe(lapIn);
    expect(out.v).toBe(vIn);
  });
});
