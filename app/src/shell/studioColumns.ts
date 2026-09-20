import { useSyncExternalStore } from "react";

/**
 * Which of the wide-layout studio's two slot columns — the maths graph and
 * the properties/code panes — should be docked at all (ruling R208 item 2,
 * widened to the properties column by R213 item 1's Output preset).
 *
 * This was `graphColumnVisible.ts`, one boolean for the maths column. R161
 * made the toolbar's Graph control a **column** show/hide toggle, but only
 * the column's *contents* ever reacted: `ColumnFrame` kept rendering a
 * full-width panel and its divider, and the Notebook portalled a "hidden —
 * shown via the toolbar's toggle" placeholder into it. Hidden read as "still
 * there, but empty and explaining itself". R208 fixed that for the maths
 * column; R213's Output preset ("notebook output full width") needs the same
 * for properties, since a 320 px panel holding a placeholder is not full
 * width. `shell/columnVisibility.ts` already drops a column whose content
 * prop is `undefined` (R107's rule for the library column), so both toggles
 * simply need to reach `RouteHost.tsx`'s props, which this store is the
 * channel for.
 *
 * The direction is page → shell: the toggles' state lives in
 * `routes/pages/Notebook/model/notebookColumns.ts` (R161 amended:
 * deliberately *not* in `shell/columnPrefs.ts`, since the shell's own
 * `ColumnId` describes a different concept), and `RouteHost` renders the
 * Notebook page rather than the other way round, so there is no prop path
 * down. A module-scope store is what the shell already uses for exactly
 * this hop — `graphSlot.ts`, `editorSlot.ts` and `toolbarSlot.ts` all carry
 * a value between `ColumnFrame`'s sibling slots.
 *
 * Both default to `true` so the columns render exactly as they did before
 * the page has published anything (the first frame, or a route that never
 * mounts the Notebook at all); the page publishes on mount, so the default
 * is visible for at most one render.
 */

/** The studio panels whose content the Notebook page owns and whose
 *  presence its own ribbon toggles decide.
 *
 *  `cells` joined the other two with ruling R239. Under `ColumnFrame` the
 *  Notebook output was the one column that could not go away — the frame
 *  was empty without it — so its toggle only ever reached inside the page.
 *  A dock has no such column: all three are panels, all three close, and
 *  `DockFrame.tsx` reads this store for all three. */
export type StudioColumnId = "graph" | "properties" | "cells";

const visible: Record<StudioColumnId, boolean> = { graph: true, properties: true, cells: true };

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by `routes/pages/Notebook/index.tsx` whenever its own
 *  `columnVisibility` changes. Publishing the same value twice is a no-op
 *  (no redundant notify). */
export function setStudioColumnVisible(id: StudioColumnId, next: boolean): void {
  if (visible[id] === next) return;
  visible[id] = next;
  notify();
}

/** Whether `id`'s column should be docked, for non-React call sites. */
export function getStudioColumnVisible(id: StudioColumnId): boolean {
  return visible[id];
}

/** Subscribes `handler` to be called whenever either column's visibility
 *  changes. Returns an unsubscribe function. */
export function subscribeStudioColumns(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: whether the studio should dock `id`'s column, re-rendering
 *  whenever that changes. */
export function useStudioColumnVisible(id: StudioColumnId): boolean {
  return useSyncExternalStore(subscribeStudioColumns, () => getStudioColumnVisible(id));
}
