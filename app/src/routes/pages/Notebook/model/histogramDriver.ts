/**
 * Pure-with-injected-IO driver for one `js` cell's `fetch_histogram` call
 * (ruling R215 item 2, C3 §3.6). Mirrors `fftDriver.ts` exactly:
 * `deps.fetchHistogram` is injected so this module never imports
 * `ipc/histogram.ts` directly, `isStale()` is checked once after the single
 * `await`, and a rejection dispatches a typed action instead of throwing out
 * — a caller never needs its own top-level `.catch` (the tightened
 * IPC-effects rule, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4). Run
 * sequencing is the caller's job via the shared `CellRunSequencer`; this
 * module owns no counter of its own.
 *
 * One `runHistogram` call fetches **one window's** distribution for
 * `cellId`. A caller with several selected windows calls this once per
 * window and combines the *n* results itself via `host/protocol.ts`'s
 * `combineHistogramWindows` before publishing one host variable — the same
 * division of labour `fftDriver.ts` has, and for the same reason (ruling
 * R129: the window dimension lives in the payload, not the key).
 */
import type { HistogramParams, HistogramResponse } from "../../../../ipc/histogram";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";

/** The IPC this driver needs, injected so it never imports
 *  `ipc/histogram.ts` directly — a caller supplies the real
 *  `fetchHistogram` (or a test's fake). */
export interface HistogramDeps {
  fetchHistogram: (window: SelectedWindow, channel: string, params: HistogramParams) => Promise<HistogramResponse>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} `runHistogram` was called with, so a caller
 *  juggling several windows for one cell can tell which window's result
 *  this is without re-deriving it. */
export type HistogramAction =
  | { type: "histogram"; cellId: string; window: SelectedWindow; histogram: HistogramResponse }
  | { type: "histogramError"; cellId: string; window: SelectedWindow; error: IpcError };

/** Dispatches one {@link HistogramAction} — a caller's `setState` closures, or a test's recorder. */
export type HistogramDispatch = (action: HistogramAction) => void;

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
 * Turns a rejected `fetchHistogram` promise into a typed `IpcError`
 * (CLAUDE.md §5: never a bare thrown string). A typed rejection (C3 §3.6's
 * `invalid_argument` for an unresolvable window or a bad `bin_value`, or
 * `not_found` for a channel this window's session does not have) passes
 * through with its `kind`/`message`/`detail` intact; anything else becomes
 * `kind: "internal"` with the error's own message text, mirroring
 * `fftDriver.ts`'s untyped-error fallback.
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
 * Runs one `fetch_histogram` request for `cellId` over `window` and
 * dispatches its outcome. `isStale()` is checked once, after the single
 * `await`: `true` means a newer run for this cell/window pair has started
 * since, and this run dispatches nothing at all, resolved or rejected
 * alike.
 *
 * C3 §3.6's **degenerate empty result is not an error** and is dispatched
 * as an ordinary `"histogram"` action: a window with no finite sample, or a
 * constant channel, has a real answer ("nothing to bin here"), and the
 * caller renders it as an empty chart rather than a failure. Only a
 * rejected promise becomes `"histogramError"`.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(key, seq)` check
 *   (or a test's fake) — this driver adds no sequencing of its own.
 */
export async function runHistogram(
  deps: HistogramDeps,
  cellId: string,
  window: SelectedWindow,
  channel: string,
  params: HistogramParams,
  dispatch: HistogramDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const histogram = await deps.fetchHistogram(window, channel, params);
    if (isStale()) {
      return;
    }
    dispatch({ type: "histogram", cellId, window, histogram });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "histogramError", cellId, window, error: toIpcError(error) });
  }
}

/** The `{v0, v1, n}` column triple one window's fetched distribution
 *  contributes to `host/protocol.ts`'s `combineHistogramWindows` — one
 *  entry per bin, `v0`/`v1` that bin's own two edges and `n` C3 §3.6's
 *  already-normalised `values[i]`.
 *
 *  Split out here rather than written inline in the page effect so the
 *  edge-pairing rule (`bin_edges` has one more entry than `counts`, and bin
 *  `i` spans `bin_edges[i]..bin_edges[i + 1]`) is stated and tested once.
 *  A malformed response — `values` longer than `bin_edges` allows — is
 *  truncated to the bins the edges actually describe rather than reading
 *  past the end into `undefined`, which would reach Plot as `NaN` bars. */
export function histogramColumns(response: HistogramResponse): { v0: Float64Array; v1: Float64Array; n: Float64Array } {
  const bins = Math.max(0, Math.min(response.values.length, response.bin_edges.length - 1));
  const v0 = new Float64Array(bins);
  const v1 = new Float64Array(bins);
  const n = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    v0[i] = response.bin_edges[i];
    v1[i] = response.bin_edges[i + 1];
    n[i] = response.values[i];
  }
  return { v0, v1, n };
}
