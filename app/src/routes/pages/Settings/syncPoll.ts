import type { PeerStatus, SyncStatus } from "../../../ipc/sync";

/** Injected IO/scheduler for {@link startSyncStatusPoll} — wave-2 operating
 *  brief §4's effects rule: the poll's decision logic is a pure driver,
 *  mirroring `Device/statusPoll.ts`'s `startStatusPoll` shape, so every
 *  side-effecting call is a parameter rather than a global and tests drive
 *  time and visibility by hand. */
export interface SyncStatusPollDeps {
  /** One read of `sync_status` (`app/src/ipc/sync.ts`). */
  syncStatus: () => Promise<SyncStatus>;
  /** Injected clock/scheduler so tests drive time, never a real timer. */
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
  /** True when the Sync section is on screen — window visible AND the
   *  Settings route active (R95's route-visibility context,
   *  `shell/routeVisibility.tsx`'s `composeVisibility`). */
  isVisible: () => boolean;
  /** Subscribes to a visibility change (either direction); returns an
   *  unsubscribe function. The real implementation is
   *  `subscribeRouteVisible("settings", handler)`. */
  onVisibilityChange: (handler: () => void) => () => void;
}

/** One outcome {@link startSyncStatusPoll} dispatches per tick. */
export type SyncStatusPollAction =
  | { type: "status"; status: SyncStatus }
  | { type: "statusError"; error: unknown };

/** How often the section polls `sync_status` while mounted and visible, in
 *  milliseconds. Not fixed by any contract (C3 §4 only requires "a periodic
 *  poll, never per-frame") — 5 s balances a paired peer's online flag going
 *  stale against calling the backend needlessly often (same value the
 *  landed stub used before this task). */
export const SYNC_STATUS_POLL_INTERVAL_MS = 5000;

/**
 * Starts polling `sync_status` every {@link SYNC_STATUS_POLL_INTERVAL_MS}
 * through `deps.syncStatus`, dispatching a {@link SyncStatusPollAction} per
 * settled request, until the returned `stop` function is called. Mirrors
 * `Device/statusPoll.ts`'s `startStatusPoll` rules:
 *
 * - **Never two requests in flight.** The next timer is armed only in the
 *   settle handler of the previous request (resolve *and* reject).
 * - **A rejection does not stop the poll** — it dispatches `statusError`
 *   and polling continues.
 * - **While not visible** (`deps.isVisible()` false — R95: the Settings
 *   route is hidden or the window itself is), no request is issued; the
 *   driver waits on `deps.onVisibilityChange` and resumes the instant
 *   visibility returns.
 * - **After `stop()`, nothing is dispatched**, including from a request
 *   already in flight — a monotonic generation counter is checked in every
 *   settle handler, so no promise is cancelled and no cleanup race can
 *   double-dispatch.
 * - `stop()` is idempotent and clears any armed timer and visibility
 *   subscription.
 */
export function startSyncStatusPoll(
  deps: SyncStatusPollDeps,
  dispatch: (a: SyncStatusPollAction) => void,
): () => void {
  let generation = 0;
  let timerHandle: number | null = null;
  let unsubscribeVisibility: (() => void) | null = null;

  function clearArmedTimer(): void {
    if (timerHandle !== null) {
      deps.clearTimeout(timerHandle);
      timerHandle = null;
    }
  }

  function clearVisibilitySubscription(): void {
    if (unsubscribeVisibility !== null) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  }

  function waitForVisible(gen: number): void {
    clearVisibilitySubscription();
    unsubscribeVisibility = deps.onVisibilityChange(() => {
      if (gen !== generation) return; // stopped since this subscription was armed
      clearVisibilitySubscription();
      tick(gen);
    });
  }

  function tick(gen: number): void {
    if (gen !== generation) return; // stopped or superseded

    if (!deps.isVisible()) {
      waitForVisible(gen);
      return;
    }

    deps.syncStatus().then(
      (status) => {
        if (gen !== generation) return;
        dispatch({ type: "status", status });
        timerHandle = deps.setTimeout(() => tick(gen), SYNC_STATUS_POLL_INTERVAL_MS);
      },
      (error: unknown) => {
        if (gen !== generation) return;
        dispatch({ type: "statusError", error });
        timerHandle = deps.setTimeout(() => tick(gen), SYNC_STATUS_POLL_INTERVAL_MS);
      },
    );
  }

  tick(generation);

  return function stop(): void {
    generation++;
    clearArmedTimer();
    clearVisibilitySubscription();
  };
}

/** Injected IO for {@link startPeerAppearedWatch}. */
export interface PeerAppearedWatchDeps {
  /** Subscribes to the `peer_appeared` app event (`app/src/ipc/sync.ts`'s
   *  `onPeerAppeared`); resolves with an unlisten function. */
  onPeerAppeared: (onEvent: (p: PeerStatus) => void) => Promise<() => void>;
  /** Same composed visibility signal as {@link SyncStatusPollDeps.isVisible}. */
  isVisible: () => boolean;
  /** Same subscription as {@link SyncStatusPollDeps.onVisibilityChange}. */
  onVisibilityChange: (handler: () => void) => () => void;
}

/**
 * Subscribes to `peer_appeared` while (and only while) `deps.isVisible()` is
 * true, dispatching each event's `PeerStatus` payload — R95 item 2's rule
 * applied to this event stream: a hidden Settings route holds no live
 * subscription (an OS-level mDNS/event-channel resource nobody can see),
 * and a later show re-subscribes fresh (R95's "re-primed on show").
 *
 * Reruns its visible/hidden check on every `onVisibilityChange` notification
 * (fired for either direction) rather than assuming which direction fired:
 * visible-and-not-yet-listening subscribes, hidden-and-listening
 * unsubscribes, every other combination is a no-op. A monotonic generation
 * counter guards the async `listen()` call settling after `stop()` was
 * already called, mirroring {@link startSyncStatusPoll}.
 *
 * @returns `stop`, idempotent, tearing down any live subscription and the
 *  visibility listener.
 */
export function startPeerAppearedWatch(
  deps: PeerAppearedWatchDeps,
  dispatch: (peer: PeerStatus) => void,
): () => void {
  let generation = 0;
  let unlisten: (() => void) | null = null;
  let unsubscribeVisibility: (() => void) | null = null;

  function stopListening(): void {
    if (unlisten !== null) {
      unlisten();
      unlisten = null;
    }
  }

  function sync(gen: number): void {
    if (gen !== generation) return;

    if (!deps.isVisible()) {
      stopListening();
      return;
    }

    if (unlisten !== null) return; // already listening

    deps.onPeerAppeared((peer) => {
      if (gen !== generation) return;
      dispatch(peer);
    }).then((stop) => {
      if (gen !== generation) {
        stop(); // stop() ran while the async `listen()` call was in flight
        return;
      }
      unlisten = stop;
    });
  }

  unsubscribeVisibility = deps.onVisibilityChange(() => sync(generation));
  sync(generation);

  return function stop(): void {
    generation++;
    stopListening();
    if (unsubscribeVisibility !== null) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  };
}
