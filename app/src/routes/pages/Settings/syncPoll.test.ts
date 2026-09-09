import { describe, expect, it, vi } from "vitest";

import type { PeerStatus, SyncStatus } from "../../../ipc/sync";
import {
  startPeerAppearedWatch,
  startSyncStatusPoll,
  SYNC_STATUS_POLL_INTERVAL_MS,
  type PeerAppearedWatchDeps,
  type SyncStatusPollDeps,
} from "./syncPoll";

const EMPTY_STATUS: SyncStatus = { paired_peers: [], last_sync_utc_ms: null, this_device: { peer_id: "self", name: "This machine" } };

function fakePeer(id: string): PeerStatus {
  return { peer_id: id, name: "Pit Tablet", online: true, protocol_version: 1, paired_at_ms: 1000 };
}

/** A fake `setTimeout`/`clearTimeout` pair the test drives by hand, plus a
 *  fake `isVisible`/`onVisibilityChange` pair — mirrors
 *  `Device/statusPoll.test.ts`'s `fakeScheduler`. */
function fakeScheduler() {
  let nextHandle = 1;
  const timers = new Map<number, () => void>();
  let visible = true;
  const visibilityHandlers = new Set<() => void>();

  const scheduling = {
    setTimeout: (fn: () => void, _ms: number) => {
      const handle = nextHandle++;
      timers.set(handle, fn);
      return handle;
    },
    clearTimeout: (handle: number) => {
      timers.delete(handle);
    },
    isVisible: () => visible,
    onVisibilityChange: (handler: () => void) => {
      visibilityHandlers.add(handler);
      return () => visibilityHandlers.delete(handler);
    },
  };

  return {
    scheduling,
    fireTimer(): void {
      expect(timers.size).toBe(1);
      const [[handle, fn]] = timers;
      timers.delete(handle);
      fn();
    },
    armedTimerCount: () => timers.size,
    setVisible(next: boolean): void {
      visible = next;
      for (const handler of visibilityHandlers) handler();
    },
    visibilitySubscriberCount: () => visibilityHandlers.size,
  };
}

describe("startSyncStatusPoll", () => {
  it("startSyncStatusPoll — start — issues one request immediately with no timer armed yet", () => {
    // Arrange
    const scheduler = fakeScheduler();
    const syncStatus = vi.fn(() => new Promise<SyncStatus>(() => {}));
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };
    const dispatch = vi.fn();

    // Act
    startSyncStatusPoll(deps, dispatch);

    // Assert
    expect(syncStatus).toHaveBeenCalledTimes(1);
    expect(scheduler.armedTimerCount()).toBe(0);
  });

  it("startSyncStatusPoll — a response settles — the next timer is armed for SYNC_STATUS_POLL_INTERVAL_MS", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    let resolveFirst: (s: SyncStatus) => void = () => {};
    const syncStatus = vi.fn(() => new Promise<SyncStatus>((resolve) => (resolveFirst = resolve)));
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };
    const dispatch = vi.fn();

    // Act
    startSyncStatusPoll(deps, dispatch);
    resolveFirst(EMPTY_STATUS);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(scheduler.armedTimerCount()).toBe(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "status", status: EMPTY_STATUS });
    expect(syncStatus).toHaveBeenCalledTimes(1);
  });

  it("startSyncStatusPoll — a rejection — dispatches statusError and the poll continues", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    const error = { kind: "sync", message: "no route" };
    const syncStatus = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(EMPTY_STATUS);
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };
    const dispatch = vi.fn();

    // Act
    startSyncStatusPoll(deps, dispatch);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "statusError", error });
    expect(scheduler.armedTimerCount()).toBe(1);

    scheduler.fireTimer();
    await Promise.resolve();
    await Promise.resolve();
    expect(syncStatus).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({ type: "status", status: EMPTY_STATUS });
  });

  it("startSyncStatusPoll — stop() while a request is in flight — the settling result is never dispatched", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    let resolveFirst: (s: SyncStatus) => void = () => {};
    const syncStatus = vi.fn(() => new Promise<SyncStatus>((resolve) => (resolveFirst = resolve)));
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };
    const dispatch = vi.fn();

    // Act
    const stop = startSyncStatusPoll(deps, dispatch);
    stop();
    resolveFirst(EMPTY_STATUS);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(dispatch).not.toHaveBeenCalled();
    expect(scheduler.armedTimerCount()).toBe(0);
  });

  it("startSyncStatusPoll — not visible (R95: Settings route hidden) — no request until visibility returns", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    scheduler.setVisible(false);
    const syncStatus = vi.fn().mockResolvedValue(EMPTY_STATUS);
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };
    const dispatch = vi.fn();

    // Act
    startSyncStatusPoll(deps, dispatch);

    // Assert
    expect(syncStatus).not.toHaveBeenCalled();
    expect(scheduler.visibilitySubscriberCount()).toBe(1);

    scheduler.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(syncStatus).toHaveBeenCalledTimes(1);
  });

  it("startSyncStatusPoll — stop() while waiting on visibility — the visibility subscription is dropped", () => {
    // Arrange
    const scheduler = fakeScheduler();
    scheduler.setVisible(false);
    const syncStatus = vi.fn();
    const deps: SyncStatusPollDeps = { syncStatus, ...scheduler.scheduling };

    // Act
    const stop = startSyncStatusPoll(deps, vi.fn());
    stop();

    // Assert
    expect(scheduler.visibilitySubscriberCount()).toBe(0);
  });

  it("SYNC_STATUS_POLL_INTERVAL_MS wiring — arms the settle-handler timer with the exported constant", async () => {
    // Arrange
    const setTimeoutSpy = vi.fn((_fn: () => void, _ms: number) => 1);
    const deps: SyncStatusPollDeps = {
      syncStatus: vi.fn().mockResolvedValue(EMPTY_STATUS),
      setTimeout: setTimeoutSpy as unknown as SyncStatusPollDeps["setTimeout"],
      clearTimeout: vi.fn(),
      isVisible: () => true,
      onVisibilityChange: () => () => {},
    };

    // Act
    startSyncStatusPoll(deps, vi.fn());
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), SYNC_STATUS_POLL_INTERVAL_MS);
  });
});

/** Fake `onPeerAppeared`/visibility pair for {@link startPeerAppearedWatch}. */
function fakeWatchScheduler() {
  let visible = true;
  const visibilityHandlers = new Set<() => void>();
  const unlistenFns: (() => void)[] = [];
  let subscriberCount = 0;
  let latestCallback: ((p: PeerStatus) => void) | null = null;

  const deps: PeerAppearedWatchDeps = {
    onPeerAppeared: vi.fn((onEvent: (p: PeerStatus) => void) => {
      subscriberCount++;
      latestCallback = onEvent;
      const unlisten = vi.fn(() => {
        subscriberCount--;
      });
      unlistenFns.push(unlisten);
      return Promise.resolve(unlisten);
    }),
    isVisible: () => visible,
    onVisibilityChange: (handler) => {
      visibilityHandlers.add(handler);
      return () => visibilityHandlers.delete(handler);
    },
  };

  return {
    deps,
    setVisible(next: boolean): void {
      visible = next;
      for (const handler of visibilityHandlers) handler();
    },
    subscriberCount: () => subscriberCount,
    visibilityHandlerCount: () => visibilityHandlers.size,
    fireEvent(peer: PeerStatus): void {
      latestCallback?.(peer);
    },
  };
}

describe("startPeerAppearedWatch", () => {
  it("startPeerAppearedWatch — start while visible — subscribes once", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const dispatch = vi.fn();

    // Act
    startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();

    // Assert
    expect(scheduler.deps.onPeerAppeared).toHaveBeenCalledTimes(1);
    expect(scheduler.subscriberCount()).toBe(1);
  });

  it("startPeerAppearedWatch — an event arrives — dispatched with its payload", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const dispatch = vi.fn();
    startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();

    // Act
    scheduler.fireEvent(fakePeer("a"));

    // Assert
    expect(dispatch).toHaveBeenCalledWith(fakePeer("a"));
  });

  it("startPeerAppearedWatch — start while hidden — no subscription until visible", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    scheduler.setVisible(false);
    const dispatch = vi.fn();

    // Act
    startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();

    // Assert
    expect(scheduler.deps.onPeerAppeared).not.toHaveBeenCalled();

    scheduler.setVisible(true);
    await Promise.resolve();
    expect(scheduler.deps.onPeerAppeared).toHaveBeenCalledTimes(1);
  });

  it("startPeerAppearedWatch — visible then hidden — the subscription is torn down (R95 item 2)", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const dispatch = vi.fn();
    startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();
    expect(scheduler.subscriberCount()).toBe(1);

    // Act
    scheduler.setVisible(false);

    // Assert
    expect(scheduler.subscriberCount()).toBe(0);
  });

  it("startPeerAppearedWatch — hidden then visible again — re-subscribes (R95 're-primed on show')", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const dispatch = vi.fn();
    startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();
    scheduler.setVisible(false);
    expect(scheduler.subscriberCount()).toBe(0);

    // Act
    scheduler.setVisible(true);
    await Promise.resolve();

    // Assert
    expect(scheduler.deps.onPeerAppeared).toHaveBeenCalledTimes(2);
    expect(scheduler.subscriberCount()).toBe(1);
  });

  it("startPeerAppearedWatch — stop() while the async subscribe call is in flight — the late unlisten runs, nothing dispatched after", async () => {
    // Arrange
    let resolveSubscribe: (unlisten: () => void) => void = () => {};
    const lateUnlisten = vi.fn();
    const deps: PeerAppearedWatchDeps = {
      onPeerAppeared: vi.fn(() => new Promise<() => void>((resolve) => (resolveSubscribe = () => resolve(lateUnlisten)))),
      isVisible: () => true,
      onVisibilityChange: () => () => {},
    };
    const dispatch = vi.fn();

    // Act
    const stop = startPeerAppearedWatch(deps, dispatch);
    stop();
    resolveSubscribe(lateUnlisten);
    await Promise.resolve();

    // Assert
    expect(lateUnlisten).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("startPeerAppearedWatch — stop() — drops the visibility subscription and any live listener", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const dispatch = vi.fn();
    const stop = startPeerAppearedWatch(scheduler.deps, dispatch);
    await Promise.resolve();

    // Act
    stop();

    // Assert
    expect(scheduler.subscriberCount()).toBe(0);
    expect(scheduler.visibilityHandlerCount()).toBe(0);
  });

  it("startPeerAppearedWatch — stop() called twice — is safe and idempotent", async () => {
    // Arrange
    const scheduler = fakeWatchScheduler();
    const stop = startPeerAppearedWatch(scheduler.deps, vi.fn());
    await Promise.resolve();

    // Act / Assert
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
  });
});
