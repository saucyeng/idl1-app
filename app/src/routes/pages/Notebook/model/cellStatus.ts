/**
 * Per-cell evaluation status, Jupyter-style (ruling R210). Each notebook
 * cell reports its own state and lands its own result; the notebook never
 * shows one page-level spinner standing in for all of them.
 *
 * Pure: the caller (`Notebook/index.tsx`) reads the signals this module's
 * inputs describe out of `model/workbookState.ts` and hands the answer to
 * `components/CellFrame.tsx`, which renders it and nothing else.
 */

/**
 * One cell's evaluation state.
 *
 * - `"queued"` — this cell has never produced output and no evaluation is
 *   running yet.
 * - `"evaluating"` — this cell has never produced output and the
 *   evaluation that will give it one is in flight now.
 * - `"stale"` — this cell *has* a result on screen, and that result
 *   predates the document's latest edit. Decision 59's own state: the old
 *   output stays mounted, greyed, under a spinner until the new one
 *   replaces it. Distinct from `"evaluating"` precisely because there is
 *   something to grey — an evaluating-from-scratch cell has nothing on
 *   screen to keep, so greying its empty box would say "this data is old"
 *   about data that has never existed.
 * - `"settled"` — the result on screen is current and clean.
 * - `"error"` — the current result is an error.
 */
export type CellStatus = "queued" | "evaluating" | "stale" | "settled" | "error";

/** The signals one cell's {@link cellStatus} is decided from. */
export interface CellStatusInputs {
  /**
   * Whether a result for this cell has landed from any evaluation
   * (`Notebook/index.tsx`'s `primaryOutputs.has(cellId)`). `false` means
   * this cell has never produced output — a freshly opened workbook before
   * its first `eval_workbook` round trip, or a cell added since.
   */
  hasOutput: boolean;
  /**
   * Whether the landed result predates the document's latest edit —
   * `model/workbookState.ts`'s `isWindowStale`, decision 59's one
   * definition of staleness. Meaningless (and ignored) when `hasOutput` is
   * `false`, since there is no result to be out of date.
   *
   * This, not `WorkbookState.dirtyCellIds`, is the "needs re-evaluating"
   * signal: `dirtyCellIds` is cleared on a successful *save*, not on an
   * evaluation, so it stays set long after the cell has re-evaluated and
   * would pin every edited cell to `"queued"` for the rest of the session.
   */
  stale: boolean;
  /**
   * Whether an `eval_workbook` round trip is in flight right now
   * (`Notebook/index.tsx`'s in-flight count). The evaluator runs the whole
   * workbook per call rather than one cell at a time, so this is a
   * document-level signal — what makes the status per-cell is that only a
   * cell actually waiting on a result (`hasOutput === false` or `stale`)
   * reads it as `"evaluating"`; a cell whose result is already current
   * stays `"settled"` while its neighbours re-run.
   */
  evalInFlight: boolean;
  /**
   * Whether the current result for this cell is an error — a sandbox
   * render error, a failed FFT fetch, or a `CellOutput` carrying errors
   * (`Notebook/index.tsx`'s `cellErrorMessage` is the matching message).
   */
  hasError: boolean;
}

/**
 * Decides one cell's {@link CellStatus}.
 *
 * A cell waiting on a result splits on whether it has one to keep.
 *
 * With a previous result (`hasOutput`, made out of date by `stale`) the
 * answer is `"stale"` whether or not a round trip is in flight yet: the
 * picture decision 59 asks for — the old output, greyed, under a spinner —
 * is the same during the edit debounce as it is during the evaluation, and
 * a cell that flickered between two waiting pictures a few hundred
 * milliseconds apart would be reporting the evaluator's scheduling rather
 * than anything the reader can act on.
 *
 * With no previous result the cell is `"evaluating"` while a round trip is
 * in flight and `"queued"` otherwise (the edit-debounce window, or a
 * notebook whose route is hidden so evaluation is suppressed).
 *
 * Waiting outranks `"error"`: a cell whose previous run failed and which is
 * now re-running reports the re-run, not the superseded failure. The error
 * text itself stays on screen underneath either way — `CellFrame` renders
 * it from its own `error` prop, so a recomputing cell greys over its last
 * result rather than blanking it (decision 59).
 *
 * @param inputs This cell's signals — see {@link CellStatusInputs}.
 */
export function cellStatus(inputs: CellStatusInputs): CellStatus {
  if (!inputs.hasOutput) return inputs.evalInFlight ? "evaluating" : "queued";
  if (inputs.stale) return "stale";
  if (inputs.hasError) return "error";

  return "settled";
}

/** Whether {@link CellStatus} means this cell is waiting on a result — the
 *  states `CellFrame` shows a spinner for. Both waiting-with-an-old-result
 *  (`"stale"`) and waiting-with-nothing (`"evaluating"`) spin; `"queued"`
 *  does not, since no evaluation is actually running to spin for. */
export function isCellBusy(status: CellStatus): boolean {
  return status === "evaluating" || status === "stale";
}

/**
 * Whether {@link CellStatus} means there is a previous result on screen
 * that the pending evaluation will replace — the one state `CellFrame`
 * washes grey (decision 59: "greyed with a spinner over it"). `false` for
 * `"evaluating"`, which spins over nothing and so has nothing to grey.
 *
 * Separate from {@link isCellBusy} because the two drive different pixels:
 * `isCellBusy` decides whether the spinner is drawn at all, this decides
 * whether the wash behind it is drawn.
 */
export function isCellStale(status: CellStatus): boolean {
  return status === "stale";
}
