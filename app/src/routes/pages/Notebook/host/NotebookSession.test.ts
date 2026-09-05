import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { TileCache, type TileCacheKey } from "../model/tileCache";
import type { BoundChannel } from "../model/channelRebind";
import { NotebookSession, type ChannelRebindSandbox } from "./NotebookSession";

/** Builds a small fake `DecodedTile` from parallel arrays, matching the fixture style in `model/channelRebind.test.ts`. */
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
  return { sessionId: "session-a", channelId: "front-fork", tier: 0, columnCount: 256, ...overrides };
}

/** Records every `setChannelHostVar` call and fails the test if any other method is reached for. */
function fakeSandbox(): ChannelRebindSandbox & { calls: Array<{ name: string; length: number }> } {
  const calls: Array<{ name: string; length: number }> = [];
  return {
    calls,
    setChannelHostVar(name, length) {
      calls.push({ name, length });
    },
  };
}

describe("NotebookSession", () => {
  it("NotebookSession — onChannelsInvalidated after a rebuild — re-sends every bound channel exactly once and fetches nothing", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    const wheelKey = key({ channelId: "rear-wheel-speed" });
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n, 1_000_000n], [1, 2], 0));
    cache.put({ ...wheelKey, tileIndex: 0 }, fakeTile([0n], [5], 0));
    const session = new NotebookSession(cache);
    const forkBound: BoundChannel = { name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 2_000_000, budget: 100 };
    const wheelBound: BoundChannel = { name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 };
    session.setBoundChannel("cell-a", forkBound);
    session.setBoundChannel("cell-b", wheelBound);
    const sandbox = fakeSandbox();
    const bytesBefore = cache.bytesUsed();

    const onChannelsInvalidated = session.onChannelsInvalidated(sandbox);
    onChannelsInvalidated();

    expect(sandbox.calls).toEqual([
      { name: "fork", length: 2 },
      { name: "wheel", length: 1 },
    ]);
    expect(cache.bytesUsed()).toBe(bytesBefore);
  });

  it("NotebookSession — removeBoundChannel — drops that cell from the next rebind", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key();
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const session = new NotebookSession(cache);
    session.setBoundChannel("cell-a", { name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 });

    session.removeBoundChannel("cell-a");

    expect(session.allBoundChannels()).toEqual([]);
  });
});
