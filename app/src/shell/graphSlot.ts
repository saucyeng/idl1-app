import { useSyncExternalStore } from "react";

/**
 * The wide-layout studio's maths-graph column publishes its own container
 * DOM node here; `routes/pages/Notebook/index.tsx` portals its existing
 * `GraphCanvas` element into that node instead of rendering a second
 * instance in its own content area. `null` when no such column is mounted
 * (every layout but wide, or before the shell has laid out `ColumnFrame`)
 * — the Notebook page falls back to its own in-page graph pane then.
 *
 * The exact counterpart of `editorSlot.ts`, for the same reason R109 gave
 * for the editor: every value `GraphCanvas` needs (the open workbook's
 * markdown, the per-window evaluation outputs, the resolved
 * `SessionDetail`s, the workbook `dispatch` and the selected-cell setter)
 * lives in the Notebook page, and the maths column is rendered by
 * `RouteHost.tsx` outside it. Carrying a DOM node down beats lifting that
 * state up: nothing is duplicated, and no second `GraphCanvas` instance
 * ever exists.
 *
 * A module-scope store, the same shape as `editorSlot.ts`'s and
 * `routeVisibility.tsx`'s: the publishing column (inside `ColumnFrame`'s
 * `maths` slot) and the consuming Notebook page (`ColumnFrame`'s `output`
 * slot) are both descendants of `RouteHost`, but siblings of each other.
 */
let slotNode: HTMLDivElement | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the maths column's container ref whenever it mounts,
 *  unmounts, or (in React's `StrictMode` double-invoke) remounts. Passing
 *  the same node twice is a no-op (no redundant notify). */
export function setGraphSlotNode(node: HTMLDivElement | null): void {
  if (slotNode === node) return;
  slotNode = node;
  notify();
}

/** The current slot node, for non-React call sites. `null` when no wide
 *  studio maths column is mounted. */
export function getGraphSlotNode(): HTMLDivElement | null {
  return slotNode;
}

/** Subscribes `handler` to be called whenever the slot node changes.
 *  Returns an unsubscribe function. */
export function subscribeGraphSlot(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current graph slot node, re-rendering whenever it
 *  changes. */
export function useGraphSlotNode(): HTMLDivElement | null {
  return useSyncExternalStore(subscribeGraphSlot, getGraphSlotNode);
}
