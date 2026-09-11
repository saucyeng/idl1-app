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

/**
 * The six ribbon groups, left to right (ruling R225 item 3, replacing
 * R212's own six).
 *
 * The four command groups are `shell/commandTiers.ts`'s `RibbonGroupId` —
 * `panels`, `file`, `library`, `view` — and the two that are not commands
 * at all are `window` (which windows are selected) and `transport` (play,
 * speed, follow mode). The old `columns`/`document`/`actions` trio is gone:
 * `columns` became `panels` under full words, and `document` and `actions`
 * were the two groups whose loose buttons overlapped, now split between
 * `file` and `library` as core buttons with their occasional commands
 * behind a chevron.
 */
export type ToolbarGroupId = "panels" | "file" | "library" | "view" | "window" | "transport";

/** {@link ToolbarGroupId}'s members in rendering order, left to right.
 *  Panels lead, under the activity bar's own column: "what am I looking at"
 *  is read before "what do I do to it". */
export const TOOLBAR_GROUP_ORDER: readonly ToolbarGroupId[] = ["panels", "file", "library", "view", "window", "transport"];

/** The order groups leave the row in as it narrows — right to left, which
 *  is R212's rule unchanged: the view group first, then library, then file,
 *  and the panel toggles last, because a reader who cannot see the columns
 *  cannot get them back. `window` and `transport` are absent because they
 *  never collapse (R212 rule 4). */
export const TOOLBAR_COLLAPSE_ORDER: readonly ToolbarGroupId[] = ["view", "library", "file", "panels"];

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
 *  {@link ToolbarGroupSpec} and {@link withMeasuredGroupWidths}. Sized for
 *  R225 item 3's geometry: a big button is 36 px wide unlabelled and about
 *  64 px with its 11 px label, and a split button adds a 16 px chevron. */
export const NOTEBOOK_TOOLBAR_GROUPS: readonly ToolbarGroupSpec[] = [
  // Notebook · Maths · Code, three big toggle buttons.
  { id: "panels", labelledWidth: 204, compactWidth: 120 },
  // Open ▾ and Save ▾, two split buttons.
  { id: "file", labelledWidth: 166, compactWidth: 110 },
  // Import ▾, one split button.
  { id: "library", labelledWidth: 86, compactWidth: 58 },
  // View ▾, then Paper · Studio, R213's preset picker and Dense.
  { id: "view", labelledWidth: 400, compactWidth: 200 },
  // Session + laps. Never collapses; truncates instead.
  { id: "window", labelledWidth: 160, compactWidth: 96 },
  // Play/pause + speed + follow mode. Never collapses.
  { id: "transport", labelledWidth: 214, compactWidth: 118 },
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
  id: string;
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
    return { id: id as string, width };
  });

  const reserved = layout.overflow.length > 0 ? TOOLBAR_OVERFLOW_WIDTH : 0;
  return packedSpans(natural, availableWidth, TOOLBAR_GROUP_GAP, reserved);
}

/** One item to pack along the row: anything with an id and a natural width
 *  — a whole group, or a single button inside one. */
export interface PackedItem {
  id: string;
  /** px the item occupies at its natural, unshrunk size. */
  width: number;
}

/**
 * `items` packed left to right along a track `availableWidth` CSS pixels
 * wide, with `gap` between neighbours and `reserved` px held back at the
 * right (ruling R225 item 3's root-cause fix).
 *
 * This is the model behind both halves of the overlap bug, and the reason
 * it is one function rather than two. R216 item 4 fixed it between *groups*:
 * a `flex-shrink` box compresses below its contents, the contents paint past
 * the box's right edge, and the next box — which starts where this one ends
 * — is painted over. R225 item 3 fixes the same thing one level down,
 * between *buttons inside a group*, where Save, Export, Create, Rescan, the
 * gesture select and the X-axis select were siblings with the default
 * `flex-shrink: 1` and did exactly that to each other. The fix in the markup
 * is `flex-nowrap` on the container and `shrink-0` on every child; the
 * guarantee that it holds is a test over this function at every width.
 *
 * Excess is taken off the boxes in proportion to their widths, CSS
 * `flex-shrink: 1`'s own rule, while `contentEnd` keeps the natural size.
 * A layout in which no `end` ever falls short of its own `contentEnd` is one
 * that cannot overlap.
 *
 * @param items The boxes to place, in visual order.
 * @param availableWidth The track's inner width, in CSS px.
 * @param gap px between two neighbouring items.
 * @param reserved px held back at the right — the "⋯" trigger, or nothing.
 */
export function packedSpans(
  items: readonly PackedItem[],
  availableWidth: number,
  gap: number,
  reserved = 0,
): ToolbarGroupSpan[] {
  const sum = items.reduce((running, item) => running + item.width, 0);
  const gaps = items.length > 1 ? (items.length - 1) * gap : 0;
  const excess = Math.max(0, sum + gaps + reserved - availableWidth);

  let cursor = 0;
  return items.map((item, index) => {
    const shrunk = sum > 0 ? item.width - (excess * item.width) / sum : item.width;
    const start = cursor;
    const end = start + Math.max(0, shrunk);
    cursor = end + (index < items.length - 1 ? gap : 0);
    return { id: item.id, start, end, contentEnd: start + item.width };
  });
}
