/**
 * Pure, unit-tested driver for the open → read → eval sequence
 * `Notebook/index.tsx` runs on mount and whenever the selected windows
 * change — the review brief's tightened IPC-effects rule
 * (`runs/2026-09-05/lanes/l6/review-STANDING.md`, "Added 2026-09-05"): the
 * `useEffect` that starts this work must depend only on data (a stable
 * `windowsKey` string, operating brief §4's tightening — never the
 * `windows` array identity), never on a callback identity, and the
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
 *
 * Migrated from `sessionId`/`lapContext` to `windows: Window[]` (C1 §6.1,
 * ruling R111/R115/R117) — `evalWorkbook` is replaced by `evalWorkbookV2`.
 * Per ruling R121, a per-window failure (an unresolvable `session_id`, an
 * unknown lap, a degenerate `range`) must not blank the other windows'
 * results, so this driver dispatches one {@link OpenEvalWindowAction} per
 * `windows` entry instead of one flat `evalResult`/`evalError` — that old
 * pair (`workbookState.ts`'s `WorkbookAction`) assumed a single session-wide
 * result and cannot represent "window 2 failed, 1 and 3 succeeded" (R121's
 * own finding). The whole-command `handleOpened`/`markdownReady`/
 * `markdownError` actions are unaffected by windows (a workbook's markdown
 * is not scoped to any window) and still flow through `WorkbookAction`.
 */
import type { CellOutput, IpcError, WindowEval, Window as SelectedWindow, WorkbookHandle } from "../../../../ipc/workbook";
import type { WorkbookAction } from "./workbookState";

/** `true` when `value` has the shape of a typed `IpcError` (C3 §2: a `kind`
 *  and a `message`) rather than an untyped/generic thrown value. Mirrors
 *  `fftDriver.ts`'s helper of the same shape. */
function isIpcErrorLike(value: unknown): value is IpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kind === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/** Turns a rejected `evalWorkbookV2` promise into a typed `IpcError`
 *  (CLAUDE.md §5: never `Err(String)`, never a bare thrown string). A
 *  typed rejection passes through with its `kind`/`message`/`detail`
 *  intact; anything else becomes `kind: "internal"` with the error's own
 *  message text — the same fallback shape `fftDriver.ts`'s `toIpcError`
 *  uses. This is the *call-level* rejection only (R121: unknown/unparseable
 *  workbook id) — a per-window failure never reaches here, it arrives as an
 *  `{ error: IpcError }` entry inside a resolved `WindowEval[]` instead. */
function toIpcError(error: unknown): IpcError {
  if (isIpcErrorLike(error)) {
    return error.detail === undefined
      ? { kind: error.kind, message: error.message }
      : { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: "internal", message: error instanceof Error ? error.message : String(error) };
}

/** One `windows` entry's outcome, dispatched independently per ruling R121
 *  — siblings are unaffected by another window's failure. Carries the
 *  originating {@link SelectedWindow} (not a derived string key) so a
 *  caller can compute whatever identity it needs (`state/selection.ts`'s
 *  `windowKey`, applied to the app-side `SelectionWindow` the caller
 *  already holds) without this driver duplicating that logic. `window:
 *  null` marks the single result `evalWorkbookV2` returns for `windows:
 *  []` ("nothing selected", decision 48) — the one case where a result
 *  exists but there is no window to pair it with. */
export type OpenEvalWindowAction =
  | { type: "evalWindowResult"; window: SelectedWindow | null; outputs: CellOutput[] }
  | { type: "evalWindowError"; window: SelectedWindow | null; error: IpcError };

/** The IPC calls one open→read→eval run needs, injected so this module
 *  never imports `ipc/workbook.ts` directly — a caller supplies the real
 *  wrappers (or a test's fakes). */
export interface OpenEvalDeps {
  openWorkbook: (idOrPath: string) => Promise<WorkbookHandle>;
  /** `ipc/workbook.ts`'s `readWorkbook`. */
  readWorkbook: (idOrPath: string) => Promise<{ markdown: string; hash: string; path: string }>;
  /** `ipc/workbook.ts`'s `evalWorkbookV2` (C1 §6.1, ruling R117 — replaces
   *  `evalWorkbook`'s `sessionId` + `lapContext` pair). */
  evalWorkbookV2: (id: string, windows: SelectedWindow[]) => Promise<WindowEval[]>;
}

/** Dispatches one `WorkbookAction` (workbook-wide) or `OpenEvalWindowAction`
 *  (per-window eval outcome) — `Notebook/index.tsx`'s own dispatch(es), or a
 *  test's recorder. */
export type OpenEvalDispatch = (action: WorkbookAction | OpenEvalWindowAction) => void;

/**
 * Dispatches one {@link OpenEvalWindowAction} per entry of `results`, paired
 * positionally with `windows` (`evalWorkbookV2`'s contract: same order, same
 * length — except `windows: []`, which still resolves exactly one result,
 * paired here with `window: null`). Split out of {@link runEval} so the
 * pairing rule has one place to be correct.
 */
function dispatchWindowResults(windows: SelectedWindow[], results: WindowEval[], dispatch: OpenEvalDispatch): void {
  results.forEach((result, i) => {
    const window = windows.length === 0 ? null : windows[i];
    if ("ok" in result) {
      dispatch({ type: "evalWindowResult", window, outputs: result.ok });
    } else {
      dispatch({ type: "evalWindowError", window, error: result.error });
    }
  });
}

/**
 * Runs the whole open → read → eval sequence once, for the given
 * `workbookId` — decided by the caller (`model/workbookEntry.ts`'s
 * `chooseWorkbookEntry`, L6 Task 21), never by this driver: which workbook
 * to open is a page-level decision shared by the empty state, the picker
 * and Rescan, not something an open→eval run should re-derive on its own.
 *
 * @param isStale Checked after every `await`; once it returns `true` this
 *   run stops dispatching immediately, even if further steps would
 *   otherwise succeed — a caller going away or a newer run superseding
 *   this one both look the same from here.
 * @param windows `AppState.selection` mapped to `ipc/workbook.ts`'s wire
 *   `Window[]` shape (ruling R117) — passed straight to `evalWorkbookV2`;
 *   `[]` is a legal value (decision 48, "nothing selected") and still
 *   produces one result (see {@link dispatchWindowResults}).
 */
export async function runOpenAndEval(
  deps: OpenEvalDeps,
  workbookId: string,
  windows: SelectedWindow[],
  dispatch: OpenEvalDispatch,
  isStale: () => boolean
): Promise<void> {
  let handle: WorkbookHandle;
  try {
    handle = await deps.openWorkbook(workbookId);
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

  await runEval(deps, handle.id, windows, dispatch, isStale);
}

/**
 * Runs `evalWorkbookV2` alone — the step `runOpenAndEval` ends with, reused
 * on its own for a `watchWorkbook` event or a debounced editor change,
 * neither of which need to re-open the workbook. Same staleness contract
 * as {@link runOpenAndEval}.
 */
export async function runEval(
  deps: Pick<OpenEvalDeps, "evalWorkbookV2">,
  id: string,
  windows: SelectedWindow[],
  dispatch: OpenEvalDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const results = await deps.evalWorkbookV2(id, windows);
    if (isStale()) return;
    dispatchWindowResults(windows, results, dispatch);
  } catch (error) {
    // A whole-command rejection from `evalWorkbookV2` (not a per-window
    // error, which arrives inside a successful `WindowEval[]` instead, R121)
    // means no window evaluated at all — e.g. an unknown or unparseable
    // workbook id (the only two call-level causes left after R121 moved
    // every per-window cause into the per-window slot). Typed and dispatched
    // rather than silently swallowed, mirroring every `windows` entry's own
    // window as `null` (matching the `windows: []` pairing rule) since a
    // call-level failure has no single window to attribute to either.
    if (!isStale()) {
      dispatch({ type: "evalWindowError", window: null, error: toIpcError(error) });
    }
  }
}
