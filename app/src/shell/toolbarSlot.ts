import { useSyncExternalStore } from "react";

/**
 * The shell-owned row that hosts the Notebook toolbar (bug report fixed
 * 2026-09-09, correcting R161: the toolbar spans the **window**, not just
 * the Notebook tab's own column area). `AppShell.tsx` mounts the row
 * unconditionally (it sits above `RouteHost`, a sibling of every route, not
 * inside any one of them) and publishes its DOM node here;
 * `routes/pages/Notebook/index.tsx` portals its existing toolbar element
 * into that node instead of rendering it inside its own route root, which
 * can never be wider than the Notebook tab's own column area.
 *
 * Same shape as `editorSlot.ts` deliberately, but a **sibling** module, not
 * folded into it: a toolbar row and the wide-layout properties column are
 * two different concepts that happen to share a publish/subscribe
 * convention (R161 amended made this same call for `notebookColumns.ts`
 * against `columnPrefs.ts` — two concepts sharing a convention stay two
 * modules).
 *
 * Unlike the editor slot, this node's presence does **not** imply the
 * Notebook tab is active — `RouteHost.tsx` keeps every route mounted
 * (mount-and-hide, R93), so the Notebook page is always present to publish
 * a node whether or not its tab is selected. The consumer is responsible
 * for only portaling real content in while its own route is visible
 * (`shell/routeVisibility.tsx`'s `useRouteVisible`); otherwise every other
 * tab would show the Notebook toolbar too.
 */
let slotNode: HTMLDivElement | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the shell's toolbar row container ref whenever it mounts,
 *  unmounts, or (in React's `StrictMode` double-invoke) remounts. Passing
 *  the same node twice is a no-op (no redundant notify). */
export function setToolbarSlotNode(node: HTMLDivElement | null): void {
  if (slotNode === node) return;
  slotNode = node;
  notify();
}

/** The current slot node, for non-React call sites. `null` before
 *  `AppShell.tsx` has mounted its toolbar row. */
export function getToolbarSlotNode(): HTMLDivElement | null {
  return slotNode;
}

/** Subscribes `handler` to be called whenever the slot node changes.
 *  Returns an unsubscribe function. */
export function subscribeToolbarSlot(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current toolbar slot node, re-rendering whenever it
 *  changes. */
export function useToolbarSlotNode(): HTMLDivElement | null {
  return useSyncExternalStore(subscribeToolbarSlot, getToolbarSlotNode);
}
