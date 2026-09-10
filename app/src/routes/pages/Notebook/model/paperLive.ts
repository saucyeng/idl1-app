/**
 * What the paper view should show right now (ruling R184, L9-PAPER-PLAN
 * task 5). Paper is **live** where the printed report is one-shot: the
 * report is built once, on a button press, from an evaluation the user
 * waited for, while paper is rebuilt as the workbook re-evaluates
 * underneath it. That difference is the whole of this module.
 *
 * The failure it exists to prevent: a phone that blanks its content, or
 * flashes half a document, every time an edit or a new lap selection
 * restarts evaluation. `buildReportDocument` is total — handed a
 * mid-evaluation state it happily returns a document in which the pending
 * windows are absences — so nothing *errors*; the reader simply watches
 * their laps disappear and come back. Paper instead keeps the last good
 * document on screen until a complete one is ready, which is what
 * "keep-last" below means.
 *
 * Pure decision logic, deliberately not a hook: `Notebook/index.tsx`
 * gathers the counts (it owns the per-window eval map and the generation
 * counter) and this module decides, so the rule is testable with no React
 * and no DOM.
 */

/** What the caller should do with paper this render.
 *
 *  - `rebuild` — every selected window has a current result; build a fresh
 *    document from it and show that.
 *  - `keep-last` — evaluation is in flight and a previously built document
 *    is still held; keep showing it rather than blanking or half-filling
 *    the page.
 *  - `empty` — there is nothing to show and nothing to keep: no workbook
 *    open, or the first evaluation of this workbook has not finished yet.
 */
export type PaperLiveDecision = "rebuild" | "keep-last" | "empty";

/** Everything {@link paperLiveDecision} reads, gathered by the caller. */
export interface PaperLiveInput {
  /** Whether a workbook is open with its markdown loaded — false while a
   *  notebook is opening, or with none selected. */
  readonly workbookReady: boolean;
  /** How many windows are selected. Zero is a legitimate state (decision
   *  48: "nothing selected" evaluates to an empty result), not an error. */
  readonly windowCount: number;
  /** How many of those windows have a result — `ok` or `error` — at the
   *  current evaluation generation. A window whose stored result predates
   *  the document's latest edit (`workbookState.ts`'s `isWindowStale`) is
   *  **not** counted: showing it would be showing a number for code that
   *  has since changed. */
  readonly settledWindowCount: number;
  /** Whether the caller is holding a paper document built by an earlier
   *  `rebuild`. */
  readonly hasLastDocument: boolean;
}

/**
 * Decides what paper shows this render.
 *
 * With no workbook there is nothing to show and nothing to keep, whatever
 * was on screen before — a closed workbook's laps must not linger.
 * Otherwise a complete, current evaluation rebuilds; an incomplete one
 * keeps the last good document, or shows nothing if this is the first
 * evaluation and there is no last good document yet.
 *
 * Zero selected windows counts as complete (`0 === 0`): that is a real,
 * settled state — the document that comes out has no window sections, and
 * showing it is correct, not a blank caused by waiting.
 *
 * @param input - This render's counts.
 */
export function paperLiveDecision(input: PaperLiveInput): PaperLiveDecision {
  if (!input.workbookReady) return "empty";
  if (input.settledWindowCount >= input.windowCount) return "rebuild";
  return input.hasLastDocument ? "keep-last" : "empty";
}
