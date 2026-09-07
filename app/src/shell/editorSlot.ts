import { useSyncExternalStore } from "react";

/**
 * The wide-layout studio's properties column publishes its own container
 * DOM node here (R109); `routes/pages/Notebook/index.tsx` portals its
 * existing `EditorPanes` element into that node instead of rendering a
 * second instance inline. `null` when no such column is mounted (every
 * layout but wide, or before the shell has laid out `ColumnFrame`) — the
 * Notebook page falls back to its own in-page placement in that case.
 *
 * A module-scope store, the same shape as `routeVisibility.tsx`'s: the
 * publishing column (inside `ColumnFrame`'s `properties` slot) and the
 * consuming Notebook page (`ColumnFrame`'s `output` slot) are both
 * descendants of `RouteHost`, but siblings of each other, so a shared
 * store reached by both without a dedicated context provider is simpler
 * than threading one through `RouteHost`/`ColumnFrame`'s existing prop
 * shape.
 */
let slotNode: HTMLDivElement | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the properties column's container ref whenever it mounts,
 *  unmounts, or (in React's `StrictMode` double-invoke) remounts. Passing
 *  the same node twice is a no-op (no redundant notify). */
export function setEditorSlotNode(node: HTMLDivElement | null): void {
  if (slotNode === node) return;
  slotNode = node;
  notify();
}

/** The current slot node, for non-React call sites. `null` when no wide
 *  studio properties column is mounted. */
export function getEditorSlotNode(): HTMLDivElement | null {
  return slotNode;
}

/** Subscribes `handler` to be called whenever the slot node changes.
 *  Returns an unsubscribe function. */
export function subscribeEditorSlot(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current editor slot node, re-rendering whenever it
 *  changes. */
export function useEditorSlotNode(): HTMLDivElement | null {
  return useSyncExternalStore(subscribeEditorSlot, getEditorSlotNode);
}
