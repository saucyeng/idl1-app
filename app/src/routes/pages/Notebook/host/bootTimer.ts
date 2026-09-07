/**
 * The pure boot-timeout decision for a sandbox iframe generation (design
 * §6): a freshly created iframe must send `ready` within {@link
 * BOOT_TIMEOUT_MS} of being armed, or this timer reports it unavailable
 * exactly once. Real trigger (2026-09-07, Isaac's WebView console): a
 * broken dev-server CORS path made the sandbox's own `main.ts` module fetch
 * fail outright, so `ready` never arrived and nothing was watching for
 * that — the output column just stayed blank with no error and no retry.
 * This is a one-shot deadline, independent of `watchdog.ts`'s repeating
 * ping/stall loop. Pure and deterministic — `schedule` and `cancel` are
 * injected so tests never need a real timer, the same intent as
 * `watchdog.ts`'s own dependency injection.
 */

/**
 * How long an armed boot attempt may run before {@link BootTimerDeps.onUnavailable}
 * fires. 5s is chosen generously above a normal module-graph load
 * (Runtime/Plot/d3/Inputs/htl, a few hundred ms even on a cold dev-server
 * cache) without making a genuine failure wait long to be reported — an
 * undocumented judgement call, not a spec number.
 */
export const BOOT_TIMEOUT_MS = 5000; // ms

/** The boot timer's injected dependencies. */
export interface BootTimerDeps {
  /** Schedules `fn` to run after `delayMs`; returns an opaque handle passed
   *  back to `cancel`. In production this is `setTimeout`; tests inject a
   *  fake so no real timer is needed. */
  schedule: (fn: () => void, delayMs: number) => unknown;
  /** Cancels a handle previously returned by `schedule`. A no-op on a
   *  handle that has already fired or been cancelled. In production this
   *  is `clearTimeout`. */
  cancel: (handle: unknown) => void;
  /** Called at most once per armed deadline, when it elapses with no
   *  matching {@link BootTimer.onReady} call. */
  onUnavailable: () => void;
}

/** The boot timer's public surface, driven by its caller's iframe lifecycle. */
export interface BootTimer {
  /**
   * Arms a fresh {@link BOOT_TIMEOUT_MS} deadline, cancelling any deadline
   * already pending (a retry/rebuild re-arms rather than stacking timers).
   */
  arm: () => void;
  /** Records that `ready` arrived: clears the pending deadline, reports nothing. */
  onReady: () => void;
  /**
   * Clears the pending deadline without reporting — for a route going
   * hidden or the host disposing mid-boot (R95): a torn-down iframe must
   * never fire {@link BootTimerDeps.onUnavailable} against nothing.
   */
  dispose: () => void;
}

/**
 * Builds a {@link BootTimer}. The deadline length is {@link BOOT_TIMEOUT_MS},
 * fixed per this module, not configurable per instance.
 */
export function createBootTimer(deps: BootTimerDeps): BootTimer {
  let handle: unknown = null;

  const clear = (): void => {
    if (handle !== null) {
      deps.cancel(handle);
      handle = null;
    }
  };

  return {
    arm: () => {
      clear();
      handle = deps.schedule(() => {
        handle = null;
        deps.onUnavailable();
      }, BOOT_TIMEOUT_MS);
    },
    onReady: clear,
    dispose: clear,
  };
}
