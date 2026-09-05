/**
 * A liveness watchdog for the sandbox iframe (design §6): pings on an
 * interval and trips `onStalled` once if a pong doesn't arrive within the
 * stall timeout, so a runaway cell can be torn down and rebuilt rather than
 * hanging the tab forever. Pure and deterministic — `now()` and `send()` are
 * injected so tests never need a real timer.
 */

/** Interval, in ms, between pings sent to the sandbox. */
const PING_INTERVAL_MS = 1000; // ms

/** Time, in ms, a pong may be outstanding before the sandbox is stalled. */
const STALL_TIMEOUT_MS = 3000; // ms

/** The watchdog's injected dependencies. */
export interface WatchdogDeps {
  /** Returns the current time in ms. Injected so tests control it. */
  now: () => number;
  /** Sends a ping to the sandbox. Injected so tests observe it without a real `postMessage`. */
  send: () => void;
  /** Called exactly once per stall, when no pong has arrived within `STALL_TIMEOUT_MS`. */
  onStalled: () => void;
}

/** The watchdog's public surface, driven forward by its caller's own clock. */
export interface Watchdog {
  /** Records that a pong arrived just now, clearing any stalled state. */
  onPong: () => void;
  /**
   * Advances the watchdog to `nowMs`: sends a ping if `PING_INTERVAL_MS` has
   * elapsed since the last one, and trips `onStalled` (once) if
   * `STALL_TIMEOUT_MS` has elapsed since the last pong.
   */
  tick: (nowMs: number) => void;
}

/**
 * Builds a {@link Watchdog}. Ping interval is `PING_INTERVAL_MS`, stall
 * timeout is `STALL_TIMEOUT_MS`; both are fixed per design §6, not
 * configurable per instance.
 */
export function createWatchdog(deps: WatchdogDeps): Watchdog {
  let lastPongAt = deps.now();
  let lastPingAt = -Infinity;
  let stalled = false;

  return {
    onPong: () => {
      lastPongAt = deps.now();
      stalled = false;
    },
    tick: (nowMs: number) => {
      if (nowMs - lastPingAt >= PING_INTERVAL_MS) {
        deps.send();
        lastPingAt = nowMs;
      }
      if (!stalled && nowMs - lastPongAt >= STALL_TIMEOUT_MS) {
        stalled = true;
        deps.onStalled();
      }
    },
  };
}
