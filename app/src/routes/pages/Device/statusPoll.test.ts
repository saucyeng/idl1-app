import { describe, expect, it, vi } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { composeVisibility } from "../../../shell/routeVisibility";
import type { DeviceIpcError } from "./errors";
import {
  deviceStatusReducer,
  initialDeviceStatusState,
  isLinkLost,
  LINK_LOST_AFTER_FAILURES,
  startStatusPoll,
  STATUS_POLL_INTERVAL_MS,
  type StatusPollAction,
  type StatusPollDeps,
} from "./statusPoll";

/** Minimal `DeviceStatus` with every field `null`/false except `sd`, which
 *  is set so each fake response is easy to tell apart in assertions. */
function fakeStatus(sd: "ok" | "full"): DeviceStatus {
  return {
    wifi_on: false,
    logging: false,
    battery_pct: null,
    sd,
    gps: null,
    imu: null,
    firmware: null,
    ota_pending_verify: false,
    hr: null,
    hr_battery_pct: null,
  };
}

/** A fake `setTimeout`/`clearTimeout` pair the test drives by hand, plus a
 *  fake `isVisible`/`onVisibilityChange` pair — no real timer or DOM event
 *  ever runs. */
function fakeScheduler() {
  let nextHandle = 1;
  const timers = new Map<number, () => void>();
  let visible = true;
  const visibilityHandlers = new Set<() => void>();

  const deps: StatusPollDeps = {
    deviceStatus: vi.fn(),
    setTimeout: (fn, _ms) => {
      const handle = nextHandle++;
      timers.set(handle, fn);
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle);
    },
    isVisible: () => visible,
    onVisibilityChange: (handler) => {
      visibilityHandlers.add(handler);
      return () => visibilityHandlers.delete(handler);
    },
  };

  return {
    deps,
    /** Fires every timer currently armed, as if `STATUS_POLL_INTERVAL_MS`
     *  elapsed. Fails loudly if more than one timer is armed — the poll
     *  driver's own invariant is "never two requests in flight," which
     *  shows up here as "never two timers armed." */
    fireTimer(): void {
      expect(timers.size).toBe(1);
      const [[handle, fn]] = timers;
      timers.delete(handle);
      fn();
    },
    armedTimerCount: () => timers.size,
    setVisible(next: boolean): void {
      visible = next;
      if (next) {
        for (const handler of visibilityHandlers) handler();
      }
    },
    visibilitySubscriberCount: () => visibilityHandlers.size,
  };
}

describe("startStatusPoll", () => {
  it("startStatusPoll — start — issues one request immediately with no timer armed yet", () => {
    // Arrange
    const { deps } = fakeScheduler();
    (deps.deviceStatus as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const dispatch = vi.fn();

    // Act
    startStatusPoll(deps, "dev-1", dispatch);

    // Assert
    expect(deps.deviceStatus).toHaveBeenCalledTimes(1);
    expect(deps.deviceStatus).toHaveBeenCalledWith("dev-1");
  });

  it("startStatusPoll — a response settles — the next timer is armed for STATUS_POLL_INTERVAL_MS and a second request waits for it", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    let resolveFirst: (s: DeviceStatus) => void = () => {};
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const dispatch = vi.fn();

    // Act
    startStatusPoll(scheduler.deps, "dev-1", dispatch);
    expect(scheduler.armedTimerCount()).toBe(0); // request in flight, no timer yet
    resolveFirst(fakeStatus("ok"));
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(scheduler.armedTimerCount()).toBe(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "status", status: fakeStatus("ok") });
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(1); // no second request until the timer fires
  });

  it("startStatusPoll — a slow response — delays the next request rather than stacking a second one", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    let resolveFirst: (s: DeviceStatus) => void = () => {};
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const dispatch = vi.fn();

    // Act — the interval "elapses" twice while the first request is still in flight
    startStatusPoll(scheduler.deps, "dev-1", dispatch);
    // No timer is armed yet (still in flight), so there is nothing to fire —
    // the assertion is simply that a second request was never issued.
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(1);
    resolveFirst(fakeStatus("ok"));
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(scheduler.armedTimerCount()).toBe(1); // only now is a timer armed
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(1);
  });

  it("startStatusPoll — a rejection — dispatches statusError and the poll continues", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    const error: DeviceIpcError = { kind: "ble", message: "no link" };
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error).mockResolvedValue(fakeStatus("ok"));
    const dispatch = vi.fn();

    // Act
    startStatusPoll(scheduler.deps, "dev-1", dispatch);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "statusError", error });
    expect(scheduler.armedTimerCount()).toBe(1); // the poll rearmed instead of stopping

    scheduler.fireTimer();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({ type: "status", status: fakeStatus("ok") });
  });

  it("startStatusPoll — stop() while a request is in flight — the settling result is never dispatched", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    let resolveFirst: (s: DeviceStatus) => void = () => {};
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const dispatch = vi.fn();

    // Act
    const stop = startStatusPoll(scheduler.deps, "dev-1", dispatch);
    stop();
    resolveFirst(fakeStatus("ok"));
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(dispatch).not.toHaveBeenCalled();
    expect(scheduler.armedTimerCount()).toBe(0);
  });

  it("startStatusPoll — stop() called twice — is safe and idempotent", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStatus("ok"));
    const dispatch = vi.fn();

    // Act
    const stop = startStatusPoll(scheduler.deps, "dev-1", dispatch);
    await Promise.resolve();
    await Promise.resolve();

    // Assert — calling stop twice throws nothing and clears the timer once
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(scheduler.armedTimerCount()).toBe(0);
  });

  it("startStatusPoll — stop() — clears an already-armed timer so it never fires", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStatus("ok"));
    const dispatch = vi.fn();
    const stop = startStatusPoll(scheduler.deps, "dev-1", dispatch);
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.armedTimerCount()).toBe(1);

    // Act
    stop();

    // Assert
    expect(scheduler.armedTimerCount()).toBe(0);
    expect(() => scheduler.fireTimer()).toThrow(); // nothing left to fire
  });

  it("startStatusPoll — window hidden — no request is issued until visibility returns", async () => {
    // Arrange
    const scheduler = fakeScheduler();
    scheduler.setVisible(false);
    const dispatch = vi.fn();

    // Act
    startStatusPoll(scheduler.deps, "dev-1", dispatch);

    // Assert
    expect(scheduler.deps.deviceStatus).not.toHaveBeenCalled();
    expect(scheduler.visibilitySubscriberCount()).toBe(1);

    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStatus("ok"));
    scheduler.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(1);
  });

  it("startStatusPoll — isVisible/onVisibilityChange composed from window+route visibility (Device/index.tsx's STATUS_POLL_DEPS shape) — the window being visible is not enough if the route is inactive, and rearming on the route becoming active reuses this same pause/resume path", async () => {
    // Arrange — deps built the way `Device/index.tsx` builds `STATUS_POLL_DEPS`:
    // `isVisible` composes the window's visibility with whether this route is
    // active, and `onVisibilityChange` subscribes to the same underlying
    // notifier `scheduler.setVisible` drives (standing in for the shared
    // `subscribeRouteVisible` notifier both signals share in the real app).
    const scheduler = fakeScheduler();
    let routeActive = false;
    const composedDeps: StatusPollDeps = {
      ...scheduler.deps,
      isVisible: () => composeVisibility(scheduler.deps.isVisible(), routeActive),
      onVisibilityChange: (handler) => scheduler.deps.onVisibilityChange(handler),
    };
    const dispatch = vi.fn();

    // Act — window visible but route inactive: no request yet.
    startStatusPoll(composedDeps, "dev-1", dispatch);

    // Assert
    expect(scheduler.deps.deviceStatus).not.toHaveBeenCalled();
    expect(scheduler.visibilitySubscriberCount()).toBe(1);

    // Act — the route becomes active; the shared notifier fires exactly as a
    // window-visibility change would, and the poll resumes.
    (scheduler.deps.deviceStatus as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStatus("ok"));
    routeActive = true;
    scheduler.setVisible(true); // window was already visible; this just fires the notifier
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.deps.deviceStatus).toHaveBeenCalledTimes(1);
  });

  it("startStatusPoll — stop() while waiting on visibility — the visibility subscription is dropped", () => {
    // Arrange
    const scheduler = fakeScheduler();
    scheduler.setVisible(false);
    const dispatch = vi.fn();

    // Act
    const stop = startStatusPoll(scheduler.deps, "dev-1", dispatch);
    stop();

    // Assert
    expect(scheduler.visibilitySubscriberCount()).toBe(0);
  });
});

describe("deviceStatusReducer / isLinkLost", () => {
  const action: (a: StatusPollAction) => void = () => {};
  void action;

  it("deviceStatusReducer — a status action — replaces status, clears the error and resets consecutiveFailures", () => {
    // Arrange
    const state = { status: null, error: { kind: "ble", message: "x" }, consecutiveFailures: 2 };

    // Act
    const next = deviceStatusReducer(state, { type: "status", status: fakeStatus("ok") });

    // Assert
    expect(next).toEqual({ status: fakeStatus("ok"), error: null, consecutiveFailures: 0 });
  });

  it("deviceStatusReducer — a statusError action — keeps the last status and increments consecutiveFailures", () => {
    // Arrange
    const state = { status: fakeStatus("ok"), error: null, consecutiveFailures: 0 };
    const error: DeviceIpcError = { kind: "ble", message: "no link" };

    // Act
    const next = deviceStatusReducer(state, { type: "statusError", error });

    // Assert
    expect(next).toEqual({ status: fakeStatus("ok"), error, consecutiveFailures: 1 });
  });

  it("isLinkLost — fewer than LINK_LOST_AFTER_FAILURES consecutive failures — false", () => {
    // Arrange
    const state = { ...initialDeviceStatusState, consecutiveFailures: LINK_LOST_AFTER_FAILURES - 1 };

    // Act / Assert
    expect(isLinkLost(state)).toBe(false);
  });

  it("isLinkLost — LINK_LOST_AFTER_FAILURES consecutive failures — true", () => {
    // Arrange
    const state = { ...initialDeviceStatusState, consecutiveFailures: LINK_LOST_AFTER_FAILURES };

    // Act / Assert
    expect(isLinkLost(state)).toBe(true);
  });

  it("isLinkLost — a status action after failures — resets, so isLinkLost goes false again", () => {
    // Arrange
    const failed = { ...initialDeviceStatusState, consecutiveFailures: LINK_LOST_AFTER_FAILURES };

    // Act
    const recovered = deviceStatusReducer(failed, { type: "status", status: fakeStatus("ok") });

    // Assert
    expect(isLinkLost(recovered)).toBe(false);
  });
});

/** `STATUS_POLL_INTERVAL_MS` is passed to the injected `setTimeout` verbatim
 *  — pinned here so a future edit cannot silently change the poll rate. */
describe("STATUS_POLL_INTERVAL_MS wiring", () => {
  it("startStatusPoll — arms the settle-handler timer with STATUS_POLL_INTERVAL_MS", async () => {
    // Arrange
    const deps: StatusPollDeps = {
      deviceStatus: vi.fn().mockResolvedValue(fakeStatus("ok")),
      setTimeout: vi.fn((_fn: () => void, _ms: number) => 1) as unknown as StatusPollDeps["setTimeout"],
      clearTimeout: vi.fn(),
      isVisible: () => true,
      onVisibilityChange: () => () => {},
    };

    // Act
    startStatusPoll(deps, "dev-1", vi.fn());
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(deps.setTimeout).toHaveBeenCalledWith(expect.any(Function), STATUS_POLL_INTERVAL_MS);
  });
});
