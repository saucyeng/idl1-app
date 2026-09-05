/**
 * A debouncer for gesture settle (design §6; C3 §4 "Interaction budget"):
 * fires `onSettle` once a gesture stops producing new frames for `delayMs`,
 * and never in between. `ChartCell`'s `onWheel`/`onPointerMove` handlers call
 * `notify` on every frame; the callback this schedules is the **only**
 * reachable caller of Task 6's `ensureTiles`/`fetchTile` from a gesture.
 */

/**
 * The `setTimeout`/`clearTimeout`-shaped dependency `makeSettle` schedules
 * its debounce timer through, injected so `settle.test.ts` can supply a
 * fully controllable fake instead of relying on real wall-clock delays or
 * vitest's fake-timer mode. The real `window`/global `setTimeout`/
 * `clearTimeout` satisfy this shape directly (their extra `...args` forwarding
 * behaviour is simply unused here).
 */
export interface SettleTimer {
  /** Schedules `callback` to run after `delayMs` ms; returns an opaque handle. */
  setTimeout(callback: () => void, delayMs: number): number;
  /** Cancels a pending `handle` from `setTimeout`; a no-op if it already fired or was cleared. */
  clearTimeout(handle: number): void;
}

/** The real browser/Node global timer, for production callers that don't
 *  need to inject a fake one. */
const REAL_TIMER: SettleTimer = { setTimeout, clearTimeout };

/**
 * Builds a settle debouncer. `notify(value)` records `value` as the latest
 * and (re)starts a `delayMs` timer; `onSettle` fires with the latest
 * recorded value once `delayMs` ms pass with no further `notify` call.
 * `cancel()` stops a pending timer without firing `onSettle` — call it on
 * unmount so a component teardown never fires a stale settle.
 *
 * @param delayMs Debounce delay, in ms.
 * @param onSettle Called with the latest `notify`-ed value once the gesture has settled.
 * @param timer Injected `setTimeout`/`clearTimeout`-shaped scheduler; defaults to the real global timer.
 */
export function makeSettle<T>(
  delayMs: number,
  onSettle: (value: T) => void,
  timer: SettleTimer = REAL_TIMER
): { notify(value: T): void; cancel(): void } {
  let handle: number | null = null;
  let latest: T;

  return {
    notify(value: T): void {
      latest = value;
      if (handle !== null) {
        timer.clearTimeout(handle);
      }
      handle = timer.setTimeout(() => {
        handle = null;
        onSettle(latest);
      }, delayMs);
    },
    cancel(): void {
      if (handle !== null) {
        timer.clearTimeout(handle);
        handle = null;
      }
    },
  };
}
