import { useSyncExternalStore } from "react";

import { NO_EVAL_SUMMARY, type EvalSummary } from "../state/evalSummary";

/**
 * The notebook's evaluation summary, carried out to the status bar (ruling
 * R250), and the status item's request to open the maths map.
 *
 * Same shape and same reasoning as `shell/memoryBudget.ts`: the number is
 * derived by the page that owns it, published as it changes, and read by
 * the chrome through `useSyncExternalStore`. It is **not** a subscription
 * the shell could make for itself the way `shell/decodeStatus.ts` is — a
 * decode is reported by the engine and can be started by any route, while
 * "how far has this workbook got" only exists inside the open notebook.
 *
 * Publishing is **change-gated**: the page recomputes the summary on every
 * render (it is four integers over a map it already holds), but only a
 * changed count notifies, so a cursor tick or a pan re-renders the status
 * bar not at all.
 */

let summary: EvalSummary = NO_EVAL_SUMMARY;

const listeners = new Set<() => void>();

/** Whether two summaries hold the same four counts. */
function same(a: EvalSummary, b: EvalSummary): boolean {
  return a.done === b.done && a.working === b.working && a.error === b.error && a.blocked === b.blocked;
}

/**
 * Publishes the notebook's current summary. A summary equal to the one
 * already held notifies nobody — see this module's doc comment.
 *
 * @param next The counts (`Notebook/model/evalSummary.ts`'s
 *   `evalSummaryOf`).
 */
export function publishEvalSummary(next: EvalSummary): void {
  if (same(summary, next)) return;
  summary = next;
  for (const listener of listeners) listener();
}

/** Clears the summary — what a page calls as it unmounts, so the bar does
 *  not keep reporting a closed workbook's counts. */
export function clearEvalSummary(): void {
  publishEvalSummary(NO_EVAL_SUMMARY);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current summary, re-rendering the caller when any count changes. */
export function useEvalSummary(): EvalSummary {
  return useSyncExternalStore(subscribe, () => summary, () => summary);
}

/**
 * The "open the maths map" request the status item raises and the notebook
 * answers (ruling R250: "a status-bar summary … that opens the map").
 *
 * A monotonic counter rather than a boolean: two clicks in a row are two
 * requests, and a boolean would have to be reset by the listener, which is
 * the sentinel shape this repo's review guidance keeps catching. The page
 * reacts to the number changing and never writes it back.
 */
let openMathsRequests = 0;

const openMathsListeners = new Set<() => void>();

/** Raises a request to open the maths map. */
export function requestOpenMaths(): void {
  openMathsRequests += 1;
  for (const listener of openMathsListeners) listener();
}

function subscribeOpenMathsStore(listener: () => void): () => void {
  openMathsListeners.add(listener);
  return () => openMathsListeners.delete(listener);
}

/** The request count, for a page to react to changes in. */
export function useOpenMathsRequests(): number {
  return useSyncExternalStore(subscribeOpenMathsStore, () => openMathsRequests, () => openMathsRequests);
}
