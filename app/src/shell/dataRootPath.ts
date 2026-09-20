import { useSyncExternalStore } from "react";

/**
 * The `<data>` root this process resolved, for anything in the shell that
 * wants to *show* it (ruling R244's Welcome panel).
 *
 * `DataRootGate.tsx` already calls `get_data_dir` once on mount — it has
 * to, before it can decide whether to let the app start — and until now
 * kept the answer in its own component state. Publishing it here costs no
 * extra IPC and adds no command, which is exactly the condition R244 put
 * on showing the path at all ("if already available without a new IPC
 * command").
 *
 * `null` until that call resolves, and again if it fails: a path this
 * module cannot vouch for is not shown at all, rather than shown stale.
 *
 * A module-scope store, the same shape as `graphSlot.ts`'s and
 * `studioColumns.ts`'s, for the same reason — the gate that knows the path
 * and the panel that prints it are far apart in the tree with no prop path
 * between them.
 */
let resolvedPath: string | null = null;

const listeners = new Set<() => void>();

/** Called by `DataRootGate` when `get_data_dir` resolves (with the path)
 *  or fails (with `null`). Publishing the same value twice is a no-op. */
export function setDataRootPath(next: string | null): void {
  if (resolvedPath === next) return;
  resolvedPath = next;
  for (const listener of listeners) listener();
}

/** The resolved `<data>` root, or `null` if not known. For non-React call
 *  sites. */
export function getDataRootPath(): string | null {
  return resolvedPath;
}

/** Subscribes `handler` to changes of the resolved root. Returns an
 *  unsubscribe function. */
export function subscribeDataRootPath(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the resolved `<data>` root, re-rendering when it arrives. */
export function useDataRootPath(): string | null {
  return useSyncExternalStore(subscribeDataRootPath, getDataRootPath);
}
