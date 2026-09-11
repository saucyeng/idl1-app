import { useSyncExternalStore } from "react";

import type { RouteId } from "../routes/types";

/**
 * The shell-owned sidebar's content slots — one per activity (ruling R220
 * item 1: "Sidebar ... whose content is the active activity's
 * list/navigation").
 *
 * Same publish/subscribe convention as `shell/toolbarSlot.ts`, and a
 * sibling module for the same stated reason: a toolbar row, a properties
 * column and an activity sidebar are three concepts that happen to share a
 * convention. Unlike those two, this one is keyed by route — each of the
 * four pages portals its own navigation into its own node, and the shell
 * shows whichever node belongs to the active activity. A page's sidebar
 * content is built where its state lives (R109), so the session list keeps
 * the Data page's filters and the workbook picker keeps the Notebook page's
 * catalog, without either being lifted into the shell.
 *
 * Every route is mounted whether or not its tab is active (mount-and-hide,
 * R93), so all four nodes exist at once; only the active one is on screen.
 * That is deliberate — a sidebar that rebuilt its list on every activity
 * switch would lose scroll position and selection, which is the state the
 * sidebar exists to hold.
 */
type Nodes = Readonly<Partial<Record<RouteId, HTMLDivElement | null>>>;

let nodes: Nodes = {};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by each activity's sidebar panel container ref when it mounts,
 *  unmounts, or (under `StrictMode`'s double-invoke) remounts. Passing the
 *  same node twice is a no-op. */
export function setSidebarSlotNode(route: RouteId, node: HTMLDivElement | null): void {
  if (nodes[route] === node) return;
  nodes = { ...nodes, [route]: node };
  notify();
}

/** `route`'s slot node, or `null` before the shell has mounted its
 *  sidebar. */
export function getSidebarSlotNode(route: RouteId): HTMLDivElement | null {
  return nodes[route] ?? null;
}

/** Subscribes `handler` to slot-node changes. Returns an unsubscribe. */
export function subscribeSidebarSlots(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: `route`'s sidebar slot node, re-rendering whenever it
 *  changes. The one call each page makes before portaling its navigation
 *  in. */
export function useSidebarSlotNode(route: RouteId): HTMLDivElement | null {
  return useSyncExternalStore(
    subscribeSidebarSlots,
    () => getSidebarSlotNode(route),
    () => null
  );
}
