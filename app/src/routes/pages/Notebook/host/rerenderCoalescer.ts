/**
 * Coalesces a burst of {@link RerenderCoalescer.notify} calls into one
 * `onFire()` call, `delayMs` ms after the last of them (overnight brief,
 * 2026-09-08 — "coalesce the re-render"). `SandboxHost.scheduleRerender`
 * previously coalesced only through a `queueMicrotask`, which merges calls
 * made within the same microtask but nothing across separate ones — and a
 * `channel(...)`/`spectrum(...)` publish for each of a page's channels
 * resolves its own IPC round trip independently, each landing in its own
 * task. On a real page load this produced roughly one re-render (and one
 * "cell re-evaluated against a still-unbound name" warning) *per channel*
 * rather than one for the whole load. A trailing debounce, same shape as
 * gesture settle, actually coalesces a burst spread across time, not just
 * across one microtask.
 *
 * A thin, testable wrapper over `model/settle.ts`'s `makeSettle`:
 * `SandboxHost` itself is not unit-tested (CLAUDE.md §4 — it owns a live
 * `<iframe>`), so this decision -- "how many `notify` calls become how many
 * fires" -- is split out, exactly `outboundQueue.ts`'s own precedent for
 * the same reason.
 */
import { makeSettle, type SettleTimer } from "../model/settle";

export interface RerenderCoalescer {
  /** Records that a re-render is needed and (re)starts the `delayMs` quiet-period timer. */
  notify(): void;
  /** Cancels a pending fire without running `onFire` — call on teardown. */
  cancel(): void;
}

/**
 * Builds a coalescer: `onFire()` runs once, `delayMs` ms after the last
 * `notify()` call in a burst — never once per `notify()`.
 *
 * @param timer Injected `setTimeout`/`clearTimeout`-shaped scheduler
 *   (`model/settle.ts`'s `SettleTimer`), for a test's fully controllable
 *   fake; defaults to the real global timer.
 */
export function makeRerenderCoalescer(delayMs: number, onFire: () => void, timer?: SettleTimer): RerenderCoalescer {
  const settle = timer === undefined ? makeSettle<undefined>(delayMs, onFire) : makeSettle<undefined>(delayMs, onFire, timer);
  return {
    notify: () => settle.notify(undefined),
    cancel: () => settle.cancel(),
  };
}
