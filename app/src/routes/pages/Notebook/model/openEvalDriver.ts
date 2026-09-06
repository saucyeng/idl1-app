/**
 * Pure, unit-tested driver for the open → read → eval sequence
 * `Notebook/index.tsx` runs on mount and whenever the selected session
 * changes — the review brief's tightened IPC-effects rule
 * (`runs/2026-09-05/lanes/l6/review-STANDING.md`, "Added 2026-09-05"): the
 * `useEffect` that starts this work must depend only on data
 * (`selection.sessionId`), never on a callback identity, and the
 * sequencing logic itself must live here, not inline in the effect, so it
 * can be tested with injected fakes instead of a real `invoke`.
 *
 * Staleness is tracked by the caller via `isStale()`, called after every
 * `await` — the same "staleness by sequence" shape `model/settle.ts` and
 * `model/cursorReadoutDriver.ts` already use elsewhere in this lane (a
 * monotonic counter the caller bumps whenever a newer run starts, compared
 * against the value captured when this run began). This driver never
 * throws — every rejection dispatches a typed action instead, so a caller
 * never needs its own top-level `.catch`.
 */
import type { CellOutput, LapContext as EvalLapContext, WorkbookHandle } from "../../../../ipc/workbook";
import type { WorkbookAction } from "./workbookState";

/** The IPC calls one open→read→eval run needs, injected so this module
 *  never imports `ipc/workbook.ts` directly — a caller supplies the real
 *  wrappers (or a test's fakes). */
export interface OpenEvalDeps {
  /** Lists indexed workbooks (`ipc/catalog.ts`'s `listWorkbooks`); this driver opens the first one — see `runOpenAndEval`'s doc comment on why. */
  listWorkbooks: () => Promise<{ workbook_id: string }[]>;
  openWorkbook: (idOrPath: string) => Promise<WorkbookHandle>;
  /** `ipc/workbook.ts`'s `readWorkbook`. */
  readWorkbook: (idOrPath: string) => Promise<{ markdown: string; hash: string; path: string }>;
  evalWorkbook: (id: string, sessionId: string | null, lapContext: EvalLapContext | null) => Promise<CellOutput[]>;
}

/** Dispatches one `WorkbookAction` — `workbookReducer`'s own dispatch function, or a test's recorder. */
export type OpenEvalDispatch = (action: WorkbookAction) => void;

/**
 * Runs the whole open → read → eval sequence once. `sessionId` is
 * `AppState.selection.sessionId` at the moment this run started — passed
 * straight to `evalWorkbook`; `null` is a legal value (C3 §3.4: every
 * `[Channel]` reference then surfaces as a per-cell error rather than
 * rejecting).
 *
 * There is no "active workbook" selection anywhere in shared state yet
 * (`AppState.tsx` has no such slice, and inventing one is not this lane's
 * call to make unilaterally, CLAUDE.md §7) — this driver opens the first
 * workbook `listWorkbooks` returns, or reports "no workbooks" when there
 * are none. A workbook picker is out of this task's scope.
 *
 * @param isStale Checked after every `await`; once it returns `true` this
 *   run stops dispatching immediately, even if further steps would
 *   otherwise succeed — a caller going away or a newer run superseding
 *   this one both look the same from here.
 * @param lapContext `AppState.selection.lapContext`, mapped to
 *   `ipc/workbook.ts`'s wire `LapContext` shape (ledger R59) — passed
 *   straight to `evalWorkbook`; `null` reproduces today's behaviour exactly.
 */
export async function runOpenAndEval(
  deps: OpenEvalDeps,
  sessionId: string | null,
  dispatch: OpenEvalDispatch,
  isStale: () => boolean,
  lapContext: EvalLapContext | null = null
): Promise<void> {
  let handle: WorkbookHandle;
  try {
    const workbooks = await deps.listWorkbooks();
    if (isStale()) return;
    if (workbooks.length === 0) {
      dispatch({ type: "markdownError", message: "No workbooks found." });
      return;
    }

    handle = await deps.openWorkbook(workbooks[0].workbook_id);
    if (isStale()) return;
    dispatch({ type: "handleOpened", handle });
  } catch (error) {
    if (!isStale()) {
      dispatch({ type: "markdownError", message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  try {
    const source = await deps.readWorkbook(handle.id);
    if (isStale()) return;
    dispatch({ type: "markdownReady", markdown: source.markdown, hash: source.hash });
  } catch (error) {
    if (!isStale()) {
      dispatch({ type: "markdownError", message: error instanceof Error ? error.message : String(error) });
    }
  }

  await runEval(deps, handle.id, sessionId, dispatch, isStale, lapContext);
}

/**
 * Runs `evalWorkbook` alone — the step `runOpenAndEval` ends with, reused
 * on its own for a `watchWorkbook` event or a debounced editor change,
 * neither of which need to re-open the workbook. Same staleness contract
 * as {@link runOpenAndEval}.
 */
export async function runEval(
  deps: Pick<OpenEvalDeps, "evalWorkbook">,
  id: string,
  sessionId: string | null,
  dispatch: OpenEvalDispatch,
  isStale: () => boolean,
  lapContext: EvalLapContext | null = null
): Promise<void> {
  try {
    const outputs = await deps.evalWorkbook(id, sessionId, lapContext);
    if (isStale()) return;
    dispatch({ type: "evalResult", outputs });
  } catch {
    // A whole-command rejection from `evalWorkbook` (not a per-cell error,
    // which arrives inside a successful `CellOutput[]` instead) means no
    // cell evaluated at all — e.g. an unknown workbook id. Nothing to
    // dispatch: `outputs` stays whatever it was (empty, on a fresh open),
    // and the markdown slice above is unaffected either way.
  }
}
