import { useSyncExternalStore } from "react";

/**
 * Whether the wide-layout studio should dock a maths-graph column at all
 * (ruling R208 item 2, closing the gap R161 left).
 *
 * R161 made the toolbar's Graph control a **column** show/hide toggle, but
 * only the column's *contents* ever reacted to it: `ColumnFrame` kept
 * rendering a full-width `maths` panel and its divider, and the Notebook
 * portalled a "Maths graph hidden — shown via the toolbar's Graph toggle"
 * placeholder into it. Hidden read as "still there, but empty and
 * explaining itself". `shell/columnVisibility.ts` already drops a column
 * whose content prop is `undefined` — no panel, no stray divider, R107's
 * rule for the library column — so the toggle simply needs to reach
 * `RouteHost.tsx`'s `maths` prop, which this store is the channel for.
 *
 * The direction is page → shell: the toggle's state lives in
 * `routes/pages/Notebook/model/notebookColumns.ts` (R161 amended:
 * deliberately *not* in `shell/columnPrefs.ts`, since the shell's own
 * `ColumnId` describes a different concept), and `RouteHost` renders the
 * Notebook page rather than the other way round, so there is no prop path
 * down. A module-scope store is what the shell already uses for exactly
 * this hop — `graphSlot.ts`, `editorSlot.ts` and `toolbarSlot.ts` all
 * carry a value between `ColumnFrame`'s sibling slots — and this is its
 * smallest possible member: one boolean, published by the page that owns
 * the toggle, read by the component that renders the column.
 *
 * Defaults to `true` so the column renders exactly as it did before the
 * page has published anything (the first frame, or a route that never
 * mounts the Notebook at all); the page publishes on mount, so the default
 * is visible for at most one render.
 */
let visible = true;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by `routes/pages/Notebook/index.tsx` whenever its own
 *  `columnVisibility.graph` changes. Publishing the same value twice is a
 *  no-op (no redundant notify). */
export function setGraphColumnVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  notify();
}

/** The current value, for non-React call sites. */
export function getGraphColumnVisible(): boolean {
  return visible;
}

/** Subscribes `handler` to be called whenever the value changes. Returns
 *  an unsubscribe function. */
export function subscribeGraphColumnVisible(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: whether the studio should dock a maths column, re-rendering
 *  whenever that changes. */
export function useGraphColumnVisible(): boolean {
  return useSyncExternalStore(subscribeGraphColumnVisible, getGraphColumnVisible);
}
