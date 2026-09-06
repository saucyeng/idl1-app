/**
 * Pure-with-injected-IO driver for one `js` cell's `fetch_fft` call (L6 Task
 * 19). Mirrors `channelBindDriver.ts`/`openEvalDriver.ts`'s shape exactly:
 * `deps.fetchFft` is injected so this module never imports `ipc/rasters.ts`
 * directly, `isStale()` is checked once after the single `await`, and a
 * rejection dispatches a typed action instead of throwing out -- a caller
 * never needs its own top-level `.catch` (the tightened IPC-effects rule,
 * `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4). Run sequencing (deciding
 * whether this run is still current) is the caller's job via the shared
 * `CellRunSequencer` -- this module owns no counter of its own.
 */
import type { DecodedFft, FftAveraging, SpectrogramParams } from "../../../../ipc/rasters";
import type { IpcError } from "../../../../ipc/workbook";
import type { FftRequest } from "./fftRequest";

/** The IPC this driver needs, injected so it never imports `ipc/rasters.ts`
 *  directly -- a caller supplies the real `fetchFft` (or a test's fake). */
export interface FftDeps {
  fetchFft: (
    sessionId: string,
    channelId: string,
    lap: number | null,
    params: SpectrogramParams,
    averaging: FftAveraging
  ) => Promise<DecodedFft>;
}

/** One piece of state a completed (non-stale) run writes. */
export type FftAction = { type: "spectrum"; cellId: string; fft: DecodedFft } | { type: "fftError"; cellId: string; error: IpcError };

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
 * Turns a rejected `fetchFft` promise into a typed `IpcError` (CLAUDE.md §5:
 * never `Err(String)`, never a bare thrown string). A typed rejection (e.g.
 * R76's `invalid_argument` carrying `detail: { segments: n }`) passes
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
 * Runs one `fetch_fft` request for `cellId` and dispatches its outcome.
 * `request.lap` (`null` for the whole channel, or the selected main lap,
 * R83/L2b Task 6) is passed straight through, never overridden here.
 * `isStale()` is checked once, after the single `await`:
 * `true` means a newer run for this cell has started since, and this run
 * dispatches nothing at all, resolved or rejected alike.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(cellId, seq)`
 *   check (or a test's fake) -- this driver adds no sequencing of its own.
 */
export async function runFft(
  deps: FftDeps,
  sessionId: string,
  cellId: string,
  request: FftRequest,
  dispatch: FftDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const fft = await deps.fetchFft(sessionId, request.channelId, request.lap, request.params, request.averaging);
    if (isStale()) {
      return;
    }
    dispatch({ type: "spectrum", cellId, fft });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "fftError", cellId, error: toIpcError(error) });
  }
}
