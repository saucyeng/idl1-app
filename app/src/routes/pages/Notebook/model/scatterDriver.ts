/**
 * Pure-with-injected-IO driver for one `js` cell's `fetch_scatter` call
 * (ruling R215 item 3, C3 §3.5). Mirrors `fftDriver.ts`/`histogramDriver.ts`
 * exactly: `deps.fetchScatter` is injected so this module never imports
 * `ipc/scatter.ts` directly, `isStale()` is checked once after the single
 * `await`, and a rejection dispatches a typed action instead of throwing out.
 * Run sequencing is the caller's job via the shared `CellRunSequencer`.
 *
 * One `runScatter` call fetches **one window's** cloud for `cellId`. A caller
 * with several selected windows calls this once per window and combines the
 * *n* results itself via `host/protocol.ts`'s `combineScatterWindows` before
 * publishing one host variable.
 */
import type { DecodedScatter } from "../../../../ipc/scatter";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";

/** The IPC this driver needs, injected so it never imports `ipc/scatter.ts`
 *  directly — a caller supplies the real `fetchScatter` (or a test's fake). */
export interface ScatterDeps {
  fetchScatter: (window: SelectedWindow, xChannel: string, yChannel: string, pointBudget: number) => Promise<DecodedScatter>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} `runScatter` was called with, so a caller
 *  juggling several windows for one cell can tell which window's result
 *  this is without re-deriving it. */
export type ScatterAction =
  | { type: "scatter"; cellId: string; window: SelectedWindow; scatter: DecodedScatter }
  | { type: "scatterError"; cellId: string; window: SelectedWindow; error: IpcError };

/** Dispatches one {@link ScatterAction} — a caller's `setState` closures, or a test's recorder. */
export type ScatterDispatch = (action: ScatterAction) => void;

/** `true` when `value` has the shape of a typed `IpcError` (C3 §2). */
function isIpcErrorLike(value: unknown): value is IpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kind === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/**
 * Turns a rejected `fetchScatter` promise into a typed `IpcError`
 * (CLAUDE.md §5). A typed rejection (C3 §3.5's `invalid_argument` for an
 * unresolvable window or a bad `point_budget`, `not_found` for a channel
 * this window's session lacks, `resource_exhausted` when the session cache
 * refused a column) passes through intact; anything else — including the
 * decoder's own `Error` on malformed `IDLS` bytes — becomes
 * `kind: "internal"` with the error's own message.
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
 * Runs one `fetch_scatter` request for `cellId` over `window` and dispatches
 * its outcome. `isStale()` is checked once, after the single `await`: `true`
 * means a newer run for this cell/window pair has started since, and this
 * run dispatches nothing at all, resolved or rejected alike.
 *
 * An **empty cloud is not an error** and is dispatched as an ordinary
 * `"scatter"` action: two channels that never overlap in the window, or a
 * window whose pairs are all non-finite, have a real answer ("nothing
 * here"), and the caller renders it as an empty chart.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(key, seq)` check.
 */
export async function runScatter(
  deps: ScatterDeps,
  cellId: string,
  window: SelectedWindow,
  xChannel: string,
  yChannel: string,
  pointBudget: number,
  dispatch: ScatterDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const scatter = await deps.fetchScatter(window, xChannel, yChannel, pointBudget);
    if (isStale()) {
      return;
    }
    dispatch({ type: "scatter", cellId, window, scatter });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "scatterError", cellId, window, error: toIpcError(error) });
  }
}

/**
 * The union of several windows' pre-decimation extents, as one
 * {@link DecodedScatter}-shaped bounds carrier — what the equal-aspect
 * domain must be squared from when more than one window is overlaid.
 *
 * Squaring each window's own extent separately and taking the last would
 * draw one window's cloud against another window's axes; squaring the union
 * keeps every overlaid cloud on the same scale, which is the whole point of
 * overlaying them. `xs`/`ys` are empty because nothing reads them from this
 * value — only the four bounds are.
 *
 * Returns `null` for an empty input (no window has resolved yet), so the
 * caller publishes `domain: null` and lets Plot choose.
 */
export function unionScatterBounds(clouds: readonly DecodedScatter[]): DecodedScatter | null {
  if (clouds.length === 0) return null;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of clouds) {
    if (c.xMin < xMin) xMin = c.xMin;
    if (c.xMax > xMax) xMax = c.xMax;
    if (c.yMin < yMin) yMin = c.yMin;
    if (c.yMax > yMax) yMax = c.yMax;
  }
  return { xs: new Float64Array(0), ys: new Float64Array(0), xMin, xMax, yMin, yMax };
}
