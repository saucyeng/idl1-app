/**
 * Pure "layout reducer" (R69's own phrase) over `cellRendered { cellId,
 * heightPx }` events: the host's own record of each js cell's
 * sandbox-reported rendered height, used to size `ChartCell`'s
 * gesture-capturing frame to match the sandbox's actual rendered output
 * (`Notebook/index.tsx`). No React, no DOM, no IPC — a plain immutable map
 * update.
 */

/** One cell's last-reported rendered height, by cell id. */
export type CellHeights = ReadonlyMap<string, number>;

/** The empty state before any `cellRendered` message has arrived for any cell. */
export const initialCellHeights: CellHeights = new Map();

/**
 * Records `heightPx` for `cellId`, replacing any prior value for that
 * cell and leaving every other cell's recorded height untouched. Returns
 * a new map (`state` is never mutated) so a caller can use it directly as
 * `useState`'s setter argument — or `state` itself when the height is
 * unchanged, so React skips the render. A readout redraws every frame and
 * reports the same height each time; a new map per report re-rendered the
 * whole notebook page about 180 times a second with three readouts
 * playing (2026-11-15).
 */
export function recordCellHeight(state: CellHeights, cellId: string, heightPx: number): CellHeights {
  if (state.get(cellId) === heightPx) return state;
  const next = new Map(state);
  next.set(cellId, heightPx);
  return next;
}

/** Drops `cellId`'s recorded height — call when that cell leaves the document (a `setCells` narrowing the cell set). */
export function dropCellHeight(state: CellHeights, cellId: string): CellHeights {
  if (!state.has(cellId)) return state;
  const next = new Map(state);
  next.delete(cellId);
  return next;
}
