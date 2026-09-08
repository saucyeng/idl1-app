import { describe, expect, it } from "vitest";

import type { DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import type { WindowDescriptor } from "../host/protocol";
import { CellRunSequencer } from "./cellRunSequencer";
import {
  clampHostChannelBudget,
  runChannelBind,
  runChannelSettle,
  shouldRefetchHostChannel,
  type BindWindow,
  type ChannelBindAction,
  type ChannelBindDeps,
} from "./channelBindDriver";
import type { BoundChannel } from "./channelRebind";
import type { JsCellBindingChannel, TimeCellBinding } from "./jsCellBinding";
import { TileCache } from "./tileCache";

/** Builds a `WindowDescriptor` for a test fixture -- `span`/`colour`/`label` are unread by `channelBindDriver.ts` itself (they pass straight through to the combined payload), so a placeholder is fine everywhere but the tests that assert on it directly. */
function descriptor(sessionId: string, colour = "--chart-1"): WindowDescriptor {
  return { sessionId, span: { kind: "session" }, colour, label: sessionId };
}

/** One selected window, unbounded (`endUs: Infinity`) -- the single-window fixture every existing (pre-Task-11b) test uses; `mapViewportToWindow` re-bases a viewport of `[startUs, endUs)` onto a window starting at `0` as the identity, so this keeps every existing assertion's numbers unchanged (R127 item 3, byte-identical). */
function oneWindow(sessionId = "session-a"): BindWindow[] {
  return [{ sessionId, span: { startUs: 0, endUs: Infinity }, descriptor: descriptor(sessionId) }];
}

/** `n` selected windows, each covering `[i * spanUs, (i + 1) * spanUs)` of its own (distinct) session -- a multi-window comparison fixture, e.g. two laps back to back. */
function windowsOf(n: number, spanUs = 10_000_000): BindWindow[] {
  return Array.from({ length: n }, (_, i) => {
    const sessionId = `session-${i}`;
    return { sessionId, span: { startUs: i * spanUs, endUs: (i + 1) * spanUs }, descriptor: descriptor(sessionId) };
  });
}

/** Builds a small fake `DecodedTile` from parallel arrays, matching the fixture style used by `channelRebind.test.ts`. */
function fakeTile(columnTUs: bigint[], columnMean: number[], tileIndex = 0): DecodedTile {
  const columnCount = columnTUs.length;
  return {
    version: 2,
    tier: 0,
    tileIndex,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnCount),
    columnMax: new Float32Array(columnCount),
    columnMean: new Float32Array(columnMean),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

/** A `fetchHostChannel` that fails every call — the default for a fixture whose binding has no `"definition"` channel. */
function neverFetchesHostChannel(): ChannelBindDeps["fetchHostChannel"] {
  return () => Promise.reject(new Error("fetchHostChannel not expected in this test"));
}

/** A binding covering `channelIds` as `"session"` channels, each with a distinct sample rate small enough that a 2 s window resolves to exactly one tile (`tileIndex` 0) at whatever tier `chooseTier` picks -- keeps every test's fixture to one `fetchTile` call per channel. */
function binding(channelIds: string[]): TimeCellBinding {
  const channels: JsCellBindingChannel[] = channelIds.map((channelId, i) => ({
    channelId,
    source: "session",
    sampleRateHz: 50 + i * 25,
    lap: null,
  }));
  return {
    kind: "time",
    props: { chart: "time", marks: [] },
    channels,
    initialSpan: { startUs: 0, endUs: 2_000_000 },
    mountedChannelId: channels[0]?.channelId ?? null,
  };
}

/** A `JsCellBinding` whose channels are a mix of `"session"` and `"definition"` sources, in the given order. `mountedChannelId` is the first `"session"` entry, matching `bindingFor`'s own rule. */
function mixedBinding(entries: Array<{ channelId: string; source: "session" | "definition" }>): TimeCellBinding {
  const channels: JsCellBindingChannel[] = entries.map((entry, i) => ({
    channelId: entry.channelId,
    source: entry.source,
    sampleRateHz: entry.source === "session" ? 50 + i * 25 : 0,
    lap: null,
  }));
  return {
    kind: "time",
    props: { chart: "time", marks: [] },
    channels,
    initialSpan: { startUs: 0, endUs: 2_000_000 },
    mountedChannelId: channels.find((c) => c.source === "session")?.channelId ?? null,
  };
}

function fakeHostChannel(v: number[], hasT = true): DecodedHostChannel {
  return { hasT, t: hasT ? new Float64Array(v.map((_, i) => i)) : new Float64Array(0), v: new Float64Array(v) };
}

function neverStale(): boolean {
  return false;
}

describe("clampHostChannelBudget", () => {
  it("clampHostChannelBudget — a value inside the range — is returned unchanged (rounded)", () => {
    expect(clampHostChannelBudget(640)).toBe(640);
  });

  it("clampHostChannelBudget — 0 — clamps up to 1", () => {
    expect(clampHostChannelBudget(0)).toBe(1);
  });

  it("clampHostChannelBudget — 1 — is returned unchanged", () => {
    expect(clampHostChannelBudget(1)).toBe(1);
  });

  it("clampHostChannelBudget — 65536 — is returned unchanged", () => {
    expect(clampHostChannelBudget(65536)).toBe(65536);
  });

  it("clampHostChannelBudget — 65537 — clamps down to 65536", () => {
    expect(clampHostChannelBudget(65537)).toBe(65536);
  });

  it("clampHostChannelBudget — a fractional width's point budget — rounds to the nearest integer", () => {
    expect(clampHostChannelBudget(639.6)).toBe(640);
    expect(clampHostChannelBudget(639.4)).toBe(639);
  });
});

describe("shouldRefetchHostChannel", () => {
  it("shouldRefetchHostChannel — no previous budget — true (always refetch the first time)", () => {
    expect(shouldRefetchHostChannel(null, 640)).toBe(true);
  });

  it("shouldRefetchHostChannel — the same budget — false", () => {
    expect(shouldRefetchHostChannel(640, 640)).toBe(false);
  });

  it("shouldRefetchHostChannel — a different budget — true", () => {
    expect(shouldRefetchHostChannel(640, 800)).toBe(true);
  });
});

describe("runChannelBind", () => {
  it("runChannelBind — two-channel binding — dispatches channelData for both, in order, mounts only the first, and registers both bound channels in order", async () => {
    const cache = new TileCache();
    const fetched: string[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: (_sid, channelId) => {
        fetched.push(channelId);
        return Promise.resolve(fakeTile([0n, 1_000_000n], [1, 2]));
      },
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, oneWindow(), "cell-a", binding(["fork_velocity", "rear_wheel_speed"]), 64, (a) => actions.push(a), neverStale);

    expect(fetched).toEqual(["fork_velocity", "rear_wheel_speed"]);
    const channelDataActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData");
    expect(channelDataActions.map((a) => a.channelId)).toEqual(["fork_velocity", "rear_wheel_speed"]);
    const boundActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "boundChannels" }> => a.type === "boundChannels");
    expect(boundActions).toHaveLength(1);
    expect(boundActions[0].bound.map((b) => b.name)).toEqual(["fork_velocity", "rear_wheel_speed"]);
    const windowActions = actions.filter((a) => a.type === "chartWindow");
    expect(windowActions).toHaveLength(1);
  });

  it("runChannelBind — a binding with one channels entry (dedupe already done by bindingFor) — sends exactly one channelData and one boundChannels", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, oneWindow(), "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(1);
    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
  });

  it("runChannelBind — isStale becomes true after the first channel's fetch resolves — drops every dispatch, including for channels not yet fetched", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() };
    const actions: ChannelBindAction[] = [];
    let calls = 0;
    const isStale = () => {
      calls += 1;
      return calls >= 1;
    };

    await runChannelBind(deps, cache, oneWindow(), "cell-a", binding(["fork_velocity", "rear_wheel_speed"]), 64, (a) => actions.push(a), isStale);

    expect(actions).toEqual([]);
  });

  it("runChannelBind — current (never stale) — every action is dispatched exactly once", async () => {
    const cache = new TileCache();
    let fetchCalls = 0;
    const deps: ChannelBindDeps = {
      fetchTile: () => {
        fetchCalls += 1;
        return Promise.resolve(fakeTile([0n], [1]));
      },
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, oneWindow(), "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(fetchCalls).toBe(1);
    expect(actions).toHaveLength(3); // channelData + boundChannels + chartWindow
  });

  it("runChannelBind — a definition-only cell — dispatches one channelData and one boundChannels, no chartWindow", async () => {
    const cache = new TileCache();
    const hostChannelCalls: Array<{ defName: string; budget: number }> = [];
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.reject(new Error("fetchTile not expected for a definition-only cell")),
      fetchHostChannel: (defName, budget) => {
        hostChannelCalls.push({ defName, budget });
        return Promise.resolve(fakeHostChannel([1, 2, 3]));
      },
    };
    const actions: ChannelBindAction[] = [];
    const cellBinding = mixedBinding([{ channelId: "avg_speed", source: "definition" }]);

    await runChannelBind(deps, cache, oneWindow(), "cell-a", cellBinding, 640, (a) => actions.push(a), neverStale);

    expect(hostChannelCalls).toEqual([{ defName: "avg_speed", budget: 1280 }]);
    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(1);
    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
    expect(actions.filter((a) => a.type === "chartWindow")).toHaveLength(0);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound).toEqual([{ source: "definition", name: "avg_speed", budget: 1280 }]);
  });

  it("runChannelBind — a mixed cell (session + definition) — dispatches both kinds in channel order, mounts only the session channel", async () => {
    const cache = new TileCache();
    const fetchOrder: string[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: (_sid, channelId) => {
        fetchOrder.push(`tile:${channelId}`);
        return Promise.resolve(fakeTile([0n], [1]));
      },
      fetchHostChannel: (defName) => {
        fetchOrder.push(`host:${defName}`);
        return Promise.resolve(fakeHostChannel([9]));
      },
    };
    const actions: ChannelBindAction[] = [];
    const cellBinding = mixedBinding([
      { channelId: "fork_velocity", source: "session" },
      { channelId: "avg_speed", source: "definition" },
    ]);

    await runChannelBind(deps, cache, oneWindow(), "cell-a", cellBinding, 64, (a) => actions.push(a), neverStale);

    expect(fetchOrder).toEqual(["tile:fork_velocity", "host:avg_speed"]);
    const channelDataActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData");
    expect(channelDataActions.map((a) => a.channelId)).toEqual(["fork_velocity", "avg_speed"]);
    expect(actions.filter((a) => a.type === "chartWindow")).toHaveLength(1);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound.map((b) => b.source)).toEqual(["session", "definition"]);
  });

  it("runChannelBind — a fetchHostChannel rejection — drops only that channel, the rest still land", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.resolve(fakeTile([0n], [1])),
      fetchHostChannel: () => Promise.reject(new Error("host channel unavailable")),
    };
    const actions: ChannelBindAction[] = [];
    const cellBinding = mixedBinding([
      { channelId: "fork_velocity", source: "session" },
      { channelId: "avg_speed", source: "definition" },
    ]);

    await runChannelBind(deps, cache, oneWindow(), "cell-a", cellBinding, 64, (a) => actions.push(a), neverStale);

    const channelDataActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData");
    expect(channelDataActions.map((a) => a.channelId)).toEqual(["fork_velocity"]);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound.map((b) => b.name)).toEqual(["fork_velocity"]);
  });

  it("runChannelBind — isStale true after the host-channel await — drops every remaining dispatch, including boundChannels", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.resolve(fakeTile([0n], [1])),
      fetchHostChannel: () => Promise.resolve(fakeHostChannel([1])),
    };
    const actions: ChannelBindAction[] = [];
    let calls = 0;
    // Definition channel is second -- its own fetch is the second `await`
    // in the loop; going stale right after it must drop the dispatch for
    // this channel too, and the final `boundChannels`.
    const isStale = () => {
      calls += 1;
      return calls >= 2;
    };
    const cellBinding = mixedBinding([
      { channelId: "fork_velocity", source: "session" },
      { channelId: "avg_speed", source: "definition" },
    ]);

    await runChannelBind(deps, cache, oneWindow(), "cell-a", cellBinding, 64, (a) => actions.push(a), isStale);

    const channelDataActions = actions.filter((a) => a.type === "channelData");
    expect(channelDataActions.map((a) => (a as Extract<ChannelBindAction, { type: "channelData" }>).channelId)).toEqual(["fork_velocity"]);
    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(0);
  });

  it("runChannelBind — a definition result with hasT false — is dropped, not bound (Q3(a))", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.reject(new Error("no session channel in this fixture")),
      fetchHostChannel: () => Promise.resolve(fakeHostChannel([42], false)),
    };
    const actions: ChannelBindAction[] = [];
    const cellBinding = mixedBinding([{ channelId: "scalar_def", source: "definition" }]);

    await runChannelBind(deps, cache, oneWindow(), "cell-a", cellBinding, 64, (a) => actions.push(a), neverStale);

    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(0);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound).toEqual([]);
  });
});

describe("runChannelBind — multi-window (S1 Task 11b, ruling R131 Q2)", () => {
  it("two selected windows — fetches the channel once per window and combines them into one channelData action carrying both windows' descriptors", async () => {
    const cache = new TileCache();
    const fetchedSessions: string[] = [];
    // Each window's own tile carries columns at its *own* absolute start
    // (matching `windowsOf`'s spans, session-0 at 0, session-1 at
    // 10_000_000) -- the mapped fetch span for each window is re-based
    // onto that window's own start (R131 Q2), so a tile with columns
    // outside it would be filtered out by `tileToChannelData`.
    const deps: ChannelBindDeps = {
      fetchTile: (sessionId) => {
        fetchedSessions.push(sessionId);
        const base = sessionId === "session-0" ? 0n : 10_000_000n;
        return Promise.resolve(fakeTile([base, base + 1_000_000n], [1, 2]));
      },
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const windows = windowsOf(2);
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, windows, "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(fetchedSessions).toEqual(["session-0", "session-1"]);
    const channelData = actions.find((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData")!;
    expect(channelData.windows).toEqual([windows[0].descriptor, windows[1].descriptor]);
    // Two windows -- `combineChannelWindows`'s break-row rule (R127 item 4)
    // inserts one NaN row between them; not reimplemented here, just
    // trusted -- see this suite's `w`-index assertion below instead.
    const w = new Float64Array(channelData.w);
    expect(Array.from(w)).toContain(0);
    expect(Array.from(w)).toContain(1);
  });

  it("a window shorter than the mapped viewport — that window's data stops at its own end, not held flat to the viewport's edge (requirement 2)", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      // Every fetch resolves the same three-column tile spanning
      // [0, 20_000_000) -- the point is which columns `tileToChannelData`
      // keeps once the mapped `[startUs, endUs)` clamps to the short
      // window's own end, not what the fetch itself returns.
      fetchTile: () => Promise.resolve(fakeTile([0n, 5_000_000n, 15_000_000n], [1, 2, 3])),
      fetchHostChannel: neverFetchesHostChannel(),
    };
    // Window 0 (primary) is unbounded; window 1 ends at 8_000_000 -- shorter
    // than the 0..20_000_000 viewport below.
    const windows: BindWindow[] = [
      { sessionId: "session-0", span: { startUs: 0, endUs: Infinity }, descriptor: descriptor("session-0") },
      { sessionId: "session-1", span: { startUs: 0, endUs: 8_000_000 }, descriptor: descriptor("session-1") },
    ];
    const b = binding(["fork_velocity"]);
    b.initialSpan.endUs = 20_000_000;
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, windows, "cell-a", b, 64, (a) => actions.push(a), neverStale);

    const channelData = actions.find((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData")!;
    const t = new Float64Array(channelData.t);
    const w = new Float64Array(channelData.w);
    // Window 1's own samples (w === 1) are only the columns inside its own
    // [0, 8_000_000) span -- 0 and 5_000_000_000ns=5s, never the 15s column,
    // which is past its end and simply absent, not clamped to its last value.
    const window1Times = Array.from(t).filter((_, i) => w[i] === 1);
    expect(window1Times).toEqual([0, 5]);
  });

  it("one window's fetch rejects — the other window still renders (R121, requirement 4)", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      fetchTile: (sessionId) => {
        if (sessionId === "session-0") return Promise.reject(new Error("network down for session-0"));
        // session-1's own window starts at 10_000_000 (`windowsOf`'s
        // default spanUs) -- the column must fall inside its own mapped
        // fetch span, not window 0's.
        return Promise.resolve(fakeTile([10_000_000n], [1]));
      },
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const windows = windowsOf(2);
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, windows, "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    const channelData = actions.find((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData")!;
    expect(channelData).toBeDefined();
    const w = new Float64Array(channelData.w);
    // Only window 1 (index 0 in the combined result, since it's the only
    // series present -- see `combineChannelWindows`'s single-series shape)
    // -- window 0's failed fetch contributes nothing, and the chart isn't
    // blanked because of it.
    expect(Array.from(w).every((wi) => wi === 0)).toBe(true);
    expect(channelData.windows).toEqual([windows[1].descriptor]);
  });

  it("every window's fetch fails — the channel is dropped entirely, exactly as the single-window path drops a channel whose one fetch fails", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.reject(new Error("network down")),
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const windows = windowsOf(2);
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, windows, "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(0);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound).toEqual([]);
  });

  it("a single selected window — combineChannelWindows produces the byte-identical pre-multi-window shape (w all zeros, no break)", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n, 1_000_000n], [1, 2])), fetchHostChannel: neverFetchesHostChannel() };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, oneWindow(), "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    const channelData = actions.find((a): a is Extract<ChannelBindAction, { type: "channelData" }> => a.type === "channelData")!;
    const w = new Float64Array(channelData.w);
    expect(Array.from(w)).toEqual([0, 0]);
    expect(channelData.length).toBe(2);
  });
});

describe("runChannelSettle", () => {
  it("runChannelSettle — two-channel cell settles — exactly one fetch per channel and both registered together", async () => {
    const cache = new TileCache();
    const fetched: string[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: (_sid, channelId) => {
        fetched.push(channelId);
        return Promise.resolve(fakeTile([0n], [1]));
      },
      fetchHostChannel: neverFetchesHostChannel(),
    };
    const channels = binding(["fork_velocity", "rear_wheel_speed"]).channels;
    const actions: ChannelBindAction[] = [];

    await runChannelSettle(deps, cache, oneWindow(), "cell-a", channels, "fork_velocity", 0, 1_000_000, 64, (a) => actions.push(a), neverStale);

    expect(fetched).toEqual(["fork_velocity", "rear_wheel_speed"]);
    const boundActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "boundChannels" }> => a.type === "boundChannels");
    expect(boundActions).toHaveLength(1);
    expect(boundActions[0].bound.map((b) => b.name)).toEqual(["fork_velocity", "rear_wheel_speed"]);
    expect(actions.filter((a) => a.type === "chartWindow")).toHaveLength(1);
  });

  it("runChannelSettle — a settle superseded by a later one before the fetch resolves — drops the stale result entirely", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() };
    const channels = binding(["fork_velocity", "rear_wheel_speed"]).channels;
    const actions: ChannelBindAction[] = [];
    let calls = 0;
    const isStale = () => {
      calls += 1;
      return calls >= 1;
    };

    await runChannelSettle(deps, cache, oneWindow(), "cell-a", channels, "fork_velocity", 0, 1_000_000, 64, (a) => actions.push(a), isStale);

    expect(actions).toEqual([]);
  });

  it("runChannelSettle — a definition channel's budget unchanged from previousBound — issues no fetchHostChannel call, still registers the channel", async () => {
    const cache = new TileCache();
    let hostChannelCalls = 0;
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.resolve(fakeTile([0n], [1])),
      fetchHostChannel: () => {
        hostChannelCalls += 1;
        return Promise.resolve(fakeHostChannel([1]));
      },
    };
    const channels = mixedBinding([
      { channelId: "fork_velocity", source: "session" },
      { channelId: "avg_speed", source: "definition" },
    ]).channels;
    const previousBound: BoundChannel[] = [{ source: "definition", name: "avg_speed", budget: 64 }];
    const actions: ChannelBindAction[] = [];

    // pointBudget(32, false) = 64 (DESKTOP_POINTS_PER_PIXEL_COLUMN = 2),
    // matching `previousBound`'s recorded budget exactly.
    await runChannelSettle(deps, cache, oneWindow(), "cell-a", channels, "fork_velocity", 0, 1_000_000, 32, (a) => actions.push(a), neverStale, previousBound);

    expect(hostChannelCalls).toBe(0);
    const bound = (actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound;
    expect(bound.find((b) => b.source === "definition")).toEqual({ source: "definition", name: "avg_speed", budget: 64 });
  });

  it("runChannelSettle — a definition channel's budget changed from previousBound — refetches with the new budget", async () => {
    const cache = new TileCache();
    const hostChannelCalls: number[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.resolve(fakeTile([0n], [1])),
      fetchHostChannel: (_defName, budget) => {
        hostChannelCalls.push(budget);
        return Promise.resolve(fakeHostChannel([1]));
      },
    };
    const channels = mixedBinding([{ channelId: "avg_speed", source: "definition" }]).channels;
    const previousBound: BoundChannel[] = [{ source: "definition", name: "avg_speed", budget: 64 }];
    const actions: ChannelBindAction[] = [];

    await runChannelSettle(deps, cache, oneWindow(), "cell-a", channels, "avg_speed", 0, 1_000_000, 640, (a) => actions.push(a), neverStale, previousBound);

    expect(hostChannelCalls).toEqual([1280]);
  });

  it("runChannelSettle — the budget passed to fetchHostChannel is the clamped pointBudget of the given width", async () => {
    const cache = new TileCache();
    const hostChannelCalls: number[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: () => Promise.reject(new Error("no session channel in this fixture")),
      fetchHostChannel: (_defName, budget) => {
        hostChannelCalls.push(budget);
        return Promise.resolve(fakeHostChannel([1]));
      },
    };
    const channels = mixedBinding([{ channelId: "avg_speed", source: "definition" }]).channels;
    const actions: ChannelBindAction[] = [];

    await runChannelSettle(deps, cache, oneWindow(), "cell-a", channels, "avg_speed", 0, 1_000_000, 100, (a) => actions.push(a), neverStale);

    // pointBudget(100, false) = 200 (2 points/pixel column, DESKTOP_POINTS_PER_PIXEL_COLUMN).
    expect(hostChannelCalls).toEqual([200]);
  });
});

/** A promise plus its own `resolve`, for controlling exactly when a fake `fetchTile` settles -- lets a test order two runs' *resolutions* independently of the order they *started* in. */
function deferredTile(): { promise: Promise<DecodedTile>; resolve: (tile: DecodedTile) => void } {
  let resolve: (tile: DecodedTile) => void = () => {};
  const promise = new Promise<DecodedTile>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// review-task13c.md's Major: `runChannelBind` (an initial bind) and
// `runChannelSettle` (a gesture settle) for the *same* cell used to carry
// independent staleness guards (`boundIdentityRef` vs `settleSeqRef` in
// `index.tsx`) that never invalidated each other, so a slow initial fetch
// resolving after a faster settle would overwrite the settle's fresher
// result. These cases wire both drivers' `isStale` callbacks to one shared
// `CellRunSequencer` -- the fix -- and prove the outcome depends only on
// which run's `start()` was *last*, never on resolve order.
describe("cross-effect staleness via a shared CellRunSequencer (review-task13c.md Major)", () => {
  it("an initial bind starts, a settle for the same cell starts after it, and the initial bind resolves last — the initial bind dispatches nothing and the settle's result stands", async () => {
    // Two `TileCache` instances -- one per run -- so the cache's own
    // in-flight-fetch coalescing (`TileCache.getOrStartFetch`, an unrelated,
    // real behavior for same-key concurrent fetches) can't make the settle
    // await the still-pending initial fetch's promise; this test is only
    // about `CellRunSequencer`'s ordering, not the cache.
    const initialCache = new TileCache();
    const settleCache = new TileCache();
    const sequencer = new CellRunSequencer();
    const cellId = "cell-a";
    const actions: ChannelBindAction[] = [];

    const initialFetch = deferredTile();
    const initialSeq = sequencer.start(cellId);
    const initialRun = runChannelBind(
      { fetchTile: () => initialFetch.promise, fetchHostChannel: neverFetchesHostChannel() },
      initialCache,
      oneWindow(),
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, initialSeq)
    );

    const settleSeq = sequencer.start(cellId);
    const settleChannels = binding(["fork_velocity"]).channels;
    await runChannelSettle(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() },
      settleCache,
      oneWindow(),
      cellId,
      settleChannels,
      "fork_velocity",
      0,
      1_000_000,
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, settleSeq)
    );

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);

    initialFetch.resolve(fakeTile([0n], [1]));
    await initialRun;

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(1);
  });

  it("the same race, but the initial bind resolves before the settle — the settle still wins, because it started later, not because it resolved later", async () => {
    const cache = new TileCache();
    const sequencer = new CellRunSequencer();
    const cellId = "cell-a";
    const actions: ChannelBindAction[] = [];

    const initialSeq = sequencer.start(cellId);
    await runChannelBind(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() },
      cache,
      oneWindow(),
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, initialSeq)
    );

    const settleSeq = sequencer.start(cellId);
    const settleChannels = binding(["fork_velocity"]).channels;
    await runChannelSettle(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() },
      cache,
      oneWindow(),
      cellId,
      settleChannels,
      "fork_velocity",
      0,
      1_000_000,
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, settleSeq)
    );

    const boundActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "boundChannels" }> => a.type === "boundChannels");
    expect(boundActions).toHaveLength(2); // the initial bind's own dispatch, then the settle's
    expect(boundActions[boundActions.length - 1].bound.map((b) => b.name)).toEqual(["fork_velocity"]);
  });

  it("two settles for the same cell — only the later-started one dispatches, regardless of which resolves first", async () => {
    // Separate caches per run for the same reason as the race above: this
    // test is about `CellRunSequencer`'s ordering, not `TileCache`'s own
    // in-flight-fetch coalescing.
    const firstCache = new TileCache();
    const secondCache = new TileCache();
    const sequencer = new CellRunSequencer();
    const cellId = "cell-a";
    const channels = binding(["fork_velocity"]).channels;
    const actions: ChannelBindAction[] = [];

    const firstFetch = deferredTile();
    const firstSeq = sequencer.start(cellId);
    const firstRun = runChannelSettle(
      { fetchTile: () => firstFetch.promise, fetchHostChannel: neverFetchesHostChannel() },
      firstCache,
      oneWindow(),
      cellId,
      channels,
      "fork_velocity",
      0,
      1_000_000,
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, firstSeq)
    );

    const secondSeq = sequencer.start(cellId);
    await runChannelSettle(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() },
      secondCache,
      oneWindow(),
      cellId,
      channels,
      "fork_velocity",
      0,
      2_000_000,
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, secondSeq)
    );

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);

    firstFetch.resolve(fakeTile([0n], [1]));
    await firstRun;

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
  });

  it("a new binding identity supersedes an in-flight initial bind — the old run's sequence is stale by the time it resolves", async () => {
    const cache = new TileCache();
    const sequencer = new CellRunSequencer();
    const cellId = "cell-a";
    const actions: ChannelBindAction[] = [];

    const oldFetch = deferredTile();
    const oldSeq = sequencer.start(cellId);
    const oldRun = runChannelBind(
      { fetchTile: () => oldFetch.promise, fetchHostChannel: neverFetchesHostChannel() },
      cache,
      oneWindow(),
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, oldSeq)
    );

    const newSeq = sequencer.start(cellId);
    await runChannelBind(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])), fetchHostChannel: neverFetchesHostChannel() },
      cache,
      oneWindow(),
      cellId,
      binding(["rear_wheel_speed"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, newSeq)
    );

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
    expect((actions.find((a) => a.type === "boundChannels") as Extract<ChannelBindAction, { type: "boundChannels" }>).bound.map((b) => b.name)).toEqual([
      "rear_wheel_speed",
    ]);

    oldFetch.resolve(fakeTile([0n], [1]));
    await oldRun;

    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
  });
});
