import { assignColour, nextWindows, type SelectionModifier, type SelectionWindow } from "../../../state/selection";

/**
 * Computes the next `AppState.selection` when a lap row (`DetailPane`'s
 * `LapTable`, S1 Task 12) is clicked, minting a `{ kind: "lap" }` window for
 * `sessionId`/`lapNumber` and delegating the combination logic to
 * `state/selection.ts`'s `nextWindows` — the same function
 * `sessionRow.ts`'s `sessionRowClicked` uses, so a session and one of its
 * laps combine in one selection exactly as R115 intends (one representation
 * for "a window of time-series data", not a session/lap special case).
 *
 * This is the first caller in the app to mint a lap window (R117 item 7's
 * context): `LapTable` has never had a click handler before this task, which
 * is why the `main_lap_window` indexing defect (fixed in Task 3) sat
 * undetected — nothing exercised it.
 */
export function lapRowClicked(
  current: readonly SelectionWindow[],
  sessionId: string,
  lapNumber: number,
  modifier: SelectionModifier,
): SelectionWindow[] {
  // See `sessionRow.ts`'s `sessionRowClicked` for why "replace" colours
  // against `[]` rather than `current`.
  const colourBase = modifier === "replace" ? [] : current;
  const clicked: SelectionWindow = { sessionId, span: { kind: "lap", lapNumber }, colour: assignColour(colourBase) };
  return nextWindows(current, clicked, modifier);
}
