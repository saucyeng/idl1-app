import { describe, expect, it } from "vitest";

import { AxisKind, type AxisKindValue } from "../../../../ipc/hostChannel";
import type { DecodedTile } from "../../../../ipc/tiles";
import { TileCache, type TileCacheKey } from "../model/tileCache";
import type { BoundChannel, HostChannelRebindDeps } from "../model/channelRebind";
import type { UnitLabel } from "../../../../ipc/workbook";
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
function fakeSandbox(): ChannelRebindSandbox & {
  calls: Array<{ name: string; length: number; windows: WindowDescriptor[]; unit: UnitLabel; axisKind: AxisKindValue | undefined; t: Float64Array }>;
} {
  const calls: Array<{ name: string; length: number; windows: WindowDescriptor[]; unit: UnitLabel; axisKind: AxisKindValue | undefined; t: Float64Array }> = [];
  return {
    calls,
    setChannelHostVar(name, length, t, _v, _tr, _w, windows, unit, axisKind) {
      calls.push({ name, length, windows, unit, axisKind, t: new Float64Array(t) });
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
    const forkBound: BoundChannel = { source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 2_000_000, budget: 100, unit: { state: "known", text: "mm" } };
    const wheelBound: BoundChannel = { source: "session", name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100, unit: { state: "known", text: "km/h" } };
    session.setBoundChannels("cell-a", [forkBound]);
    session.setBoundChannels("cell-b", [wheelBound]);
    const sandbox = fakeSandbox();
    const bytesBefore = cache.bytesUsed();

    const onChannelsInvalidated = session.onChannelsInvalidated(sandbox, neverFetchesHostChannel(), () => singleWindow);
    onChannelsInvalidated();

    expect(sandbox.calls.map(({ name, length, windows, unit, axisKind }) => ({ name, length, windows, unit, axisKind }))).toEqual([
      { name: "fork", length: 2, windows: [singleWindow], unit: { state: "known", text: "mm" }, axisKind: AxisKind.Time },
      { name: "wheel", length: 1, windows: [singleWindow], unit: { state: "known", text: "km/h" }, axisKind: AxisKind.Time },
    ]);
    expect(cache.bytesUsed()).toBe(bytesBefore);
  });

  it("NotebookSession — onChannelsInvalidated with no window selected right now — sends nothing rather than guessing a label", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    cache.put({ ...forkKey, tileIndex: 0 }, fakeTile([0n], [1], 0));
    const session = new NotebookSession(cache);
    session.setBoundChannels("cell-a", [{ source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100, unit: { state: "known", text: "mm" } }]);
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
    session.setBoundChannels("cell-a", [{ source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100, unit: { state: "known", text: "mm" } }]);

    session.removeBoundChannel("cell-a");

    expect(session.allBoundChannels()).toEqual([]);
  });

  it("NotebookSession — setBoundChannels with two channels for one cell — both returned in order, a re-register replaces the whole list", () => {
    const cache = new TileCache(1_000_000);
    const forkKey = key({ channelId: "front-fork" });
    const wheelKey = key({ channelId: "rear-wheel-speed" });
    const session = new NotebookSession(cache);
    const forkBound: BoundChannel = { source: "session", name: "fork", key: forkKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100, unit: { state: "known", text: "mm" } };
    const wheelBound: BoundChannel = { source: "session", name: "wheel", key: wheelKey, range: { first: 0, last: 0 }, startUs: 0, endUs: 1_000_000, budget: 100, unit: { state: "known", text: "km/h" } };

    session.setBoundChannels("cell-a", [forkBound, wheelBound]);

    expect(session.allBoundChannels()).toEqual([forkBound, wheelBound]);

    const rewheelBound: BoundChannel = { ...wheelBound, startUs: 500_000 };
    session.setBoundChannels("cell-a", [rewheelBound]);

    expect(session.allBoundChannels()).toEqual([rewheelBound]);
  });
  it("NotebookSession — onChannelsInvalidated with a [lap] definition bound — republishes it as a lap axis, lap numbers intact", async () => {
    const cache = new TileCache(1_000_000);
    const session = new NotebookSession(cache);
    session.setBoundChannels("cell-a", [{ source: "definition", name: "lap_time_s", budget: 256, unit: { state: "known", text: "s" } }]);
    const sandbox = fakeSandbox();
    const deps: HostChannelRebindDeps = {
      fetchHostChannel: () =>
        Promise.resolve({ hasT: true, axisKind: AxisKind.Lap, t: new Float64Array([1, 2, 3]), v: new Float64Array([92.4, 91.8, 93.1]) }),
    };

    session.onChannelsInvalidated(sandbox, deps, () => singleWindow)();
    await Promise.resolve();

    expect(sandbox.calls).toHaveLength(1);
    expect(sandbox.calls[0].axisKind).toBe(AxisKind.Lap);
    expect(Array.from(sandbox.calls[0].t)).toEqual([1, 2, 3]);
  });

  it("NotebookSession — onChannelsInvalidated with a [t] definition bound — republishes it as a time axis", async () => {
    const cache = new TileCache(1_000_000);
    const session = new NotebookSession(cache);
    session.setBoundChannels("cell-a", [{ source: "definition", name: "fork_smooth", budget: 256, unit: { state: "known", text: "mm" } }]);
    const sandbox = fakeSandbox();
    const deps: HostChannelRebindDeps = {
      fetchHostChannel: () =>
        Promise.resolve({ hasT: true, axisKind: AxisKind.Time, t: new Float64Array([0, 0.5]), v: new Float64Array([10, 11]) }),
    };

    session.onChannelsInvalidated(sandbox, deps, () => singleWindow)();
    await Promise.resolve();

    expect(sandbox.calls[0].axisKind).toBe(AxisKind.Time);
  });
});
