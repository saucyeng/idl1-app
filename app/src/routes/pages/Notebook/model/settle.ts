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
 *  need to inject a fake one. This default path itself is not exercised by
 *  `settle.test.ts` (review-task8.md Minor) — every test injects a fully
 *  controllable fake timer instead, since covering the real `setTimeout`
 *  path deterministically would need either a real wall-clock wait or
 *  vitest's fake-timer mode mixed with this injected-timer design, both
 *  disallowed by this module's own testing constraints; the gap is accepted
 *  rather than silently left uncovered. */
const REAL_TIMER: SettleTimer = { setTimeout, clearTimeout };

/**
 * Builds a settle debouncer. `notify(value)` records `value` as the latest
 * and (re)starts a `delayMs` timer; `onSettle` fires with the latest
 * recorded value once `delayMs` ms pass with no further `notify` call.
 * `cancel()` stops a pending timer without firing `onSettle` — call it on
 * unmount so a component teardown never fires a stale settle.
 *
 * `latestSeq()` returns a strictly increasing counter, incremented
 * immediately before each `onSettle` firing (starting at `0`, meaning "no
 * settle has fired yet") — a caller whose `onSettle` starts async work (e.g.
 * a tile or raster fetch) reads `latestSeq()` synchronously inside its own
 * `onSettle` callback to capture *this* firing's sequence number, then
 * compares it against `latestSeq()` again once the async work resolves: if a
 * newer settle has fired in between, `latestSeq()` has moved on and the
 * async result is stale (review-task8.md's "no stale-settle guard" finding
 * — two settles can be in flight concurrently under real fetch latency, and
 * without this check whichever resolves *last* wins even if it is the
 * older, already-superseded one). See {@link isStaleSettleResult}, the pure
 * comparison this check reduces to.
 *
 * @param delayMs Debounce delay, in ms.
 * @param onSettle Called with the latest `notify`-ed value once the gesture has settled.
 * @param timer Injected `setTimeout`/`clearTimeout`-shaped scheduler; defaults to the real global timer.
 */
export function makeSettle<T>(
  delayMs: number,
  onSettle: (value: T) => void,
  timer: SettleTimer = REAL_TIMER
): { notify(value: T): void; cancel(): void; latestSeq(): number } {
  let handle: number | null = null;
  let latest: T;
  let seq = 0;

  return {
    notify(value: T): void {
      latest = value;
      if (handle !== null) {
        timer.clearTimeout(handle);
      }
      handle = timer.setTimeout(() => {
        handle = null;
        seq += 1;
        onSettle(latest);
      }, delayMs);
    },
    cancel(): void {
      if (handle !== null) {
        timer.clearTimeout(handle);
        handle = null;
      }
    },
    latestSeq(): number {
      return seq;
    },
  };
}

/**
 * `true` if `resultSeq` (the {@link makeSettle} `latestSeq()` value an async
 * settle-driven fetch captured when it started) no longer matches
 * `currentSeq` (`latestSeq()` read again once the fetch resolves) — meaning a
 * newer settle fired while the fetch was in flight and its result must be
 * dropped rather than committed over the newer settle's own (possibly
 * still-pending) result.
 *
 * @param resultSeq The sequence number captured when the async work started.
 * @param currentSeq The sequence number read when the async work resolved.
 */
export function isStaleSettleResult(resultSeq: number, currentSeq: number): boolean {
  return resultSeq !== currentSeq;
}
