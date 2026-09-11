/**
 * Pure-with-injected-IO driver for a spectrogram cell's per-window raster
 * fetch (ruling R217 item 4, C3 §3.6). Mirrors `histogramDriver.ts`:
 * `deps` is injected so this module never imports `ipc/rasters.ts` directly,
 * `isStale()` is checked once after the awaits, and a rejection dispatches a
 * typed action instead of throwing out.
 *
 * One `runRaster` call fetches **one window's** heatmap — its pixels *and*
 * its metadata, because the two are one picture: the axis domains say where
 * the pixels go, and the colour scale and ramp stops say what they mean. A
 * caller with several selected windows calls this once per window and hands
 * the results to `host/protocol.ts`'s `rasterPayload` as one frame list,
 * because a spectrogram facets its windows (`fx: "w"`) rather than
 * interleaving them — pixels cannot interleave.
 *
 * Distinct from `model/rasterLayer.ts`, which owns the *chrome* around an
 * already-fetched raster (its legend gradient and axis furniture); this
 * module owns only the fetch.
 */
import type { DecodedRaster, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { IpcError, Window as SelectedWindow } from "../../../../ipc/workbook";

/** One window's fetched heatmap: the pixels and the metadata that says what
 *  they mean. Always fetched together — a raster without its domains is a
 *  picture with no axes, and a raster without its ramp stops is one with no
 *  legend (R177: the app never reimplements the ramp). */
export interface FetchedRaster {
  raster: DecodedRaster;
  meta: RasterMeta;
}

/** The IPC this driver needs, injected so it never imports `ipc/rasters.ts`
 *  directly — a caller supplies the real `fetchRasterV2`/`fetchRasterMetaV2`
 *  (or a test's fakes). */
export interface RasterDeps {
  fetchRaster: (window: SelectedWindow, channel: string, width: number, height: number, params: SpectrogramParams) => Promise<DecodedRaster>;
  fetchRasterMeta: (window: SelectedWindow, channel: string, width: number, height: number, params: SpectrogramParams) => Promise<RasterMeta>;
}

/** One piece of state a completed (non-stale) run writes. `window` is the
 *  same {@link SelectedWindow} `runRaster` was called with, so a caller
 *  juggling several windows for one cell can tell which window's frame this
 *  is without re-deriving it. */
export type RasterAction =
  | { type: "raster"; cellId: string; window: SelectedWindow; fetched: FetchedRaster }
  | { type: "rasterError"; cellId: string; window: SelectedWindow; error: IpcError };

/** Dispatches one {@link RasterAction} — a caller's `setState` closures, or a test's recorder. */
export type RasterDispatch = (action: RasterAction) => void;

/** `true` when `value` has the shape of a typed `IpcError` (C3 §2). */
function isIpcErrorLike(value: unknown): value is IpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kind === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/** Turns a rejected promise into a typed `IpcError` (CLAUDE.md §5), exactly
 *  as `histogramDriver.ts`'s own does: a typed rejection passes through with
 *  its `kind`/`message`/`detail` intact, and anything else — including
 *  `decodeRaster`'s own throws on a malformed `IDLR` payload — becomes
 *  `kind: "internal"`. */
function toIpcError(error: unknown): IpcError {
  if (isIpcErrorLike(error)) {
    return error.detail === undefined
      ? { kind: error.kind, message: error.message }
      : { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: "internal", message: error instanceof Error ? error.message : String(error) };
}

/**
 * Runs one window's `fetch_raster_v2` plus `fetch_raster_meta_v2` for
 * `cellId` and dispatches the pair as one outcome. `isStale()` is checked
 * once, after both awaits: `true` means a newer run for this cell/window
 * pair has started since, and this run dispatches nothing at all.
 *
 * The two requests are issued **concurrently** (`Promise.all`), not in
 * sequence: neither depends on the other's answer, and C3 §3.6 resolves the
 * same window for both, so serialising them would double the settle latency
 * for no gain. Either rejecting rejects the pair — a raster with no domains
 * cannot be placed on an axis, so half an answer is not an answer.
 *
 * `width`/`height` are passed through as requested; C3 §3.6 **clamps**
 * rather than refuses above `MAX_RASTER_WIDTH`/`MAX_RASTER_HEIGHT`, so a
 * caller need not pre-clamp and a too-large cell gets a slightly coarser
 * picture rather than an error. The decoded raster reports the size the
 * engine actually rendered, which is what the caller must draw at.
 *
 * @param isStale The caller's `CellRunSequencer.isCurrent(key, seq)` check
 *   (or a test's fake) — this driver adds no sequencing of its own.
 */
export async function runRaster(
  deps: RasterDeps,
  cellId: string,
  window: SelectedWindow,
  channel: string,
  width: number,
  height: number,
  params: SpectrogramParams,
  dispatch: RasterDispatch,
  isStale: () => boolean
): Promise<void> {
  try {
    const [raster, meta] = await Promise.all([
      deps.fetchRaster(window, channel, width, height, params),
      deps.fetchRasterMeta(window, channel, width, height, params),
    ]);
    if (isStale()) {
      return;
    }
    dispatch({ type: "raster", cellId, window, fetched: { raster, meta } });
  } catch (error) {
    if (isStale()) {
      return;
    }
    dispatch({ type: "rasterError", cellId, window, error: toIpcError(error) });
  }
}

/** C2 §5.3's own sizing rule for a spectrogram cell: one raster pixel per
 *  CSS pixel of the cell's own width, clamped so a narrow cell still asks
 *  for a usable picture. The upper bound is not stated here — C3 §3.6 clamps
 *  to `MAX_RASTER_WIDTH` itself, and restating the cap in two places is how
 *  the two drift. */
export const RASTER_WIDTH_MIN = 256;
/** See {@link RASTER_WIDTH_MIN}. A spectrogram's height is its **frequency**
 *  resolution, not a pixel budget the layout picks, so it is a fixed request
 *  rather than a function of the cell's rendered height: the engine renders
 *  this many frequency rows and the browser scales them to whatever height
 *  the cell ends up with. */
export const RASTER_HEIGHT = 512;

/** The raster width for a spectrogram cell of `cssWidth` CSS pixels, per
 *  {@link RASTER_WIDTH_MIN}'s rule. Faceted cells share one request width:
 *  every window's raster is rendered the same size so the facets are
 *  comparable, which is the whole point of drawing them side by side. */
export function rasterWidthForCell(cssWidth: number): number {
  const raw = Math.round(cssWidth);
  return Math.max(RASTER_WIDTH_MIN, Number.isFinite(raw) ? raw : RASTER_WIDTH_MIN);
}

/**
 * Turns one window's fetched raster into the `RasterFramePayload` shape
 * `host/protocol.ts` transfers, given that window's index in the payload's
 * own `windows` array.
 *
 * The pixel bytes are **copied into a fresh `ArrayBuffer`**, not forwarded
 * as the decoded view's own buffer: `decodeRaster` returns a
 * `Uint8ClampedArray` *view* over the IPC response buffer at a 16-byte
 * offset (past the `IDLR` header), and `postMessage`'s transfer list moves
 * whole buffers, so transferring that buffer would hand the sandbox the
 * header bytes as the first pixels and neuter a buffer the caller may still
 * be retaining for a re-push.
 */
export function rasterFrame(fetched: FetchedRaster, windowIndex: number): {
  windowIndex: number;
  pixelWidth: number;
  pixelHeight: number;
  xDomain: [number, number];
  yDomain: [number, number];
  pixels: ArrayBuffer;
} {
  const { raster, meta } = fetched;
  const copy = new Uint8ClampedArray(raster.pixels.length);
  copy.set(raster.pixels);
  return {
    windowIndex,
    pixelWidth: raster.width,
    pixelHeight: raster.height,
    xDomain: meta.x_domain,
    yDomain: meta.y_domain,
    pixels: copy.buffer,
  };
}
