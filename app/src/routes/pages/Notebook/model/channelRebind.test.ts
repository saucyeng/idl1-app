import { describe, expect, it } from "vitest";

import type { DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import { rebindChannelsAfterRebuild, type BoundChannel, type HostChannelRebindDeps } from "./channelRebind";
import { TileCache, type TileCacheKey } from "./tileCache";
import type { ChannelData } from "./channelData";

/** Builds a small fake `DecodedTile` from parallel arrays, matching the
 *  fixture style used by `channelData.test.ts`/`hover.test.ts`. */
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

function key(overrides: Partial<Omit<TileCacheKey, "tileIndex">> = {}): Omit<TileCacheKey, "tileIndex"> {
  return {
    sessionId: "session-a",
    channelId: "front-fork",
    tier: 0,
    columnCount: 256,
    ...overrides,
  };
}

/** A `HostChannelRebindDeps` whose `fetchHostChannel` fails every call — the default for a test that never expects a `"definition"` channel to be re-fetched. */
function neverFetchesHostChannel(): HostChannelRebindDeps {
  return {
    fetchHostChannel: () => Promise.reject(new Error("fetchHostChannel not expected in this test")),
  };
}

describe("rebindChannelsAfterRebuild", () => {
  it("rebindChannelsAfterRebuild — every bound channel with fully cached tiles — is re-sent exactly once", () => {
    const cache = new TileCache(1_000_000);
    const k = key();
    cache.put({ ...k, tileIndex: 0 }, fakeTile([0n, 1_000_000n], [1, 2], 0));
    const bound: BoundChannel[] = [
      { source: "session", name: "fork_velocity", key: k, range: { first: 0, last: 0 }, startUs: 0, endUs: 2_000_000, budget: 100 },
    ];
    const sent: Array<{ name: string; data: ChannelData }> = [];

    rebindChannelsAfterRebuild(bound, cache, neverFetchesHostChannel(), (name, data) => sent.push({ name, data }));

    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe("fork_velocity");
    expect(Array.from(sent[0].data.v)).toEqual([1, 2]);
  });

  it("rebindChannelsAfterRebuild — two bound channels — each is sent exactly once, not duplicated or merged", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    const wheelKey = key({ channelId: "rear-wheel-speed" });
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    cache.put({ ...wheelKey, tileIndex: 0 }, fakeTile([0n], [5], 0));
    const bound: BoundChannel[] = [
      { source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 },
      { source: "session", name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 },
    ];
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, neverFetchesHostChannel(), (name) => sent.push(name));

    expect(sent).toEqual(["fork", "wheel"]);
  });

  it("rebindChannelsAfterRebuild — a bound channel missing a tile from the cache — is skipped, not sent with holes", () => {
    const cache = new TileCache(1_000_000);
    const k = key();
    // Only tileIndex 0 is cached; the channel's range also needs tileIndex 1.
    cache.put({ ...k, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const bound: BoundChannel[] = [
      { source: "session", name: "fork_velocity", key: k, range: { first: 0, last: 1 }, startUs: 0, endUs: 2_000_000, budget: 100 },
    ];
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, neverFetchesHostChannel(), (name) => sent.push(name));

    expect(sent).toEqual([]);
  });

  it("rebindChannelsAfterRebuild — a definition channel — is re-fetched (never read from the tile cache) and sent once resolved", async () => {
    const cache = new TileCache(1_000_000);
    const bound: BoundChannel[] = [{ source: "definition", name: "avg_speed", budget: 640 }];
    const fetchCalls: Array<{ defName: string; budget: number }> = [];
    const deps: HostChannelRebindDeps = {
      fetchHostChannel: (defName, budget) => {
        fetchCalls.push({ defName, budget });
        return Promise.resolve<DecodedHostChannel>({ hasT: true, t: new Float64Array([0, 1]), v: new Float64Array([10, 20]) });
      },
    };
    const sent: Array<{ name: string; data: ChannelData }> = [];

    rebindChannelsAfterRebuild(bound, cache, deps, (name, data) => sent.push({ name, data }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchCalls).toEqual([{ defName: "avg_speed", budget: 640 }]);
    expect(sent).toEqual([{ name: "avg_speed", data: { length: 2, t: new Float64Array([0, 1]), v: new Float64Array([10, 20]) } }]);
  });

  it("rebindChannelsAfterRebuild — a definition channel whose re-fetch has lost its recorded axis — is dropped, not sent", async () => {
    const cache = new TileCache(1_000_000);
    const bound: BoundChannel[] = [{ source: "definition", name: "avg_speed", budget: 640 }];
    const deps: HostChannelRebindDeps = {
      fetchHostChannel: () => Promise.resolve<DecodedHostChannel>({ hasT: false, t: new Float64Array(0), v: new Float64Array([42]) }),
    };
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, deps, (name) => sent.push(name));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual([]);
  });

  it("rebindChannelsAfterRebuild — a definition channel's re-fetch rejects — is dropped silently, other channels still land", async () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key();
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const bound: BoundChannel[] = [
      { source: "definition", name: "avg_speed", budget: 640 },
      { source: "session", name: "fork_velocity", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 },
    ];
    const deps: HostChannelRebindDeps = {
      fetchHostChannel: () => Promise.reject(new Error("host channel unavailable")),
    };
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, deps, (name) => sent.push(name));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual(["fork_velocity"]);
  });
});
