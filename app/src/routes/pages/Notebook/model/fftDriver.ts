/**
 * Pure-with-injected-IO driver for one `js` cell's `fetch_fft_v2` call (S1
 * Task 11a, migrating off the interim `legacyLapFromWindow` shim ruling
 * R129 required — see that ruling's finding 2 for why a `"range"` span
 * could not simply be widened to the whole session in the meantime).
 * Mirrors `channelBindDriver.ts`/`openEvalDriver.ts`'s shape exactly:
 * `deps.fetchFftV2` is injected so this module never imports
 * `ipc/rasters.ts` directly, `isStale()` is checked once after the single
 * `await`, and a rejection dispatches a typed action instead of throwing
 * out -- a caller never needs its own top-level `.catch` (the tightened
 * IPC-effects rule, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4). Run
 * sequencing (deciding whether this run is still current) is the caller's
 * job via the shared `CellRunSequencer` -- this module owns no counter of
 * its own.
 *
 * One `runFft` call fetches **one window's** spectrum for `cellId` (a
 * `FftRequest`'s `window` is always a single `SelectedWindow`, never a
 * list) -- `request.window: null` (nothing to bind against) dispatches a
 * typed error rather than calling `fetchFftV2`, since `fetch_fft_v2`
 * requires a concrete `Window` (C3 §3.6). A caller with several selected
 * windows calls this once per window (`model/jsCellBinding.ts`'s
 * `bindingFor`'s own FFT-arm doc comment: every call shares one
 * `hostVarName`, ruling R129) and combines the *n* results itself via
 * `host/protocol.ts`'s `combineSpectrumWindows` before publishing one host
 * variable -- this driver's job stops at "fetch this one window, dispatch
 * what happened," exactly as it did before multi-window existed.
 */
import type { DecodedFft, FftAveraging, SpectrogramParams } from "../../../../ipc/rasters";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";
import type { FftRequest } from "./fftRequest";

/** The IPC this driver needs, injected so it never imports `ipc/rasters.ts`
 *  directly -- a caller supplies the real `fetchFftV2` (or a test's fake). */
export interface FftDeps {
  fetchFftV2: (window: SelectedWindow, channelId: string, params: SpectrogramParams, averaging: FftAveraging) => Promise<DecodedFft>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} `runFft` was called with (never `null` --
 *  see {@link runFft}'s own doc comment on why a `null`-window request
 *  short-circuits before either variant here is reached), so a caller
 *  juggling several windows for one cell can tell which window's result
 *  this is without re-deriving it from `request` itself. */
export type FftAction =
  | { type: "spectrum"; cellId: string; window: SelectedWindow; fft: DecodedFft }
  | { type: "fftError"; cellId: string; window: SelectedWindow; error: IpcError };

/** Dispatches one `FftAction` -- a caller's `setState`/`setSpectrumHostVar` closures, or a test's recorder. */
export type FftDispatch = (action: FftAction) => void;

/** `true` when `value` has the shape of a typed `IpcError` (C3 §2: a `kind`
 *  and a `message`) rather than an untyped/generic thrown value. */
function isIpcErrorLike(value: unknown): value is IpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kind === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/**
 * Turns a rejected `fetchFftV2` promise into a typed `IpcError` (CLAUDE.md §5:
 * never `Err(String)`, never a bare thrown string). A typed rejection (e.g.
 * R76's `invalid_argument` carrying `detail: { segments: n }`, or R119/R120's
 * `no_overlap`/`invalid_range_order` for a degenerate `range` window) passes
 * through with its `kind`/`message`/`detail` intact; anything else (a
 * network-level failure with no `kind`) becomes `kind: "internal"` with the
 * error's own message text, mirroring `openEvalDriver.ts`'s untyped-error
 * fallback.
 */
function toIpcError(error: unknown): IpcError {
  if (isIpcErrorLike(error)) {
    return error.detail === undefined
      ? { kind: error.kind, message: error.message }
      : { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: "internal", message: error instanceof Error ? error.message : String(error) };
}

/**
 * Runs one `fetch_fft_v2` request for `cellId`'s spectrum over
 * `request.window` and dispatches its outcome. `request.window === null`
 * (nothing selected -- `fftRequestFor`'s own "no restriction" default,
 * `model/fftRequest.ts`) dispatches nothing at all and calls
 * `deps.fetchFftV2` never: there is no window to fetch, and a caller with
 * `request.window === null` has no business calling this driver in the
 * first place (`Notebook/index.tsx` only calls `runFft` once per entry of
 * `AppState.selection`, each of which is a real window). `isStale()` is
 * checked once, after the single `await`: `true` means a newer run for
 * this cell (or this cell/window pair) has started since, and this run
 * dispatches nothing at all, resolved or rejected alike.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(cellId, seq)`
 *   check (or a test's fake) -- this driver adds no sequencing of its own.
 */
export async function runFft(
  deps: FftDeps,
  cellId: string,
  request: FftRequest,
  dispatch: FftDispatch,
  isStale: () => boolean
): Promise<void> {
  const window = request.window;
  if (window === null) {
    return;
  }

  try {
    const fft = await deps.fetchFftV2(window, request.channelId, request.params, request.averaging);
    if (isStale()) {
      return;
    }
    dispatch({ type: "spectrum", cellId, window, fft });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "fftError", cellId, window, error: toIpcError(error) });
  }
}
