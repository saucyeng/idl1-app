/**
 * Pure-with-injected-IO driver for a lap-progression cell's fetch (C2 §5.3's
 * lap cell, rulings R217 item 3 and R233): one `fetch_host_channel_v2` call
 * for one selected window, returning that window's `[lap]` series.
 *
 * Mirrors `gpsDriver.ts` exactly — the IPC is injected so this module never
 * imports `ipc/workbook.ts`, `isStale()` is checked once after the single
 * `await`, and a rejection dispatches a typed action instead of throwing out.
 *
 * **One call fetches one window's series.** A `[lap]` value is per window by
 * construction (the laps it is evaluated over are that window's), and the
 * command takes one `Window`, so a caller with *n* selected windows calls
 * this *n* times and combines the results itself through
 * `host/protocol.ts`'s `combineChannelWindows` before publishing one host
 * variable — the same division of labour every other chart driver has
 * (ruling R129: the window dimension lives in the payload, not in the key).
 *
 * **The shape check lives here.** Whether a definition is really `[lap]`-
 * shaped is not knowable before the fetch: C3 §3.4's `axis_kind` is the only
 * place the engine states a value's shape to this realm (C2 §3.6's minimal
 * subset carries no shape on `CellDefResult`). A definition that turns out
 * to be a time series or a scalar is therefore reported here, as a typed
 * error naming both the shape asked for and the shape found, rather than
 * drawn — plotting a `[t]` series against an ordinal lap axis would put
 * sample 3 at lap 3, a picture that looks like real data and is not.
 */
import { AxisKind, type DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";

/** The IPC this driver needs, injected so it never imports `ipc/workbook.ts`
 *  directly — a caller supplies the real `fetchHostChannelV2` already bound
 *  to the open workbook id (`Notebook/index.tsx`), or a test's fake. */
export interface LapDeps {
  fetchHostChannel: (window: SelectedWindow | null, defName: string, budget: number) => Promise<DecodedHostChannel>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} {@link runLapSeries} was called with, so a
 *  caller juggling several windows for one cell can tell which window's
 *  result this is without re-deriving it. */
export type LapAction =
  | { type: "lapSeries"; cellId: string; window: SelectedWindow; lap: Float64Array; v: Float64Array }
  | { type: "lapSeriesError"; cellId: string; window: SelectedWindow; error: IpcError };

/** Dispatches one {@link LapAction} — a caller's `setState` closures, or a test's recorder. */
export type LapDispatch = (action: LapAction) => void;

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
 * bare thrown string) — a typed rejection passes through with its
 * `kind`/`message`/`detail` intact, anything else (including the decode
 * errors `decodeHostChannel` throws on a malformed `IDLH` payload) becomes
 * `kind: "internal"`. Identical in shape to `gpsDriver.ts`'s own.
 */
function toIpcError(error: unknown): IpcError {
  if (isIpcErrorLike(error)) {
    return error.detail === undefined
      ? { kind: error.kind, message: error.message }
      : { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: "internal", message: error instanceof Error ? error.message : String(error) };
}

/** C2 §3.6.1's written form for each axis a `fetch_host_channel_v2` result
 *  can report, for the shape-mismatch message below. An axis-less value is
 *  rank 0, written `[]`. */
function shapeName(decoded: DecodedHostChannel): string {
  if (!decoded.hasT) return "[]";
  switch (decoded.axisKind) {
    case AxisKind.Lap:
      return "[lap]";
    case AxisKind.Frequency:
      return "[f]";
    case AxisKind.Time:
      return "[t]";
    default:
      return "[]";
  }
}

/**
 * Runs one `fetch_host_channel_v2` request for `cellId`'s definition over
 * `window` and dispatches its outcome. `isStale()` is checked once, after
 * the single `await`: `true` means a newer run for this cell/window pair has
 * started since, and this run dispatches nothing at all, resolved or
 * rejected alike.
 *
 * A **definition that is not `[lap]`-shaped** dispatches `"lapSeriesError"`
 * with a `kind: "invalid_argument"` error naming both shapes — see this
 * module's own doc comment for why the check cannot happen before the fetch.
 * A definition with **no laps in this window** is not an error and is
 * dispatched as an ordinary `"lapSeries"` with empty columns: "this window
 * has no complete lap" is a real answer, which the caller renders as an
 * empty series rather than a failure.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(key, seq)` check
 *   (or a test's fake) — this driver adds no sequencing of its own.
 */
export async function runLapSeries(
  deps: LapDeps,
  cellId: string,
  window: SelectedWindow,
  defName: string,
  budget: number,
  dispatch: LapDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const decoded = await deps.fetchHostChannel(window, defName, budget);
    if (isStale()) {
      return;
    }
    if (decoded.axisKind !== AxisKind.Lap) {
      dispatch({
        type: "lapSeriesError",
        cellId,
        window,
        error: {
          kind: "invalid_argument",
          message: `${defName} is ${shapeName(decoded)}, and a lap chart draws a [lap] value — reduce it per lap first, e.g. mean([${defName}], "t:lap").`,
        },
      });
      return;
    }
    dispatch({ type: "lapSeries", cellId, window, lap: decoded.t, v: decoded.v });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "lapSeriesError", cellId, window, error: toIpcError(error) });
  }
}

/**
 * Truncates one fetched series' two columns to the length they both
 * actually have, so a malformed payload reaches Plot as fewer points rather
 * than as `NaN`s read past the end of an array — `gpsDriver.ts`'s
 * `gpsColumns` for the same reason, at this payload's two columns.
 */
export function lapColumns(lap: Float64Array, v: Float64Array): { lap: Float64Array; v: Float64Array } {
  const n = Math.min(lap.length, v.length);
  if (n === lap.length && n === v.length) return { lap, v };
  return { lap: lap.slice(0, n), v: v.slice(0, n) };
}
