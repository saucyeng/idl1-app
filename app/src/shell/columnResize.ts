import { COLUMN_IDS, type ColumnId, type ColumnPrefs } from "./columnPrefs";

/** Whether a resized panel's pixel width counts as "collapsed" for
 *  {@link ColumnPrefs.collapsed} bookkeeping — a few pixels of slop below
 *  the column's own collapsed target, since drag-to-collapse rarely lands
 *  on exactly zero. */
export const COLLAPSED_THRESHOLD_PX = 4;

/** The library's per-panel pixel sizes as of the moment a resize gesture
 *  settled (pointer released, or a resize key pressed) — a snapshot, not a
 *  stream, so a caller only needs to hold "the latest value per column" in
 *  a ref during the gesture and hand that snapshot here once. Columns that
 *  did not report during the gesture (or ever) are simply absent. */
export type SettledColumnSizes = Partial<Record<ColumnId, number>>;

/** Decides the `ColumnPrefs` to persist when a resize gesture settles,
 *  given the previous prefs and the settled per-column pixel sizes.
 *
 * This is the only place that decides *whether* a size becomes a write:
 * called once per settle (never per drag tick), it folds every column's
 * settled size into `widths` and recomputes `collapsed` from the
 * {@link COLLAPSED_THRESHOLD_PX} crossing — so a collapse is recorded once,
 * at settle, rather than once per tick while the pointer crosses the
 * threshold. `output` is never collapsible and is excluded from
 * `collapsed` regardless of its settled size. Columns absent from `sizes`
 * keep their previous width and collapsed membership. */
export function decideSettledColumnPrefs(prefs: ColumnPrefs, sizes: SettledColumnSizes): ColumnPrefs {
  const widths = { ...prefs.widths };
  const collapsedSet = new Set(prefs.collapsed);

  for (const id of COLUMN_IDS) {
    const inPixels = sizes[id];
    if (inPixels === undefined) continue;

    widths[id] = Math.round(inPixels);

    if (id === "output") continue;
    if (inPixels <= COLLAPSED_THRESHOLD_PX) {
      collapsedSet.add(id);
    } else {
      collapsedSet.delete(id);
    }
  }

  const collapsed = COLUMN_IDS.filter((id) => collapsedSet.has(id));
  return { ...prefs, widths, collapsed };
}
