/**
 * The Notebook's "Dense" stacking option (ruling R216 item 3). Isaac,
 * 2026-09-11: "stack plots right on top of each other with 0 px spacing".
 *
 * Dense mode is a *view* preference, per machine, remembered beside
 * `notebookColumns.ts`'s own document and in exactly the same shape — its
 * own small `localStorage` key rather than an edit to `Settings/**`, which
 * belongs to another lane (ruling R81 Q2, the reason `notebookColumns.ts`
 * keeps its own key too).
 *
 * It changes geometry and nothing else. No axis is recomputed, no data is
 * refetched, no chart is redrawn differently: R216 item 3's own wording,
 * "axes still computed per chart, no data change". What it does is remove
 * the gaps, the padding and the per-cell chrome row, and let two stacked
 * time charts read as one continuous x axis by hiding the lower one's top
 * margin.
 *
 * Pure and dependency-free apart from `localStorage` in the two accessors,
 * which are wrapped exactly as `notebookColumns.ts` wraps its own.
 */
import { cellChromeMode, type CellChromeMode } from "./plotChrome";

/** `idl1.<area>.<thing>.v<n>`, the convention `idl1.notebook.columns.v1`
 *  and `idl1.shell.columns.v1` already set. */
const STORAGE_KEY = "idl1.notebook.dense.v1";

/** Dense mode is off until this machine turns it on — R216 item 3: "Off =
 *  today's spacing". */
export const DEFAULT_DENSE = false;

/**
 * This machine's remembered Dense setting. Any stored value that is not the
 * literal `"true"` or `"false"` — a key written by a future build, a
 * half-written value, storage that throws in a private window — reads as
 * {@link DEFAULT_DENSE} rather than throwing or guessing.
 */
export function readDenseMode(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_DENSE;
  } catch {
    return DEFAULT_DENSE;
  }
}

/** Remembers `dense` for this machine. A storage failure is silent: a view
 *  preference that cannot be saved is still a view preference that works
 *  for this session. */
export function writeDenseMode(dense: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, dense ? "true" : "false");
  } catch {
    // No storage (private window, quota). Nothing to report.
  }
}

/** The per-cell spacing a stacking mode uses, in CSS px. */
export interface DenseGeometry {
  /** Vertical gap between two cells. */
  gapPx: number;
  /** The cell's own horizontal padding. */
  paddingXPx: number;
  /** The cell's own vertical padding. */
  paddingYPx: number;
}

/** Today's spacing — `gap-2` / `px-4 py-3` as `CellFrame` has carried it
 *  since UI-10, restated as numbers so the dense case has something to be
 *  the other half of. */
export const LOOSE_GEOMETRY: DenseGeometry = { gapPx: 8, paddingXPx: 16, paddingYPx: 12 };

/** R216 item 3's own numbers: "cell gap 0 px, cell padding 0". */
export const DENSE_GEOMETRY: DenseGeometry = { gapPx: 0, paddingXPx: 0, paddingYPx: 0 };

/** The geometry for a stacking mode. */
export function denseGeometry(dense: boolean): DenseGeometry {
  return dense ? DENSE_GEOMETRY : LOOSE_GEOMETRY;
}

/**
 * Which chrome a cell gets in a stacking mode.
 *
 * Dense is "chrome overlay-only" (R216 item 3), so *every* kind overlays,
 * including the `math` and `table` cells that keep their R210 band in the
 * loose mode — a band is a row, and dense mode's whole claim is that there
 * are no rows between the outputs.
 *
 * @param dense Whether dense stacking is on.
 * @param kind A `ScannedCell.kind`.
 */
export function denseChromeMode(dense: boolean, kind: string): CellChromeMode {
  return dense ? "overlay" : cellChromeMode(kind);
}

/**
 * Whether the cell at `index` should hide its own top margin so that it
 * reads as sharing the x axis with the cell above it (ruling R216 item 3:
 * "adjacent time-series charts share their x-axis visually (the lower chart
 * hides its top margin)").
 *
 * Only in dense mode, only for a chart under a chart: two `js` cells in a
 * row. A chart under a table, or the first cell in the document, keeps its
 * margin — there is no axis above it to continue. Nothing here changes what
 * either chart computes; both still draw their own axes from their own
 * data, and this only removes the white space between them.
 *
 * @param kinds Every cell's kind, in document order.
 * @param index The cell being drawn.
 * @param dense Whether dense stacking is on.
 */
export function sharesXAxisAbove(kinds: readonly string[], index: number, dense: boolean): boolean {
  if (!dense || index <= 0) return false;
  return kinds[index] === "js" && kinds[index - 1] === "js";
}
