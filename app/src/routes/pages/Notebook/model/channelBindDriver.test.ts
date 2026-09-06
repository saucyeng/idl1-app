import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { runChannelBind, runChannelSettle, type ChannelBindAction, type ChannelBindDeps } from "./channelBindDriver";
import type { JsCellBinding } from "./jsCellBinding";
import { TileCache } from "./tileCache";

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

/** A binding covering `channelIds`, each with a distinct sample rate small enough that a 2 s window resolves to exactly one tile (`tileIndex` 0) at whatever tier `chooseTier` picks -- keeps every test's fixture to one `fetchTile` call per channel. */
function binding(channelIds: string[]): JsCellBinding {
  return {
    props: { marks: [] } as unknown as JsCellBinding["props"],
    channels: channelIds.map((channelId, i) => ({ channelId, sampleRateHz: 50 + i * 25, lap: null })),
    initialSpan: { startUs: 0, endUs: 2_000_000 },
  };
}

function neverStale(): boolean {
  return false;
}

describe("runChannelBind", () => {
  it("runChannelBind — two-channel binding — dispatches channelData for both, in order, mounts only the first, and registers both bound channels in order", async () => {
    const cache = new TileCache();
    const fetched: string[] = [];
    const deps: ChannelBindDeps = {
      fetchTile: (_sid, channelId) => {
        fetched.push(channelId);
        return Promise.resolve(fakeTile([0n, 1_000_000n], [1, 2]));
      },
    };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, "session-a", "cell-a", binding(["fork_velocity", "rear_wheel_speed"]), 64, (a) => actions.push(a), neverStale);

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
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, "session-a", "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(actions.filter((a) => a.type === "channelData")).toHaveLength(1);
    expect(actions.filter((a) => a.type === "boundChannels")).toHaveLength(1);
  });

  it("runChannelBind — isStale becomes true after the first channel's fetch resolves — drops every dispatch, including for channels not yet fetched", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) };
    const actions: ChannelBindAction[] = [];
    let calls = 0;
    const isStale = () => {
      calls += 1;
      return calls >= 1;
    };

    await runChannelBind(deps, cache, "session-a", "cell-a", binding(["fork_velocity", "rear_wheel_speed"]), 64, (a) => actions.push(a), isStale);

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
    };
    const actions: ChannelBindAction[] = [];

    await runChannelBind(deps, cache, "session-a", "cell-a", binding(["fork_velocity"]), 64, (a) => actions.push(a), neverStale);

    expect(fetchCalls).toBe(1);
    expect(actions).toHaveLength(3); // channelData + boundChannels + chartWindow
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
    };
    const channels = binding(["fork_velocity", "rear_wheel_speed"]).channels;
    const actions: ChannelBindAction[] = [];

    await runChannelSettle(deps, cache, "session-a", "cell-a", channels, "fork_velocity", 0, 1_000_000, 64, (a) => actions.push(a), neverStale);

    expect(fetched).toEqual(["fork_velocity", "rear_wheel_speed"]);
    const boundActions = actions.filter((a): a is Extract<ChannelBindAction, { type: "boundChannels" }> => a.type === "boundChannels");
    expect(boundActions).toHaveLength(1);
    expect(boundActions[0].bound.map((b) => b.name)).toEqual(["fork_velocity", "rear_wheel_speed"]);
    expect(actions.filter((a) => a.type === "chartWindow")).toHaveLength(1);
  });

  it("runChannelSettle — a settle superseded by a later one before the fetch resolves — drops the stale result entirely", async () => {
    const cache = new TileCache();
    const deps: ChannelBindDeps = { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) };
    const channels = binding(["fork_velocity", "rear_wheel_speed"]).channels;
    const actions: ChannelBindAction[] = [];
    let calls = 0;
    const isStale = () => {
      calls += 1;
      return calls >= 1;
    };

    await runChannelSettle(deps, cache, "session-a", "cell-a", channels, "fork_velocity", 0, 1_000_000, 64, (a) => actions.push(a), isStale);

    expect(actions).toEqual([]);
  });
});
