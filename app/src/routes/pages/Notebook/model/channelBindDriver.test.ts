import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { CellRunSequencer } from "./cellRunSequencer";
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
      { fetchTile: () => initialFetch.promise },
      initialCache,
      "session-a",
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, initialSeq)
    );

    const settleSeq = sequencer.start(cellId);
    const settleChannels = binding(["fork_velocity"]).channels;
    await runChannelSettle(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) },
      settleCache,
      "session-a",
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
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) },
      cache,
      "session-a",
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, initialSeq)
    );

    const settleSeq = sequencer.start(cellId);
    const settleChannels = binding(["fork_velocity"]).channels;
    await runChannelSettle(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) },
      cache,
      "session-a",
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
      { fetchTile: () => firstFetch.promise },
      firstCache,
      "session-a",
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
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) },
      secondCache,
      "session-a",
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
      { fetchTile: () => oldFetch.promise },
      cache,
      "session-a",
      cellId,
      binding(["fork_velocity"]),
      64,
      (a) => actions.push(a),
      () => !sequencer.isCurrent(cellId, oldSeq)
    );

    const newSeq = sequencer.start(cellId);
    await runChannelBind(
      { fetchTile: () => Promise.resolve(fakeTile([0n], [1])) },
      cache,
      "session-a",
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
