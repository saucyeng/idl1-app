/**
 * Pure decision logic for the maths graph as a view of the open workbook
 * (Task 10) — derives `GraphCanvas.tsx`'s `sessionDetails`/`outputs` props
 * from state `Notebook/index.tsx` already holds, so that derivation is
 * unit-tested rather than living inline in a 2000-line component. No
 * React, no IPC.
 */

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellOutput } from "../../../../ipc/workbook";
import { windowKey, type SelectionWindow } from "../../../../state/selection";
import { NO_WINDOW_KEY, type WindowEvalState } from "./workbookState";

/**
 * Maps the current selection's resolved `SessionDetail`s (`Notebook/
 * index.tsx`'s `sessionDetailsByWindow`, keyed by window) to a session-id-
 * keyed map — decision 44's grey-vs-red split (`graphStatus.ts`) needs a
 * channel catalog per *session*, not per window, since two windows can
 * name the same session. A window whose detail hasn't resolved yet (or
 * resolved to `null`, `sessionSpanDriver.ts`'s own convention for "not
 * yet/failed") contributes no entry — `graphStatus.ts`'s own contract
 * already treats a missing session as "not yet loaded", never as "this
 * session has no channels".
 */
export function sessionDetailsBySessionId(
  windows: readonly SelectionWindow[],
  detailsByWindow: ReadonlyMap<string, SessionDetail | null>
): Map<string, SessionDetail> {
  const result = new Map<string, SessionDetail>();
  for (const w of windows) {
    const detail = detailsByWindow.get(windowKey(w));
    if (detail !== null && detail !== undefined) result.set(w.sessionId, detail);
  }
  return result;
}

/**
 * The primary window's `CellOutput[]` — `GraphCanvas.tsx`'s `outputs` prop
 * (its own doc comment: "one representative window", §3.7.4 defines one
 * shape per node, not one per selected window). `[]` when nothing is
 * selected, the primary window hasn't evaluated yet, or its whole
 * evaluation call failed (`kind: "error"` — a `CellOutput[]` from a failed
 * call would be stale/absent data, ledger R22's own rule for a `WindowEval`
 * union member).
 */
export function primaryWindowOutputs(windows: ReadonlyMap<string, WindowEvalState>, primaryWindow: SelectionWindow | null): CellOutput[] {
  const key = primaryWindow !== null ? windowKey(primaryWindow) : NO_WINDOW_KEY;
  const state = windows.get(key);
  if (state === undefined || state.kind !== "ok") return [];
  return Array.from(state.outputs.values());
}
