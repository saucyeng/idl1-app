import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { TileCache, type TileCacheKey } from "../model/tileCache";
import type { BoundChannel, HostChannelRebindDeps } from "../model/channelRebind";
import { NotebookSession, type ChannelRebindSandbox } from "./NotebookSession";
import type { WindowDescriptor } from "./protocol";

/** A single-window `WindowDescriptor` -- every channel `NotebookSession`'s
 *  tests bind here was bound while exactly one window was selected (ruling
 *  R131: the channel-bind effects gate on `windows.length <= 1`), matching
 *  {@link makeChannelsInvalidatedHandler}'s own "one window, `w` all
 *  zeros" contract. */
const singleWindow: WindowDescriptor = { sessionId: "session-a", span: { kind: "session" }, colour: "--chart-1", label: "Session A" };

/** A `HostChannelRebindDeps` whose `fetchHostChannel` fails every call — every case in this file binds only `"session"` channels, none of which reach it. */
function neverFetchesHostChannel(): HostChannelRebindDeps {
  return {
    fetchHostChannel: () => Promise.reject(new Error("fetchHostChannel not expected in this test")),
  };
}

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
function fakeSandbox(): ChannelRebindSandbox & { calls: Array<{ name: string; length: number; windows: WindowDescriptor[] }> } {
  const calls: Array<{ name: string; length: number; windows: WindowDescriptor[] }> = [];
  return {
    calls,
    setChannelHostVar(name, length, _t, _v, _w, windows) {
      calls.push({ name, length, windows });
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
    const forkBound: BoundChannel = { source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 2_000_000, budget: 100 };
    const wheelBound: BoundChannel = { source: "session", name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 };
    session.setBoundChannels("cell-a", [forkBound]);
    session.setBoundChannels("cell-b", [wheelBound]);
    const sandbox = fakeSandbox();
    const bytesBefore = cache.bytesUsed();

    const onChannelsInvalidated = session.onChannelsInvalidated(sandbox, neverFetchesHostChannel(), () => singleWindow);
    onChannelsInvalidated();

    expect(sandbox.calls).toEqual([
      { name: "fork", length: 2, windows: [singleWindow] },
      { name: "wheel", length: 1, windows: [singleWindow] },
    ]);
    expect(cache.bytesUsed()).toBe(bytesBefore);
  });

  it("NotebookSession — onChannelsInvalidated with no window selected right now — sends nothing rather than guessing a label", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const session = new NotebookSession(cache);
    session.setBoundChannels("cell-a", [{ source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 }]);
    const sandbox = fakeSandbox();

    const onChannelsInvalidated = session.onChannelsInvalidated(sandbox, neverFetchesHostChannel(), () => null);
    onChannelsInvalidated();

    expect(sandbox.calls).toEqual([]);
  });

  it("NotebookSession — removeBoundChannel — drops that cell from the next rebind", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key();
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const session = new NotebookSession(cache);
    session.setBoundChannels("cell-a", [{ source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 }]);

    session.removeBoundChannel("cell-a");

    expect(session.allBoundChannels()).toEqual([]);
  });

  it("NotebookSession — setBoundChannels with two channels for one cell — both returned in order, a re-register replaces the whole list", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    const wheelKey = key({ channelId: "rear-wheel-speed" });
    const session = new NotebookSession(cache);
    const forkBound: BoundChannel = { source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 };
    const wheelBound: BoundChannel = { source: "session", name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100 };

    session.setBoundChannels("cell-a", [forkBound, wheelBound]);

    expect(session.allBoundChannels()).toEqual([forkBound, wheelBound]);

    const rewheelBound: BoundChannel = { ...wheelBound, startUs: 500_000 };
    session.setBoundChannels("cell-a", [rewheelBound]);

    expect(session.allBoundChannels()).toEqual([rewheelBound]);
  });
});
