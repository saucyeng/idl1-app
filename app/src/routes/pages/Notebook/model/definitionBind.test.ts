/**
 * `model/definitionBind.ts` — C2 §5.1 / §3.6.5: every `math` definition bound
 * by name by rank, and the `laps` / `session` host variables.
 */
import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import { AxisKind, type DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import type { WindowDescriptor } from "../host/protocol";
import { hostLaps, hostSession, planDefinitionBinding, runDefinitionBind, type DefinitionBindAction } from "./definitionBind";

const window1: SelectedWindow = { session_id: "session-a", span: { kind: "session" }, colour: "--chart-1" };
const window2: SelectedWindow = { session_id: "session-b", span: { kind: "session" }, colour: "--chart-2" };

function descriptor(sessionId: string): WindowDescriptor {
  return { sessionId, span: { kind: "session" }, colour: "--chart-1", label: sessionId };
}

function scalar(value: number): DecodedHostChannel {
  return { hasT: false, axisKind: AxisKind.None, t: new Float64Array(0), v: new Float64Array([value]) };
}

function series(axisKind: DecodedHostChannel["axisKind"], t: number[], v: number[]): DecodedHostChannel {
  return { hasT: true, axisKind, t: Float64Array.from(t), v: Float64Array.from(v) };
}

describe("planDefinitionBinding", () => {
  it("plan — rank-0 definition — binds the bare number", () => {
    const results = [{ descriptor: descriptor("a"), decoded: scalar(4.25) }];

    const plan = planDefinitionBinding(results);

    expect(plan).toEqual({ kind: "scalar", value: 4.25 });
  });

  it("plan — [lap] definition — binds a Lap-axis series", () => {
    const results = [{ descriptor: descriptor("a"), decoded: series(AxisKind.Lap, [1, 2, 3], [92.4, 91.8, 93.1]) }];

    const plan = planDefinitionBinding(results);

    expect(plan.kind).toBe("series");
    if (plan.kind !== "series") return;
    expect(plan.axisKind).toBe(AxisKind.Lap);
    expect(plan.length).toBe(3);
    expect(Array.from(plan.t)).toEqual([1, 2, 3]);
    expect(Array.from(plan.v)).toEqual([92.4, 91.8, 93.1]);
  });

  it("plan — [f] definition — keeps the Frequency axis kind", () => {
    const results = [{ descriptor: descriptor("a"), decoded: series(AxisKind.Frequency, [10, 20], [1, 2]) }];

    const plan = planDefinitionBinding(results);

    expect(plan.kind === "series" && plan.axisKind).toBe(AxisKind.Frequency);
  });

  it("plan — a later window with a different axis kind — is dropped", () => {
    const results = [
      { descriptor: descriptor("a"), decoded: series(AxisKind.Lap, [1], [90]) },
      { descriptor: descriptor("b"), decoded: series(AxisKind.Time, [0, 1], [5, 6]) },
    ];

    const plan = planDefinitionBinding(results);

    expect(plan.kind === "series" && plan.windows.length).toBe(1);
  });

  it("plan — an axis-less vector — stays unbound", () => {
    const decoded: DecodedHostChannel = { hasT: false, axisKind: AxisKind.None, t: new Float64Array(0), v: new Float64Array([1, 2]) };

    const plan = planDefinitionBinding([{ descriptor: descriptor("a"), decoded }]);

    expect(plan).toEqual({ kind: "unbound" });
  });

  it("plan — no window answered — stays unbound", () => {
    const plan = planDefinitionBinding([]);

    expect(plan).toEqual({ kind: "unbound" });
  });
});

describe("runDefinitionBind", () => {
  const windows = [
    { window: window1, descriptor: descriptor("session-a") },
    { window: window2, descriptor: descriptor("session-b") },
  ];

  it("run — two windows, scalar — dispatches the first window's number", async () => {
    const actions: DefinitionBindAction[] = [];
    const deps = { fetchHostChannel: async (w: SelectedWindow | null) => scalar(w?.session_id === "session-a" ? 1.5 : 9) };

    await runDefinitionBind(deps, windows, "med", 512, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ name: "med", binding: { kind: "scalar", value: 1.5 } }]);
  });

  it("run — one window rejects — the other still binds", async () => {
    const actions: DefinitionBindAction[] = [];
    const deps = {
      fetchHostChannel: async (w: SelectedWindow | null) => {
        if (w?.session_id === "session-a") throw new Error("math_unknown_channel");
        return series(AxisKind.Lap, [1, 2], [90, 91]);
      },
    };

    await runDefinitionBind(deps, windows, "lt", 512, (a) => actions.push(a), () => false);

    expect(actions).toHaveLength(1);
    const binding = actions[0].binding;
    expect(binding.kind === "series" && binding.length).toBe(2);
  });

  it("run — every window rejects — dispatches nothing", async () => {
    const actions: DefinitionBindAction[] = [];
    const deps = { fetchHostChannel: async (): Promise<DecodedHostChannel> => Promise.reject(new Error("x")) };

    await runDefinitionBind(deps, windows, "lt", 512, (a) => actions.push(a), () => false);

    expect(actions).toEqual([]);
  });

  it("run — stale after the await — dispatches nothing", async () => {
    const actions: DefinitionBindAction[] = [];
    const deps = { fetchHostChannel: async () => scalar(1) };

    await runDefinitionBind(deps, windows, "med", 512, (a) => actions.push(a), () => true);

    expect(actions).toEqual([]);
  });
});

function detail(overrides: Partial<SessionDetail>): SessionDetail {
  return {
    session_id: "s1",
    timestamp_utc_ms: 1_700_000_000_000,
    laps: [
      { lap_number: 1, start_time_secs: 0, end_time_secs: 90.5 },
      { lap_number: 2, start_time_secs: 90.5, end_time_secs: 181 },
    ],
    ...overrides,
  } as SessionDetail;
}

describe("hostLaps / hostSession", () => {
  it("laps — a session with two laps — maps number and session-relative seconds", () => {
    const laps = hostLaps(detail({}));

    expect(laps).toEqual([
      { number: 1, startT: 0, endT: 90.5 },
      { number: 2, startT: 90.5, endT: 181 },
    ]);
  });

  it("laps — no session — is empty", () => {
    expect(hostLaps(null)).toEqual([]);
  });

  it("session — a named session — carries id, name and timestamp", () => {
    const session = hostSession(detail({}), "Morzine");

    expect(session).toEqual({ id: "s1", name: "Morzine", timestampUtcMs: 1_700_000_000_000 });
  });

  it("session — empty name — omits name", () => {
    const session = hostSession(detail({}), "");

    expect(session).toEqual({ id: "s1", timestampUtcMs: 1_700_000_000_000 });
  });

  it("session — no session — is null", () => {
    expect(hostSession(null, "x")).toBeNull();
  });
});
