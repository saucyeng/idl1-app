/**
 * Decides the plain-language note a plain-mounted `js` cell shows in its
 * `JsCellFrame` note slot (L6 Task 21, R66 item 3's follow-on). Pure: every
 * input is a value `Notebook/index.tsx`'s `renderJsCell` already holds at
 * render time. Fixes the rendering gap the 2026-09-06 preview captured — a
 * `js` cell with no session selected reserved `DEFAULT_JS_CELL_HEIGHT_PX`
 * of blank space with no explanation, because the note was previously only
 * ever computed from `sessionDetail`, which is itself `null` whenever
 * `sessionId` is `null` (`model/sessionSpanDriver.ts`'s `runSessionSpan`
 * dispatches both as `null` immediately in that case).
 *
 * Migrated from `sessionId: string | null` to `windowCount: number` (C1
 * §6.1, ruling R111/R115/R117): selection is now a list of windows, not a
 * single session id, so "nothing selected" is `windowCount === 0` rather
 * than `sessionId === null`. `windowCount` is a plain count, not the
 * `Window[]` list itself, because this note only ever distinguishes "zero"
 * from "at least one" -- it has no reason to import the wire `Window` type
 * or hold onto any window's own content.
 *
 * `isFormGenerated` renamed to `hasChannelReference` and `isDeclaredDefinitionFailed`
 * added (ruling R150, `runs/2026-09-03/decisions.md`): `bindingFor` now
 * binds by extracting `channel(...)`/`spectrum(...)` calls rather than
 * requiring the whole cell to match `plotForm.parse` (ruling R148 part 2),
 * so "no note" can no longer mean "not form-generated" -- a hand-written
 * cell that *does* reference a channel must get exactly the same notes a
 * form-generated one does; only a cell with no such calls at all stays
 * silent (that is genuinely custom code, R148's "legitimate state").
 * `isDeclaredDefinitionFailed` closes the gap two of R150's three
 * authoring mistakes shared: an unresolved name that turns out to be a
 * math definition whose own `def_line` errored (`CellDefResult`'s doc
 * comment: a structural problem "keeps it out of `defs` entirely", so it
 * looks exactly like a name the session has never heard of) now says so,
 * instead of the misleading generic "not part of this session" -- the
 * bug R150 filed against `bindingForTime`'s silence, one door further in.
 */

/** Why a `js` cell is plain-mounting with no chart, or `null` when it has a
 *  real binding and nothing needs saying. */
export interface JsCellNote {
  /** The one-line message, shown verbatim in `JsCellFrame`'s note slot
   *  (decision 58: "a one-line message naming the missing thing"). */
  text: string;
  /**
   * Whether decision 58's "Fix" button belongs beside this note.
   *
   * `true` for every note naming a specific reference the author can
   * correct — a failed declared definition, an unknown channel, an
   * axis-less definition. `false` for "no session is selected" (decision
   * 61): there is nothing wrong with the cell, and the fix is the Data
   * tab, not a field in this cell's Properties form. A Fix button there
   * would open a perfectly correct definition and invite the reader to
   * edit it.
   */
  fixable: boolean;
}

/** The note shown when nothing is selected (decision 61). Exported so the
 *  caller and its tests name the one string rather than re-typing it. */
export const NO_SELECTION_NOTE = "No session is selected — choose one in the Data tab.";

/**
 * Decides the note for one `js` cell that did **not** resolve to a chart
 * binding. Pure: every input is a value `Notebook/index.tsx` already holds
 * at render time.
 *
 * **An empty selection is checked first (decision 61.)** It used to be
 * checked last, on the principle that the most specific cause wins. That
 * was wrong once the selection was empty: with no session there are no
 * session channels to resolve against, so `unresolvedName` is set for
 * *every* referenced channel and the cell claimed `Channel "speed" is not
 * part of this session` — naming a session that does not exist, about a
 * reference that is very likely fine, next to a Fix button that would open
 * a correct definition and invite the reader to edit it. Decision 61's
 * rule is that clearing the selection empties everything that depended on
 * it with one honest message; specificity below that point is noise.
 *
 * Below that, the order is unchanged and still most-specific-first.
 *
 * A cell making no channel call at all still gets no note: it does not
 * depend on the selection, and decision 61 empties what "depended on it".
 * Genuinely custom code keeps rendering with nothing selected, as R148
 * ruled.
 */
export function jsCellNote(input: {
  /** `false` when the cell makes no `channel(...)`/`spectrum(...)` call at
   *  all (`extractChannelCalls`/`extractSpectrumCalls` both empty) —
   *  genuine custom code, a legitimate state that gets no note. `true` for
   *  any cell referencing at least one channel, form-generated or
   *  hand-written (ruling R148 part 2 — binding no longer requires the
   *  whole cell to parse, so this note logic must not either). */
  hasChannelReference: boolean;
  /** `AppState.selection.windows.length` (C1 §6.1, ruling R117 — replaces
   *  `AppState.selection.sessionId`; `0` means nothing selected). */
  windowCount: number;
  /** `unresolvedChannelId(...)`'s result, or `null`. */
  unresolvedName: string | null;
  /** True when `unresolvedName` is a known definition with no recorded axis
   *  (the existing `definitionsWithAxis` distinction, R78 Q3(a)). */
  isAxisLessDefinition: boolean;
  /** True when `unresolvedName` is not a session channel and not a
   *  resolvable definition, but is declared as a `def_line` somewhere in
   *  the document (`graphModel.ts`'s `declaredDefinitionNames`) — i.e. its
   *  own math cell's definition is malformed or otherwise failed to
   *  evaluate, rather than the name simply not existing (ruling R150). */
  isDeclaredDefinitionFailed: boolean;
}): JsCellNote | null {
  if (!input.hasChannelReference) return null;

  if (input.windowCount === 0) {
    return { text: NO_SELECTION_NOTE, fixable: false };
  }

  if (input.isAxisLessDefinition) {
    return { text: `Definition "${input.unresolvedName}" has no recorded axis.`, fixable: true };
  }

  if (input.isDeclaredDefinitionFailed) {
    return {
      text: `Definition "${input.unresolvedName}" failed to evaluate — check its math cell for an error.`,
      fixable: true,
    };
  }

  if (input.unresolvedName !== null) {
    return { text: `Channel "${input.unresolvedName}" is not part of this session.`, fixable: true };
  }

  return null;
}

/**
 * Ruling R132 (`runs/2026-09-03/decisions.md`): a non-chart cell (a `math`
 * cell's definition value, a `table` cell's grid, a prose `${…}` span) that
 * reads only the **primary** window's value must say so once more than one
 * window is selected — "the reading stays, the silence does not". Reuses
 * `windowCount` rather than a second channel (same input `jsCellNote`
 * already takes).
 *
 * `null` with zero or one window selected: no marker, byte-identical to
 * today (R127 item 3) — the common case, and the one every existing
 * workbook and test already exercises. With more than one window selected,
 * returns `primaryWindowLabel` (`state/selection.ts`'s `describeWindow`
 * output for the primary window, e.g. `"Silverstone · Lap 2"`) for the
 * caller to render next to the value it names.
 *
 * Designing a per-window *layout* for these cell kinds (a column per
 * window, a row per window, …) is explicitly deferred to the maths lane
 * (R132) — this function only answers "should a label show, and what does
 * it say", not "where".
 */
export function primaryWindowNote(windowCount: number, primaryWindowLabel: string): string | null {
  if (windowCount <= 1) return null;
  return primaryWindowLabel;
}
