/**
 * Which cell states count as done, working, failed and blocked (ruling
 * R250's status-bar summary). The shape and the wording live in
 * `state/evalSummary.ts`, which the shell reads; this module holds the one
 * rule that is a notebook rule — the classification of a `CellStatus`.
 *
 * Pure.
 */
import { NO_EVAL_SUMMARY, type EvalSummary } from "../../../../state/evalSummary";
import type { CellStatus } from "./cellStatus";

/**
 * Counts `statuses` into an {@link EvalSummary}.
 *
 * `"stale"` counts as **working**: its result is on screen but out of date,
 * and something is on its way to replace it — calling it done would let the
 * bar read "12 done" over a document that is entirely recomputing.
 *
 * `"idle"` and `"queued"` count as **nothing**. Neither is an outcome, and
 * a bar that counted them would report the same document differently
 * depending on how fast the machine was. The summary answers "where has
 * this document got to", and a cell that has not started has not got
 * anywhere.
 */
export function evalSummaryOf(statuses: Iterable<CellStatus>): EvalSummary {
  const summary: EvalSummary = { ...NO_EVAL_SUMMARY };
  for (const status of statuses) {
    switch (status) {
      case "done":
        summary.done += 1;
        break;
      case "fetching":
      case "evaluating":
      case "rendering":
      case "stale":
        summary.working += 1;
        break;
      case "error":
        summary.error += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "idle":
      case "queued":
        break;
    }
  }
  return summary;
}
