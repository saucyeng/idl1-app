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
 */

/** Why a `js` cell is plain-mounting with no chart, or `null` when it has a
 *  real binding and nothing needs saying. The string is shown verbatim in
 *  `JsCellFrame`'s note slot. */
export type JsCellNote = string | null;

/**
 * Decides the note for one `js` cell that did **not** resolve to a chart
 * binding. Pure: every input is a value `Notebook/index.tsx` already holds
 * at render time. Order of causes is fixed and tested — the most specific
 * cause wins, so a cell naming an unknown channel says that rather than
 * the generic no-session line.
 */
export function jsCellNote(input: {
  /** `false` when `plotForm.parse` returned `null` — custom code, which is
   *  a legitimate state and gets no note. */
  isFormGenerated: boolean;
  /** `AppState.selection.sessionId`. */
  sessionId: string | null;
  /** `unresolvedChannelId(...)`'s result, or `null`. */
  unresolvedName: string | null;
  /** True when `unresolvedName` is a known definition with no recorded axis
   *  (the existing `definitionsWithAxis` distinction, R78 Q3(a)). */
  isAxisLessDefinition: boolean;
}): JsCellNote {
  if (!input.isFormGenerated) return null;

  if (input.isAxisLessDefinition) {
    return `Definition "${input.unresolvedName}" has no recorded axis.`;
  }

  if (input.unresolvedName !== null) {
    return `Channel "${input.unresolvedName}" is not part of this session.`;
  }

  if (input.sessionId === null) {
    return "No session is selected — choose one in the Data tab.";
  }

  return null;
}
