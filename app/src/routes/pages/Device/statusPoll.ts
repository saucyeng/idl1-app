import type { DeviceStatus } from "../../../ipc/device";
import type { DeviceIpcError } from "./errors";

/** Injected IO/scheduler for {@link startStatusPoll} — wave-2 operating
 *  brief §4's effects rule: the poll's decision logic is a pure driver, and
 *  every side-effecting call it makes is a parameter, never a global, so
 *  tests can drive time and visibility by hand instead of a real timer or
 *  the real DOM. */
export interface StatusPollDeps {
  /** One read of `deviceId`'s status characteristic (`app/src/ipc/device.ts`). */
  deviceStatus: (deviceId: string) => Promise<DeviceStatus>;
  /** Injected clock/scheduler so tests drive time, never a real timer. */
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
  /** True when the app window is not hidden (`document.visibilityState ===
   *  "visible"` in the real implementation). Injected so a background/
   *  minimised window does not keep a BLE link busy at 1 Hz (R78 Q1,
   *  2026-09-06: mount-scoped polling plus a visibility pause). */
  isVisible: () => boolean;
  /** Subscribes to visibility becoming true again; returns an unsubscribe
   *  function. The real implementation is a `visibilitychange` listener
   *  filtered to the visible case. */
  onVisibilityChange: (handler: () => void) => () => void;
}

/** One outcome `startStatusPoll` dispatches per tick. */
export type StatusPollAction =
  | { type: "status"; status: DeviceStatus }
  | { type: "statusError"; error: DeviceIpcError };

/** 1 Hz — SPEC §23.9's live status line and §23.10's hero read at this rate. */
export const STATUS_POLL_INTERVAL_MS = 1000;

/**
 * Starts polling `deviceId` every {@link STATUS_POLL_INTERVAL_MS} through
 * `deps.deviceStatus`, dispatching a {@link StatusPollAction} per settled
 * request, until the returned `stop` function is called. Returns the `stop`
 * function.
 *
 * Rules (lane brief Interface 1, R78):
 * - **Never two requests in flight.** The next timer is armed only in the
 *   settle handler of the previous request (resolve *and* reject), not on a
 *   fixed interval — a slow link degrades the rate instead of stacking
 *   requests.
 * - **A rejection does not stop the poll.** It dispatches `statusError` and
 *   polling continues, so a device that walks out of range recovers on its
 *   own when it comes back, with no manual re-scan.
 * - **While the window is hidden** (`deps.isVisible()` false), no request is
 *   issued; the driver instead waits on `deps.onVisibilityChange` and
 *   resumes polling the instant visibility returns (R78 Q1).
 * - **After `stop()`, nothing is dispatched**, including from a request that
 *   was already in flight — a monotonic generation counter is checked in
 *   every settle handler, so no promise is ever cancelled and no cleanup
 *   race can double-dispatch.
 * - `stop()` is idempotent and clears any armed timer and visibility
 *   subscription.
 */
export function startStatusPoll(
  deps: StatusPollDeps,
  deviceId: string,
  dispatch: (a: StatusPollAction) => void,
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

    deps.deviceStatus(deviceId).then(
      (status) => {
        if (gen !== generation) return; // stop() ran while this request was in flight
        dispatch({ type: "status", status });
        timerHandle = deps.setTimeout(() => tick(gen), STATUS_POLL_INTERVAL_MS);
      },
      (error: DeviceIpcError) => {
        if (gen !== generation) return;
        dispatch({ type: "statusError", error });
        timerHandle = deps.setTimeout(() => tick(gen), STATUS_POLL_INTERVAL_MS);
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

/** Consecutive-`device_status`-rejection threshold before showing the
 *  "link lost?" note (ruling R78 Q2, 2026-09-06). No source states a
 *  number — the poll keeps running past this point either way, since it
 *  recovers on its own when the device comes back into range, and the
 *  connection state itself is left unchanged (see {@link isLinkLost}'s
 *  doc comment). */
export const LINK_LOST_AFTER_FAILURES = 3;

/** State {@link deviceStatusReducer} accumulates across poll ticks: the
 *  last known status, the last error (if the most recent tick failed), and
 *  a run count used only to decide when to show the "link lost?" note. */
export interface DeviceStatusState {
  status: DeviceStatus | null;
  error: DeviceIpcError | null;
  consecutiveFailures: number;
}

/** `deviceStatusReducer`'s state before the first poll tick settles. */
export const initialDeviceStatusState: DeviceStatusState = {
  status: null,
  error: null,
  consecutiveFailures: 0,
};

/** Pure reducer folding `startStatusPoll`'s dispatched actions into
 *  {@link DeviceStatusState}. A `status` action clears the failure run; a
 *  `statusError` action keeps the last known status (never replaces it
 *  with `null`, so the hero card does not flicker to "not polled yet" on
 *  a single dropped poll) and extends the run. */
export function deviceStatusReducer(state: DeviceStatusState, action: StatusPollAction): DeviceStatusState {
  switch (action.type) {
    case "status":
      return { status: action.status, error: null, consecutiveFailures: 0 };
    case "statusError":
      return { ...state, error: action.error, consecutiveFailures: state.consecutiveFailures + 1 };
    default:
      return state;
  }
}

/** True once {@link DeviceStatusState.consecutiveFailures} reaches
 *  {@link LINK_LOST_AFTER_FAILURES} — the UI's cue to show a "link lost?"
 *  note beside the hero card. Per ruling R78 Q2, this does **not** change
 *  `ConnectionState.connected` or stop the poll: a run of failed polls is
 *  suggestive, not proof, and the poll's own retry is the recovery path if
 *  the device comes back into range. */
export function isLinkLost(state: DeviceStatusState): boolean {
  return state.consecutiveFailures >= LINK_LOST_AFTER_FAILURES;
}
