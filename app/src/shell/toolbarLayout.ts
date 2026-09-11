/**
 * Which Notebook-toolbar groups fit on one row at a given width (ruling
 * R212 item 4). Isaac, 2026-09-11: the old toolbar was "two rows tall
 * despite not having tools all the way across, then the 'more' button just
 * makes it scrollable, ridiculous all around".
 *
 * The rules this module encodes, and nothing else:
 *
 * 1. **One row, never wrapping, never scrolling.** There is no width at
 *    which this function reports a second line — it reports a smaller row.
 * 2. **Labels drop before groups do.** The first thing tried when the
 *    labelled row does not fit is the same six groups with their 11 px text
 *    labels hidden; only if *that* still does not fit does a group leave
 *    the row (R212: "at the tightest width labels drop before groups do").
 * 3. **A group collapses whole**, never half of it, and always from the
 *    right ({@link TOOLBAR_COLLAPSE_ORDER}) — actions first, then the
 *    workbook/worksheet group, then the view register, then the column
 *    toggles.
 * 4. **The window chip and the transport never collapse** (R212). If even
 *    they do not fit, they stay and the row truncates its own text — a
 *    reader must always be able to see what is selected and hit play.
 *
 * Pure and dependency-free (`notebookColumns.ts`'s pattern): no `react`
 * import, no DOM, nothing vitest's `node` environment cannot resolve. The
 * caller measures the row with a `ResizeObserver` (R212: "measure with a
 * ResizeObserver on the row, not window width") and hands the width here.
 */

/** The six toolbar groups, left to right (R212 item 4's own order, with
 *  `document` — the workbook picker and worksheet tabs — placed between the
 *  column toggles and the view register; R212 names the other five and
 *  leaves this one, which the toolbar already carried, unplaced). */
export type ToolbarGroupId = "columns" | "document" | "view" | "window" | "transport" | "actions";

/** {@link ToolbarGroupId}'s members in rendering order, left to right. */
export const TOOLBAR_GROUP_ORDER: readonly ToolbarGroupId[] = ["columns", "document", "view", "window", "transport", "actions"];

/** The order groups leave the row in as it narrows — right to left, as
 *  R212 states it: "actions first, then view, then column toggles".
 *  `document` sits between `view` and `columns` for the same reason it sits
 *  between them on the row. `window` and `transport` are absent because
 *  they never collapse. */
export const TOOLBAR_COLLAPSE_ORDER: readonly ToolbarGroupId[] = ["actions", "view", "document", "columns"];

/**
 * One group's two footprints, in CSS pixels at the `--nb-*` density scale
 * (`tokens.css`): what it occupies with its 11 px text labels showing, and
 * what it occupies once labels are hidden and only icons, values and the
 * chips' own text remain.
 *
 * These are **nominal** widths, declared here rather than measured per
 * group, and deliberately a touch generous: the row is `flex-nowrap` with
 * `overflow-hidden` and truncating text, so an over-estimate costs a little
 * empty space at the right and an under-estimate truncates the window
 * chip's session name — neither wraps the row or brings back a scrollbar,
 * which are the two failures R212 exists to remove. One place to tune.
 */
export interface ToolbarGroupSpec {
  id: ToolbarGroupId;
  /** px occupied with text labels showing. */
  labelledWidth: number;
  /** px occupied with text labels hidden. */
  compactWidth: number;
}

/** Gap between two groups, including the hairline divider drawn between
 *  them — `--nb-gap` either side of a 1 px rule. */
export const TOOLBAR_GROUP_GAP = 13;

/** The "⋯" overflow trigger's own footprint, gap included — charged only
 *  when at least one group has actually collapsed into it. */
export const TOOLBAR_OVERFLOW_WIDTH = 22 + TOOLBAR_GROUP_GAP;

/** The six groups' nominal footprints. See {@link ToolbarGroupSpec} on why
 *  these are declared rather than measured. */
export const NOTEBOOK_TOOLBAR_GROUPS: readonly ToolbarGroupSpec[] = [
  // Graph · Properties · Cells, as a segmented toggle group.
  { id: "columns", labelledWidth: 168, compactWidth: 72 },
  // Workbook picker + worksheet tabs + "+".
  { id: "document", labelledWidth: 244, compactWidth: 152 },
  // Paper · Studio, then R213's four-way layout preset picker.
  { id: "view", labelledWidth: 356, compactWidth: 152 },
  // Session + laps. Never collapses; truncates instead.
  { id: "window", labelledWidth: 160, compactWidth: 96 },
  // Play/pause + speed + follow mode. Never collapses.
  { id: "transport", labelledWidth: 214, compactWidth: 118 },
  // Save · Export report · New workbook · Rescan · gesture map · X axis.
  { id: "actions", labelledWidth: 352, compactWidth: 148 },
];

/** What {@link toolbarLayout} decides for one measured row width. */
export interface ToolbarLayout {
  /** True while every inline group still shows its 11 px text labels. */
  labelled: boolean;
  /** The groups staying on the row, in {@link TOOLBAR_GROUP_ORDER}. */
  inline: ToolbarGroupId[];
  /** The groups that collapsed whole into the "⋯" menu, in the order they
   *  left the row ({@link TOOLBAR_COLLAPSE_ORDER}). Empty means no menu is
   *  rendered at all — there is no "⋯" button with nothing behind it. */
  overflow: ToolbarGroupId[];
}

/** Total px `ids` occupy at the given label state, gaps between them and
 *  the overflow trigger (when `withOverflow`) included. */
function rowWidth(ids: readonly ToolbarGroupId[], specs: readonly ToolbarGroupSpec[], labelled: boolean, withOverflow: boolean): number {
  const sum = ids.reduce((total, id) => {
    const spec = specs.find((s) => s.id === id);
    if (spec === undefined) return total;
    return total + (labelled ? spec.labelledWidth : spec.compactWidth);
  }, 0);
  const gaps = ids.length > 1 ? (ids.length - 1) * TOOLBAR_GROUP_GAP : 0;
  return sum + gaps + (withOverflow ? TOOLBAR_OVERFLOW_WIDTH : 0);
}

/**
 * The one-row layout for a toolbar `availableWidth` CSS pixels wide.
 *
 * `availableWidth` is the measured inner width of the row itself, not the
 * window's (R212). A width of `0` — what a `ResizeObserver` reports for one
 * frame before first layout, and what a hidden row reports forever — yields
 * the tightest layout rather than an empty one: the two non-collapsing
 * groups, unlabelled. The row is never blank and never wrong-by-omission
 * while it waits for a real measurement.
 *
 * @param availableWidth Measured inner width of the toolbar row, in CSS px.
 * @param specs The groups to lay out; defaults to {@link NOTEBOOK_TOOLBAR_GROUPS}.
 */
export function toolbarLayout(availableWidth: number, specs: readonly ToolbarGroupSpec[] = NOTEBOOK_TOOLBAR_GROUPS): ToolbarLayout {
  const all = TOOLBAR_GROUP_ORDER.filter((id) => specs.some((s) => s.id === id));

  // Rule 2, first half: everything, labels showing.
  if (rowWidth(all, specs, true, false) <= availableWidth) {
    return { labelled: true, inline: [...all], overflow: [] };
  }

  // Rule 2, second half: everything, labels dropped. From here on the row
  // is unlabelled — a group never leaves while labels are still showing.
  if (rowWidth(all, specs, false, false) <= availableWidth) {
    return { labelled: false, inline: [...all], overflow: [] };
  }

  // Rule 3: collapse whole groups from the right until the row fits.
  const overflow: ToolbarGroupId[] = [];
  for (const id of TOOLBAR_COLLAPSE_ORDER) {
    if (!all.includes(id)) continue;
    overflow.push(id);
    const inline = all.filter((candidate) => !overflow.includes(candidate));
    if (rowWidth(inline, specs, false, true) <= availableWidth) {
      return { labelled: false, inline, overflow };
    }
  }

  // Rule 4: nothing collapsible is left. The window chip and the transport
  // stay and the row truncates its own text rather than hiding either.
  return { labelled: false, inline: all.filter((id) => !overflow.includes(id)), overflow };
}
