import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { rebindChannelsAfterRebuild, type BoundChannel } from "./channelRebind";
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

describe("rebindChannelsAfterRebuild", () => {
  it("rebindChannelsAfterRebuild — every bound channel with fully cached tiles — is re-sent exactly once", () => {
    const cache = new TileCache(1_000_000);
    const k = key();
    cache.put({ ...k, tileIndex: 0 }, fakeTile([0n, 1_000_000n], [1, 2], 0));
    const bound: BoundChannel[] = [
      { name: "fork_velocity", key: k, range: { first: 0, last: 0 }, startUs: 0, endUs: 2_000_000, budget: 100 },
    ];
    const sent: Array<{ name: string; data: ChannelData }> = [];

    rebindChannelsAfterRebuild(bound, cache, (name, data) => sent.push({ name, data }));

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
      { name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 },
      { name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 },
    ];
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, (name) => sent.push(name));

    expect(sent).toEqual(["fork", "wheel"]);
  });

  it("rebindChannelsAfterRebuild — a bound channel missing a tile from the cache — is skipped, not sent with holes", () => {
    const cache = new TileCache(1_000_000);
    const k = key();
    // Only tileIndex 0 is cached; the channel's range also needs tileIndex 1.
    cache.put({ ...k, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const bound: BoundChannel[] = [
      { name: "fork_velocity", key: k, range: { first: 0, last: 1 }, startUs: 0, endUs: 2_000_000, budget: 100 },
    ];
    const sent: string[] = [];

    rebindChannelsAfterRebuild(bound, cache, (name) => sent.push(name));

    expect(sent).toEqual([]);
  });
});
