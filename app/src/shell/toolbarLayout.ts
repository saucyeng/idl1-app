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
 * {@link NOTEBOOK_TOOLBAR_GROUPS} declares a **nominal** pair per group,
 * used only until the row has measured that group for the first time.
 * Ruling R216 item 4: nominal widths on their own were the overlap bug —
 * the presets picker (R213) and the `document` group grew past the numbers
 * declared here, `toolbarLayout` kept reporting "it fits", and the row's
 * flex shrink compressed each group's box below its content so neighbouring
 * groups painted over one another. The row now measures every rendered
 * group with a `ResizeObserver` and feeds the real widths back through
 * {@link withMeasuredGroupWidths}; the nominal pair is the first-frame
 * fallback and nothing more.
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

/** The six groups' nominal footprints — the first-frame fallback only. See
 *  {@link ToolbarGroupSpec} and {@link withMeasuredGroupWidths}. */
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

/** A group's measured footprint in one label state, as the row reports it
 *  (ruling R216 item 4). Both fields are optional because a group is only
 *  ever rendered in one label state at a time: the row learns a group's
 *  labelled width the first time it renders labelled, and its compact width
 *  the first time it renders compact. */
export interface MeasuredGroupWidth {
  /** px measured with text labels showing, or `undefined` if never seen. */
  labelledWidth?: number;
  /** px measured with text labels hidden, or `undefined` if never seen. */
  compactWidth?: number;
}

/**
 * `specs` with every measured width substituted for its nominal one
 * (ruling R216 item 4).
 *
 * Field by field, not spec by spec: a group the row has only ever rendered
 * labelled keeps its nominal *compact* width until it is first seen
 * compact, rather than falling back to nominal for both. A measurement of
 * `0` — what a hidden or not-yet-laid-out element reports — is ignored,
 * because a zero-width group would make every layout "fit" and bring the
 * overlap straight back.
 *
 * Pure: the caller owns the `ResizeObserver` and the map it fills.
 *
 * @param measured Measured widths by group id; missing ids keep their nominal pair.
 * @param specs The groups to adjust; defaults to {@link NOTEBOOK_TOOLBAR_GROUPS}.
 */
export function withMeasuredGroupWidths(
  measured: ReadonlyMap<ToolbarGroupId, MeasuredGroupWidth>,
  specs: readonly ToolbarGroupSpec[] = NOTEBOOK_TOOLBAR_GROUPS,
): ToolbarGroupSpec[] {
  return specs.map((spec) => {
    const seen = measured.get(spec.id);
    if (seen === undefined) return { ...spec };
    const labelledWidth = seen.labelledWidth !== undefined && seen.labelledWidth > 0 ? seen.labelledWidth : spec.labelledWidth;
    const compactWidth = seen.compactWidth !== undefined && seen.compactWidth > 0 ? seen.compactWidth : spec.compactWidth;
    return { id: spec.id, labelledWidth, compactWidth };
  });
}

/**
 * Where one inline group sits on the row, and where its contents actually
 * paint (ruling R216 item 4's regression guard).
 *
 * `start`/`end` bound the group's flex **box**; `contentEnd` is where its
 * contents reach. The two differ only when the row is over-subscribed: a
 * `flex-shrink` box compresses below its content, the content paints past
 * the box's right edge, and the next group's box — which starts where this
 * box ends — is painted over. That is exactly the reported bug, so it is
 * what {@link inlineGroupSpans} models and what the tests assert against.
 */
export interface ToolbarGroupSpan {
  id: ToolbarGroupId;
  /** px from the row's left content edge to the group box's left edge. */
  start: number;
  /** px to the group box's right edge (shrunk, when over-subscribed). */
  end: number;
  /** px to the right edge of the group's *contents*, which never shrink. */
  contentEnd: number;
}

/**
 * The inline groups of `layout` laid out across a row `availableWidth` CSS
 * pixels wide, as the browser's `flex-nowrap` packing would place them.
 *
 * Groups are packed left to right in {@link TOOLBAR_GROUP_ORDER} with
 * {@link TOOLBAR_GROUP_GAP} between them, plus
 * {@link TOOLBAR_OVERFLOW_WIDTH} reserved at the right when `layout` has
 * anything in its overflow menu. When the natural total exceeds
 * `availableWidth`, the excess is taken off the boxes in proportion to
 * their widths — CSS `flex-shrink: 1`'s own rule — while contents keep
 * their natural size.
 *
 * @param layout The decision to place; normally {@link toolbarLayout}'s result.
 * @param availableWidth Measured inner width of the toolbar row, in CSS px.
 * @param specs The group footprints in play; defaults to {@link NOTEBOOK_TOOLBAR_GROUPS}.
 */
export function inlineGroupSpans(
  layout: ToolbarLayout,
  availableWidth: number,
  specs: readonly ToolbarGroupSpec[] = NOTEBOOK_TOOLBAR_GROUPS,
): ToolbarGroupSpan[] {
  const natural = layout.inline.map((id) => {
    const spec = specs.find((s) => s.id === id);
    const width = spec === undefined ? 0 : layout.labelled ? spec.labelledWidth : spec.compactWidth;
    return { id, width };
  });

  const total = rowWidth(layout.inline, specs, layout.labelled, layout.overflow.length > 0);
  const sum = natural.reduce((running, group) => running + group.width, 0);
  const excess = Math.max(0, total - availableWidth);

  let cursor = 0;
  return natural.map((group, index) => {
    const shrunk = sum > 0 ? group.width - (excess * group.width) / sum : group.width;
    const start = cursor;
    const end = start + Math.max(0, shrunk);
    cursor = end + (index < natural.length - 1 ? TOOLBAR_GROUP_GAP : 0);
    return { id: group.id, start, end, contentEnd: start + group.width };
  });
}
