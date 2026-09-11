/**
 * Pure-with-injected-IO drivers for a map cell's two fetches (ruling R217
 * item 1, C3 §3.5): one window's projected trace (`fetch_gps_trace_v2`) and
 * the session's track underlay plus axis domains (`fetch_gps_trace_meta`).
 * Mirrors `histogramDriver.ts` exactly: every IPC function is injected so
 * this module never imports `ipc/gps.ts` directly, `isStale()` is checked
 * once after the single `await`, and a rejection dispatches a typed action
 * instead of throwing out.
 *
 * One `runGpsTrace` call fetches **one window's** trace. A caller with
 * several selected windows calls this once per window and combines the *n*
 * results itself via `host/protocol.ts`'s `combineGpsWindows` before
 * publishing one host variable -- the same division of labour every other
 * chart driver has (ruling R129: the window dimension lives in the payload,
 * not the key).
 *
 * `runGpsMeta` is **per session**, not per window: the ENU frame and origin
 * are the same for every window of one session, which is exactly what lets a
 * trace and the track underlay superimpose. Fetching it per window would
 * fetch the same answer *n* times.
 */
import type { DecodedGpsTrace, GpsTraceMeta } from "../../../../ipc/gps";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";

/** The IPC these drivers need, injected so neither imports `ipc/gps.ts`
 *  directly — a caller supplies the real `fetchGpsTrace`/`fetchGpsTraceMeta`
 *  (or a test's fakes). */
export interface GpsDeps {
  fetchGpsTrace: (window: SelectedWindow, colourBy: string | null, budget: number) => Promise<DecodedGpsTrace>;
  fetchGpsTraceMeta: (sessionId: string, trackId: string | null) => Promise<GpsTraceMeta>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} `runGpsTrace` was called with, so a caller
 *  juggling several windows for one cell can tell which window's result this
 *  is without re-deriving it; `sessionId` plays the same role for the
 *  per-session meta actions. */
export type GpsAction =
  | { type: "gpsTrace"; cellId: string; window: SelectedWindow; trace: DecodedGpsTrace }
  | { type: "gpsTraceError"; cellId: string; window: SelectedWindow; error: IpcError }
  | { type: "gpsMeta"; sessionId: string; meta: GpsTraceMeta }
  | { type: "gpsMetaError"; sessionId: string; error: IpcError };

/** Dispatches one {@link GpsAction} — a caller's `setState` closures, or a test's recorder. */
export type GpsDispatch = (action: GpsAction) => void;

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
 * Turns a rejected promise into a typed `IpcError` (CLAUDE.md §5: never a
 * bare thrown string). A typed rejection (C3 §3.5's `invalid_argument` for
 * an unresolvable window or an out-of-range budget, `not_found` for a
 * colour-by channel this window's session does not have) passes through with
 * its `kind`/`message`/`detail` intact; anything else — including the decode
 * errors `decodeGpsTrace` throws on a malformed `IDLG` payload — becomes
 * `kind: "internal"` with the error's own message text, mirroring
 * `histogramDriver.ts`'s untyped-error fallback.
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
 * Runs one `fetch_gps_trace_v2` request for `cellId` over `window` and
 * dispatches its outcome. `isStale()` is checked once, after the single
 * `await`: `true` means a newer run for this cell/window pair has started
 * since, and this run dispatches nothing at all, resolved or rejected alike.
 *
 * A **session with no GPS fixes is not an error** and is dispatched as an
 * ordinary `"gpsTrace"` action carrying a zero-point trace: "this session
 * was not recorded with GPS" is a real answer, which the caller renders as
 * an empty map rather than a failure. Only a rejected promise becomes
 * `"gpsTraceError"`.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(key, seq)` check
 *   (or a test's fake) — this driver adds no sequencing of its own.
 */
export async function runGpsTrace(
  deps: GpsDeps,
  cellId: string,
  window: SelectedWindow,
  colourBy: string | null,
  budget: number,
  dispatch: GpsDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const trace = await deps.fetchGpsTrace(window, colourBy, budget);
    if (isStale()) {
      return;
    }
    dispatch({ type: "gpsTrace", cellId, window, trace });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "gpsTraceError", cellId, window, error: toIpcError(error) });
  }
}

/**
 * Runs one `fetch_gps_trace_meta` request for `sessionId` and dispatches its
 * outcome. Keyed by session, not by cell: every map cell over one session
 * shares one `trackGeometry` host variable, because they share one ENU
 * frame.
 *
 * A session with no track binding is not an error either — C3 §3.5 answers
 * with an empty `polyline`/`gates` and real axis domains, so a map still
 * draws its trace with no underlay beneath it.
 */
export async function runGpsMeta(
  deps: GpsDeps,
  sessionId: string,
  trackId: string | null,
  dispatch: GpsDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const meta = await deps.fetchGpsTraceMeta(sessionId, trackId);
    if (isStale()) {
      return;
    }
    dispatch({ type: "gpsMeta", sessionId, meta });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "gpsMetaError", sessionId, error: toIpcError(error) });
  }
}

/** The `{xs, ys, ts, cs}` column set one window's fetched trace contributes
 *  to `host/protocol.ts`'s `combineGpsWindows`.
 *
 *  Split out here, rather than written inline in the page effect, for the
 *  reason `histogramDriver.ts`'s `histogramColumns` is: the one rule that
 *  needs stating and testing is that a short or over-long column is
 *  **truncated to the point count every column actually has**, so a
 *  malformed payload reaches Plot as fewer points rather than as `NaN`s read
 *  past the end of an array. `cs` stays `null` (never a zero-filled array)
 *  for an uncoloured trace, so the combiner can tell "no colour channel was
 *  requested" from "the channel had no sample near this fix". */
export function gpsColumns(trace: DecodedGpsTrace): {
  xs: Float64Array;
  ys: Float64Array;
  ts: Float64Array;
  cs: Float64Array | null;
} {
  const n = Math.min(
    trace.xs.length,
    trace.ys.length,
    trace.ts.length,
    trace.cs === null ? Number.POSITIVE_INFINITY : trace.cs.length
  );
  if (n === trace.xs.length && n === trace.ys.length && n === trace.ts.length && (trace.cs === null || trace.cs.length === n)) {
    return { xs: trace.xs, ys: trace.ys, ts: trace.ts, cs: trace.cs };
  }
  return {
    xs: trace.xs.slice(0, n),
    ys: trace.ys.slice(0, n),
    ts: trace.ts.slice(0, n),
    cs: trace.cs === null ? null : trace.cs.slice(0, n),
  };
}
