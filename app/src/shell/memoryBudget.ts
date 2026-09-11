import { useSyncExternalStore } from "react";

/**
 * The tile cache's share of its byte budget, for the status bar's meter
 * (ruling R220 item 1: "memory budget use as a small meter").
 *
 * The only memory budget the app actually keeps is
 * `routes/pages/Notebook/model/tileCache.ts`'s: decoded chart tiles are the
 * one thing the UI holds in quantity, and the cache already tracks its own
 * bytes against a cap so it can evict. This store carries that number out
 * to the chrome; nothing new is measured and nothing is polled (R220 item
 * 4) — the cache's owner publishes when it puts a tile, which is the same
 * moment the number changes.
 *
 * Publishing is bucketed to whole percent ({@link publishMemoryUse}): a
 * long pan puts hundreds of tiles a second and a 22 px meter cannot show
 * the difference between 41.2 % and 41.3 %, so the chrome re-renders at
 * most a hundred times over a full cache fill rather than once per tile.
 */
export interface MemoryUse {
  /** Bytes currently held. */
  usedBytes: number;
  /** The cap those bytes are measured against. */
  capBytes: number;
  /** `usedBytes / capBytes`, clamped to `0`–`1`. */
  fraction: number;
}

const EMPTY: MemoryUse = { usedBytes: 0, capBytes: 0, fraction: 0 };

let use: MemoryUse = EMPTY;

const listeners = new Set<() => void>();

/** `usedBytes / capBytes` clamped to `0`–`1`; `0` for a cap of zero or a
 *  non-finite input, so the meter can never render past its track or read
 *  `NaN`. */
export function memoryFraction(usedBytes: number, capBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(capBytes) || capBytes <= 0) return 0;
  return Math.min(1, Math.max(0, usedBytes / capBytes));
}

/** The meter's accessible name, e.g. `"Chart memory: 12.4 MB of 30.0 MB"`.
 *  MB, decimal — the unit a cache cap is written in
 *  (`tileCache.ts`'s `DEFAULT_CACHE_BYTES` is stated in MiB but a status
 *  bar is not the place to explain the difference; the ratio is what the
 *  meter is for). */
export function memoryLabel(used: MemoryUse): string {
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
  return `Chart memory: ${mb(used.usedBytes)} MB of ${mb(used.capBytes)} MB`;
}

/**
 * Publishes the cache's current bytes. Listeners are notified only when the
 * whole-percent bucket changes, or when the cap itself changes — see this
 * module's doc comment.
 *
 * @param usedBytes Bytes currently held by the cache.
 * @param capBytes The cache's cap.
 */
export function publishMemoryUse(usedBytes: number, capBytes: number): void {
  const fraction = memoryFraction(usedBytes, capBytes);
  const sameBucket = Math.round(fraction * 100) === Math.round(use.fraction * 100);
  if (sameBucket && capBytes === use.capBytes) return;
  use = { usedBytes, capBytes, fraction };
  for (const listener of listeners) listener();
}

/** The current use; a zero cap (nothing published yet) is the status bar's
 *  cue to render no meter at all. */
export function getMemoryUse(): MemoryUse {
  return use;
}

/** Subscribes `handler` to changes. Returns an unsubscribe. */
export function subscribeMemoryUse(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current memory use, re-rendering when its bucket
 *  changes. */
export function useMemoryUse(): MemoryUse {
  return useSyncExternalStore(subscribeMemoryUse, getMemoryUse, getMemoryUse);
}
