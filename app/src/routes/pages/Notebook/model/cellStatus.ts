/**
 * Per-cell evaluation status, Jupyter-style (ruling R210, widened by ruling
 * R250). Each notebook cell reports its own state and lands its own result;
 * the notebook never shows one page-level spinner standing in for all of
 * them, and — R250 — never shows a cell with no state at all.
 *
 * Isaac, 2026-09-20: "right now it's kind of just blank charts and i dont
 * know what's going on ... i'm only seeing it green after it's calculated,
 * not the progress before." The five states this module used to hold could
 * not say what a cell was waiting *for*: the decode fraction reached the
 * frame as a separate prop and only changed the glyph's shape, an upstream
 * failure was invisible, and a cell with no output yet rendered a one-line
 * ellipsis with a 12 px spinner in its corner. The nine states below are
 * the vocabulary the frame and the maths map both draw from.
 *
 * Pure: the caller (`Notebook/index.tsx`) reads the signals this module's
 * inputs describe out of `model/workbookState.ts`, `state/decodeProgress.ts`
 * and `model/blockedCells.ts`, and hands the answer to
 * `components/CellFrame.tsx`, which renders it and nothing else.
 */
import type { BlockedBy } from "./blockedCells";

/**
 * One cell's evaluation state (ruling R250's nine).
 *
 * - `"idle"` — no window is selected, so nothing is going to run and this
 *   cell has no result. Distinct from `"queued"`, which promises work.
 * - `"queued"` — this cell has no output and no evaluation is running yet.
 * - `"fetching"` — at least one channel this cell binds is being decoded
 *   out of `data.parquet` right now (ruling R221's fraction). The common
 *   case for a chart: the engine returns in milliseconds, the decode takes
 *   seconds to tens of seconds.
 * - `"evaluating"` — this cell has no output and the evaluation that will
 *   give it one is in flight now.
 * - `"rendering"` — this cell's `CellOutput` has landed and its sandbox has
 *   not yet reported the drawn result (`cellRendered`).
 * - `"blocked"` — an upstream cell failed, so this one is never going to
 *   run. Derived from the dependency graph, never reported by the engine;
 *   {@link CellStatusInputs.blockedBy} names the cause.
 * - `"stale"` — this cell *has* a result on screen, and that result
 *   predates the document's latest edit. Decision 59's own state: the old
 *   output stays mounted, greyed, under a spinner until the new one
 *   replaces it. Distinct from `"evaluating"` precisely because there is
 *   something to grey — an evaluating-from-scratch cell has nothing on
 *   screen to keep, so greying its empty box would say "this data is old"
 *   about data that has never existed.
 * - `"done"` — the result on screen is current and clean. (R250's spelling
 *   of what was `"settled"` before this ruling; one state, one name.)
 * - `"error"` — the current result is an error.
 */
export type CellStatus =
  | "idle"
  | "queued"
  | "fetching"
  | "evaluating"
  | "rendering"
  | "blocked"
  | "stale"
  | "done"
  | "error";

/** Every {@link CellStatus}, in the precedence order {@link cellStatus}
 *  checks them. Exported so a test enumerates the set rather than
 *  re-typing it, and so a new state cannot be added without a test that
 *  iterates this array seeing it. */
export const CELL_STATUSES: readonly CellStatus[] = [
  "blocked",
  "stale",
  "error",
  "fetching",
  "evaluating",
  "rendering",
  "idle",
  "queued",
  "done",
];

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
   * stays `"done"` while its neighbours re-run.
   *
   * It narrows to this cell's own evaluation once the C3 §3.4 progress
   * `Channel` lands (the R250 spec's §4); nothing else about this module
   * changes when it does.
   */
  evalInFlight: boolean;
  /**
   * Whether the current result for this cell is an error — a sandbox
   * render error, a failed FFT fetch, or a `CellOutput` carrying errors
   * (`Notebook/index.tsx`'s `cellErrorMessage` is the matching message).
   */
  hasError: boolean;
  /**
   * How far through its channel decodes this cell is, `[0, 1]`, or `null`
   * when none of its channels is being reported
   * (`state/decodeProgress.ts`'s `cellDecodeFraction`, ruling R221).
   *
   * Non-`null` is what makes a cell `"fetching"`. `null` is not the same as
   * `0`: a decode fast enough to finish inside ~200 ms never reports at
   * all, and calling such a cell "fetching 0 %" forever would be worse than
   * not naming the state.
   */
  decodeFraction: number | null;
  /**
   * The upstream failure that means this cell will never run
   * (`model/blockedCells.ts`), or `null` when nothing upstream has failed.
   */
  blockedBy: BlockedBy | null;
  /**
   * Whether this cell's output has landed but its sandbox has not yet
   * reported a rendered height — a `js` cell between the engine's answer
   * and the picture. `false` for every non-`js` kind, which renders
   * synchronously in the host and has no such gap.
   */
  awaitingRender: boolean;
  /**
   * Whether any window is selected (`AppState.selection.windows.length >
   * 0`). `false` makes a result-less cell `"idle"` rather than `"queued"`:
   * nothing is going to run, and a queue that never drains is the spinner
   * that spins forever, one door along.
   */
  hasSelection: boolean;
}

/**
 * Decides one cell's {@link CellStatus}.
 *
 * The precedence, first match wins, is {@link CELL_STATUSES}' own order and
 * the R250 spec's §2.2:
 *
 * 1. `"blocked"` outranks everything — a blocked cell's own "queued" is a
 *    lie, since it is never going to run.
 * 2. `"stale"` outranks `"error"` (decision 59: a failed cell that is
 *    re-running reports the re-run, not the superseded failure) and
 *    outranks `"fetching"` (so a cell keeping a greyed previous result does
 *    not flicker between two waiting pictures mid-decode).
 * 3. `"error"` outranks `"fetching"`, so a determinate ring can never hide
 *    a cross.
 * 4. `"fetching"` outranks `"evaluating"`: it is the more specific of the
 *    two, and the only one with a real fraction behind it.
 * 5. `"idle"` outranks `"queued"` for a cell with no result, because with
 *    no selection there is no work to queue.
 *
 * With the four R250 inputs at their resting values (`decodeFraction:
 * null`, `blockedBy: null`, `awaitingRender: false`, `hasSelection: true`)
 * this reduces exactly to the five-state function that preceded the ruling.
 *
 * @param inputs This cell's signals — see {@link CellStatusInputs}.
 */
export function cellStatus(inputs: CellStatusInputs): CellStatus {
  if (inputs.blockedBy !== null) return "blocked";
  if (inputs.hasOutput && inputs.stale) return "stale";
  if (inputs.hasError) return "error";
  if (inputs.decodeFraction !== null) return "fetching";
  if (!inputs.hasOutput) {
    if (inputs.evalInFlight) return "evaluating";
    return inputs.hasSelection ? "queued" : "idle";
  }
  if (inputs.awaitingRender) return "rendering";

  return "done";
}

/**
 * Whether {@link CellStatus} means this cell has work outstanding — the
 * states that draw a labelled skeleton or spinner rather than a result.
 *
 * `"idle"` is not one: nothing is running and nothing is going to, so a
 * spinner there would be a lie. `"blocked"` is not one either — a blocked
 * cell is finished, in the only sense that matters to the reader — and it
 * draws its own dimmed slot with its "blocked by" line instead.
 */
export function isCellWaiting(status: CellStatus): boolean {
  return status === "queued" || status === "fetching" || status === "evaluating" || status === "rendering" || status === "stale";
}

/**
 * Whether {@link CellStatus} means there is a previous result on screen
 * that the pending evaluation will replace — the one state `CellFrame`
 * washes grey (decision 59: "greyed with a spinner over it"). `false` for
 * `"evaluating"`, which spins over nothing and so has nothing to grey.
 *
 * Separate from {@link isCellWaiting} because the two drive different
 * pixels: `isCellWaiting` decides whether the state overlay is drawn at
 * all, this decides whether the wash behind it is drawn.
 */
export function isCellStale(status: CellStatus): boolean {
  return status === "stale";
}

/**
 * Whether {@link CellStatus} means this cell has nothing of its own on
 * screen yet, so the frame must reserve a slot the size the output will be
 * rather than collapsing to one line (the R250 spec's §1.1 defect: a cell
 * with no output rendered a one-line ellipsis, and the whole document
 * jumped when the first evaluation landed).
 *
 * `"stale"` is absent on purpose: a stale cell has its previous output
 * mounted underneath and needs no reserved slot.
 */
export function needsPendingSlot(status: CellStatus): boolean {
  return status === "queued" || status === "fetching" || status === "evaluating" || status === "idle" || status === "blocked";
}
