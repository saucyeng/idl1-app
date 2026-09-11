import { useSyncExternalStore } from "react";

/**
 * The shell-owned band under the editor toolbar that hosts the Notebook's
 * timeline / windowing strip (ruling R221.1: the strip is chrome, and all
 * chrome renders in one layer above the content container).
 *
 * The strip used to be the first thing inside the Notebook route's own
 * content column, which put it under the sandbox iframe host — a chart
 * scrolled up the page painted straight over it. Moving it into the chrome
 * layer is what fixes that, and it is a move, not a patch: the strip is
 * chrome by any reading (it is a control over the window selection, not a
 * part of the document), so its home was wrong rather than its z-index.
 *
 * Same publish/subscribe convention as `shell/toolbarSlot.ts`, and a
 * sibling module for the same reason that one gives: two bands that share a
 * convention stay two modules. As there, the node's presence does **not**
 * imply the Notebook tab is active — every route stays mounted (R93) — so
 * the consumer gates its portal on its own route visibility.
 */
let slotNode: HTMLDivElement | null = null;

const listeners = new Set<() => void>();

/** Called by the shell's timeline row container ref when it mounts,
 *  unmounts, or (under `StrictMode`'s double-invoke) remounts. Passing the
 *  same node twice is a no-op. */
export function setTimelineSlotNode(node: HTMLDivElement | null): void {
  if (slotNode === node) return;
  slotNode = node;
  for (const listener of listeners) listener();
}

/** The current slot node; `null` before the shell has mounted its row. */
export function getTimelineSlotNode(): HTMLDivElement | null {
  return slotNode;
}

/** Subscribes `handler` to slot-node changes. Returns an unsubscribe. */
export function subscribeTimelineSlot(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current timeline slot node, re-rendering when it
 *  changes. */
export function useTimelineSlotNode(): HTMLDivElement | null {
  return useSyncExternalStore(subscribeTimelineSlot, getTimelineSlotNode, getTimelineSlotNode);
}
