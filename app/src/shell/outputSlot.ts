import { useSyncExternalStore } from "react";

/**
 * The studio's Notebook panel publishes its own container DOM node here;
 * `routes/pages/Notebook/index.tsx` portals its main content area (the
 * cell list, or the paper view) into that node instead of rendering it in
 * its own content area. `null` when no such panel is docked — every layout
 * but wide, before `DockFrame` has laid out, or after the user closed the
 * Notebook panel from the ribbon — and the page then renders its content
 * inline exactly as it did before ruling R239.
 *
 * The exact counterpart of `graphSlot.ts` and `editorSlot.ts`, and the
 * reason it exists at all is R239's: a dock panel's content is unmounted
 * when that panel is closed, and the Notebook page is where the ribbon,
 * the timeline strip, the workbook session and the sandbox iframe host all
 * live. Unmounting it to close one panel would take the whole studio with
 * it — including the toggle that would put it back. So the page stays
 * mounted where `RouteHost.tsx` has always rendered it and the *panel*
 * holds nothing but a container to portal into, which is R109's rule
 * applied to the third of the three panels rather than only the first two.
 *
 * It is also what makes R239's brief item 4 true for free: all three
 * panels hold empty containers, so a drag that re-docks one moves a div
 * with a portal target in it and React re-renders nothing at all.
 *
 * A module-scope store, the same shape as its two siblings: the publishing
 * panel (inside `DockFrame`) and the consuming Notebook page are both
 * descendants of `RouteHost`, but siblings of each other.
 */
let slotNode: HTMLDivElement | null = null;

/**
 * Whether the studio dock is on screen at all.
 *
 * Distinct from {@link slotNode}, and ruling R244 is why. A closed
 * Notebook panel publishes `null` for the node while the dock is very much
 * still there, showing Welcome; if the page read node-absence as "no dock"
 * it would put its cell list back in its own body, *above* the dock that
 * is displaying the Welcome panel in its place. The node answers "where do
 * I portal my output"; this answers "does someone else own my body".
 */
let dockMounted = false;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the Notebook panel's container ref whenever it mounts,
 *  unmounts, or (in React's `StrictMode` double-invoke) remounts. Passing
 *  the same node twice is a no-op (no redundant notify). */
export function setOutputSlotNode(node: HTMLDivElement | null): void {
  if (slotNode === node) return;
  slotNode = node;
  notify();
}

/** The current slot node, for non-React call sites. `null` when no
 *  Notebook panel is docked. */
export function getOutputSlotNode(): HTMLDivElement | null {
  return slotNode;
}

/** Called by `DockFrame` on mount and unmount. Publishing the same value
 *  twice is a no-op (no redundant notify). */
export function setStudioDockMounted(next: boolean): void {
  if (dockMounted === next) return;
  dockMounted = next;
  notify();
}

/** Whether the studio dock is on screen, for non-React call sites. */
export function getStudioDockMounted(): boolean {
  return dockMounted;
}

/** React hook: whether the studio dock owns the Notebook page's content
 *  area, re-rendering whenever that changes. */
export function useStudioDockMounted(): boolean {
  return useSyncExternalStore(subscribeOutputSlot, getStudioDockMounted);
}

/** Subscribes `handler` to be called whenever the slot node or the dock's
 *  presence changes. Returns an unsubscribe function. */
export function subscribeOutputSlot(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the current output slot node, re-rendering whenever it
 *  changes. */
export function useOutputSlotNode(): HTMLDivElement | null {
  return useSyncExternalStore(subscribeOutputSlot, getOutputSlotNode);
}
