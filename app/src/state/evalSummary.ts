/**
 * The notebook's evaluation, in four numbers — ruling R250's status-bar
 * summary: `"12 done, 2 working, 1 error, 4 blocked"`.
 *
 * Lives in `state/` rather than under `Notebook/model/` for the reason
 * `state/decodeProgress.ts` gives for the same move: the shell's status bar
 * renders this, and the shell must not import from a page. The *counting*
 * rule — which cell states count as "working" — is a notebook rule and
 * stays in `Notebook/model/evalSummary.ts`; this module holds the shape the
 * chrome reads and the words it prints.
 *
 * No React, no DOM, no IPC.
 */

/** How the notebook's cells are currently divided. */
export interface EvalSummary {
  /** Cells with a current, clean result. */
  done: number;
  /** Cells fetching, evaluating or rendering right now. */
  working: number;
  /** Cells whose own evaluation failed. */
  error: number;
  /** Cells an upstream failure has stopped from ever running. */
  blocked: number;
}

/** Nothing counted — no workbook open, or a document with no cells. */
export const NO_EVAL_SUMMARY: EvalSummary = { done: 0, working: 0, error: 0, blocked: 0 };

/**
 * The summary's one line, or `null` when there is nothing worth a status
 * item (every count zero — an empty document, or one that is entirely idle
 * with no session selected).
 *
 * **Zeros are omitted, not printed.** A bar reading "12 done, 0 working, 0
 * error, 0 blocked" makes the reader parse four numbers to learn one thing;
 * "12 done" says the same and is read at a glance. The order is fixed —
 * done, working, error, blocked — so the same fact always appears in the
 * same place whichever terms are present.
 */
export function describeEvalSummary(summary: EvalSummary): string | null {
  const parts: string[] = [];
  if (summary.done > 0) parts.push(`${summary.done} done`);
  if (summary.working > 0) parts.push(`${summary.working} working`);
  if (summary.error > 0) parts.push(`${summary.error} error`);
  if (summary.blocked > 0) parts.push(`${summary.blocked} blocked`);

  return parts.length === 0 ? null : parts.join(", ");
}

/** Whether anything in this summary wants the reader's attention — what
 *  gives the status item its alert tone rather than its quiet one. */
export function summaryNeedsAttention(summary: EvalSummary): boolean {
  return summary.error > 0 || summary.blocked > 0;
}
