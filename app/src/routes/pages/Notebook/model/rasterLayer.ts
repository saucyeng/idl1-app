import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { Viewport } from "./viewport";

/**
 * Pure raster request/alignment math for the Notebook chart's raster
 * underlay (design §6 "Point budget": "Density (spectrogram, g-g scatter,
 * whole-session histograms) is a Rust raster under Plot axes"; C3 §3.6).
 * Nothing here calls `fetchRaster`/`fetchRasterMeta` or touches the DOM —
 * `RasterUnderlay.tsx` calls these functions from its settle-bound effect,
 * then hands the result to `drawRaster` (also in this module, but
 * DOM-touching and therefore not unit-tested, CLAUDE.md §4). This module
 * also owns {@link rasterFetchKeyEquals}, the pure "did the fetch-relevant
 * props actually change" decision `RasterUnderlay.tsx`'s effect uses
 * instead of putting `fetchRaster`/`fetchRasterMeta` in a dependency array
 * (review-task9.md Critical).
 */

/** Largest value `fetch_raster`/`fetch_raster_meta`'s `width`/`height`
 *  arguments accept (C3 §3.6: both are wire `u16`s). */
const U16_MAX = 65535;

/** One `fetch_raster`/`fetch_raster_meta` request's `width`/`height`/`params`,
 *  built from the current viewport and cell size by {@link rasterRequestFor}. */
export interface RasterRequest {
  /** Requested raster width, in device px (CSS px × `devicePixelRatio`),
   *  clamped to `[1, 65535]` (C3 §3.6's `u16` bound). */
  width: number;
  /** Requested raster height, in device px, clamped the same way. */
  height: number;
  /** The kind-specific params to send; for `histogram2d` this is the input
   *  `params` with `x_bins`/`y_bins` overwritten to match `width`/`height`
   *  (ruling R42) — never the caller's own bin choice. */
  params: SpectrogramParams | Histogram2dParams;
  /** `true` if `width` or `height` was reduced from the raw computed device-px
   *  size to fit `[1, 65535]` — the caller logs/ignores this rather than the
   *  request silently asking for a bogus size on a very-high-DPI display. */
  clamped: boolean;
}

/** Clamps `raw` to `[1, U16_MAX]`, rounding to the nearest integer first
 *  (device-px sizes are always whole pixels). */
function clampDevicePx(raw: number): number {
  return Math.min(Math.max(Math.round(raw), 1), U16_MAX);
}

/** Converts a CSS-px size to device px: `Math.round(cssPx * devicePixelRatio)`.
 *  Used for `RasterUnderlay.tsx`'s `<canvas>` backing-store sizing
 *  (review-fixes-9-10.md Minor) — deliberately **not** {@link clampDevicePx}:
 *  that function's `[1, U16_MAX]` bound is C3 §3.6's wire `u16` limit on a
 *  `fetch_raster` *request*, which has nothing to do with how large a
 *  `<canvas>` element's own backing store is allowed to be. */
export function devicePxSize(cssPx: number, devicePixelRatio: number): number {
  return Math.round(cssPx * devicePixelRatio);
}

/**
 * Builds one `fetch_raster`/`fetch_raster_meta` request from `viewport`'s
 * plotting-area width, the cell's own CSS height, and `devicePixelRatio`.
 *
 * `viewport` (Task 8's {@link Viewport}) carries no vertical extent — it is
 * a time-axis window, not a chart size — so this function takes `heightCssPx`
 * as its own parameter rather than deriving it from `viewport`, per the
 * plan's Task 9 note that either choice is acceptable as long as it is
 * documented (this file documents it here).
 *
 * `width`/`height` are `Math.round(cssPx * devicePixelRatio)`, each clamped
 * to `[1, 65535]` (C3 §3.6's `u16` bound); `clamped` is `true` if either
 * value differs from its raw (unclamped, unrounded) computation.
 *
 * For `kind === "histogram2d"`, the returned `params.x_bins`/`y_bins` are
 * always set to the request's own (already-clamped) `width`/`height` (R42) —
 * the caller's own `x_bins`/`y_bins` on the input `params` are ignored and
 * overwritten, never read. For `kind === "spectrogram"`, `params` (window
 * size, hop size, window, detrend, scaling) passes through unchanged.
 *
 * @param viewport The settled viewport (µs time window + CSS px plotting width).
 * @param kind Which raster this request is for.
 * @param params The kind-specific params; `x_bins`/`y_bins` are ignored and overwritten for `histogram2d`.
 * @param devicePixelRatio `window.devicePixelRatio` (or the caller's own override) — CSS px to device px.
 * @param heightCssPx The cell's plotting-area height, in CSS px.
 */
export function rasterRequestFor(
  viewport: Viewport,
  kind: RasterKind,
  params: SpectrogramParams | Histogram2dParams,
  devicePixelRatio: number,
  heightCssPx: number
): RasterRequest {
  const rawWidth = viewport.pixelWidth * devicePixelRatio;
  const rawHeight = heightCssPx * devicePixelRatio;
  const width = clampDevicePx(rawWidth);
  const height = clampDevicePx(rawHeight);
  const clamped = width !== rawWidth || height !== rawHeight;

  const outParams: SpectrogramParams | Histogram2dParams =
    kind === "histogram2d" ? { ...(params as Histogram2dParams), x_bins: width, y_bins: height } : params;

  return { width, height, params: outParams, clamped };
}

/** The content-determining subset of {@link RasterUnderlayProps} (see
 *  `components/RasterUnderlay.tsx`) that legitimately invalidates an
 *  in-flight raster fetch — deliberately excludes `fetchRaster`/
 *  `fetchRasterMeta`, whose closure identity carries no fetch-relevant
 *  information and must never by itself trigger a refetch
 *  (review-task9.md Critical). */
export interface RasterFetchKey {
  kind: RasterKind;
  params: SpectrogramParams | Histogram2dParams;
  viewport: Viewport;
  /** CSS px. */
  width: number;
  /** CSS px. */
  height: number;
  devicePixelRatio: number;
  sessionId: string;
  channelId: string;
}

/**
 * `true` when every fetch-relevant field of `a` and `b` is equal — the
 * pure decision `RasterUnderlay.tsx`'s effect uses to tell "the settled
 * viewport (or another fetch-relevant prop) actually changed" apart from
 * "an unrelated re-render passed a structurally-identical key" (the
 * latter must never trigger a refetch, review-task9.md Critical).
 * `params` is compared by `JSON.stringify` (a small, JSON-safe,
 * kind-specific object — `SpectrogramParams`/`Histogram2dParams` carry no
 * function or `undefined` field that would make this unsound);
 * `viewport`'s three numeric fields are compared individually rather than
 * relying on the caller passing the same object reference.
 */
export function rasterFetchKeyEquals(a: RasterFetchKey, b: RasterFetchKey): boolean {
  return (
    a.kind === b.kind &&
    a.width === b.width &&
    a.height === b.height &&
    a.devicePixelRatio === b.devicePixelRatio &&
    a.sessionId === b.sessionId &&
    a.channelId === b.channelId &&
    a.viewport.startUs === b.viewport.startUs &&
    a.viewport.endUs === b.viewport.endUs &&
    a.viewport.pixelWidth === b.viewport.pixelWidth &&
    JSON.stringify(a.params) === JSON.stringify(b.params)
  );
}

/** Where to blit a fetched raster given the current viewport, in both the
 *  decoded raster's own device-px pixel-buffer coordinates (source) and the
 *  canvas's CSS-px coordinates (destination), as produced by
 *  {@link alignRasterToAxes}. `null` when the two windows don't overlap. */
export interface RasterDrawRect {
  /** Left edge within the decoded raster's own pixel buffer, in raster px. */
  srcX: number;
  /** Top edge within the decoded raster's own pixel buffer, in raster px — always `0` (see {@link alignRasterToAxes}). */
  srcY: number;
  /** Width of the region to copy, in raster px. */
  srcWidth: number;
  /** Height of the region to copy, in raster px — always `rasterHeightPx` (see {@link alignRasterToAxes}). */
  srcHeight: number;
  /** Left edge of the destination rect, in the canvas's CSS px space. */
  destX: number;
  /** Top edge of the destination rect, in CSS px — always `0`. */
  destY: number;
  /** Width of the destination rect, in CSS px. */
  destWidth: number;
  /** Height of the destination rect, in CSS px — always `heightCssPx`. */
  destHeight: number;
}

/**
 * Computes where a raster fetched for `meta`/`(rasterWidthPx, rasterHeightPx)`
 * should be drawn given `viewport`'s current time window, or `null` if
 * `meta.x_domain` doesn't overlap `viewport` at all.
 *
 * **Unit conversion (load-bearing):** `RasterMeta.x_domain` is in **seconds**
 * since session start (`ipc/rasters.ts`'s `RasterMeta` doc comment), while
 * `Viewport.startUs`/`endUs` are in **µs** since session start (C1 §3.1).
 * This function converts `x_domain` to µs by multiplying by `1_000_000`
 * (`SECONDS_TO_US` below) exactly once, at this boundary, before comparing
 * or subtracting against `viewport` — every other quantity in this function
 * is already in µs or in pixel units, so no further conversion happens
 * anywhere else in this module.
 *
 * The raster's own pixel buffer and the request's `width`/`height`
 * (`rasterWidthPx`/`rasterHeightPx`, i.e. the `DecodedRaster.width`/`height`
 * a prior `rasterRequestFor`-built request produced) are not carried by
 * `RasterMeta` itself, so this function takes them as explicit parameters —
 * the plan's Task 9 pseudocode signature omits them, but a source rectangle
 * in raster-pixel units cannot be computed without knowing the raster's own
 * pixel dimensions; likewise `heightCssPx` (the cell's CSS height, not
 * carried by `Viewport` — see {@link rasterRequestFor}'s doc comment) is
 * needed for the destination rectangle's height. This is a documented,
 * necessary deviation, not a silent one — flagged to the lead in this task's
 * report.
 *
 * Only the X axis is windowed: `y_domain` (frequency, for a spectrogram, or
 * the second channel's value range, for a histogram) is not a function of
 * the visible *time* window, so the full raster height is always drawn —
 * `srcY`/`destY` are always `0` and `srcHeight`/`destHeight` always cover
 * the whole raster/cell height. A future per-axis zoom on `y_domain` is out
 * of this task's scope.
 *
 * @param meta The raster's axis domains (`fetchRasterMeta`'s result).
 * @param rasterWidthPx The decoded raster's own pixel width (`DecodedRaster.width`), in raster px.
 * @param rasterHeightPx The decoded raster's own pixel height (`DecodedRaster.height`), in raster px.
 * @param viewport The current (settled) viewport, in µs.
 * @param heightCssPx The cell's plotting-area height, in CSS px.
 */
export function alignRasterToAxes(
  meta: RasterMeta,
  rasterWidthPx: number,
  rasterHeightPx: number,
  viewport: Viewport,
  heightCssPx: number
): RasterDrawRect | null {
  const SECONDS_TO_US = 1_000_000;
  const domainStartUs = meta.x_domain[0] * SECONDS_TO_US;
  const domainEndUs = meta.x_domain[1] * SECONDS_TO_US;

  const overlapStartUs = Math.max(domainStartUs, viewport.startUs);
  const overlapEndUs = Math.min(domainEndUs, viewport.endUs);
  if (overlapStartUs >= overlapEndUs) {
    return null;
  }

  const usPerRasterPx = (domainEndUs - domainStartUs) / rasterWidthPx;
  const srcX = (overlapStartUs - domainStartUs) / usPerRasterPx;
  const srcWidth = (overlapEndUs - overlapStartUs) / usPerRasterPx;

  const usPerViewportPx = (viewport.endUs - viewport.startUs) / viewport.pixelWidth;
  const destX = (overlapStartUs - viewport.startUs) / usPerViewportPx;
  const destWidth = (overlapEndUs - overlapStartUs) / usPerViewportPx;

  return {
    srcX,
    srcY: 0,
    srcWidth,
    srcHeight: rasterHeightPx,
    destX,
    destY: 0,
    destWidth,
    destHeight: heightCssPx,
  };
}

/**
 * Blits a decoded raster's RGBA8 pixels into `ctx` at `rect`
 * (`alignRasterToAxes`'s output). Never recomputes a colour scale —
 * `RasterMeta.scale.vmin`/`vmax` (resolution-independent, ruling R38) is the
 * only legend source, and this function draws no legend, axis, or Plot mark
 * at all (that is a separate, later task's job on the SVG layer above this
 * canvas).
 *
 * `ImageData`/`putImageData` copy pixels into a canvas 1:1 with no scaling,
 * so a plain `putImageData` cannot honour a `rect` whose source and
 * destination sizes differ (device px vs CSS px on a `devicePixelRatio !==
 * 1` display, or a partial-overlap crop). This function instead paints the
 * full decoded buffer onto a same-sized offscreen `<canvas>` via
 * `putImageData`, then uses `ctx.drawImage`'s 9-argument
 * (source-rect, dest-rect) form to crop and scale in one step —
 * `drawImage` is the browser's own scaling implementation, so no pixel math
 * beyond `rect` (already computed by `alignRasterToAxes`) is needed here.
 * `createImageBitmap` was not used: it is async (returns a `Promise`), and
 * this function's signature (matching the plan's Task 9 interface) is
 * synchronous — an offscreen canvas gives the same scaling correctness
 * without changing that signature. Not unit-tested (CLAUDE.md §4): it
 * touches the DOM (`document.createElement("canvas")`,
 * `CanvasRenderingContext2D`), neither of which jsdom (vitest's DOM
 * environment) implements faithfully enough for `drawImage`/`putImageData`
 * pixel output to be a meaningful assertion — `rasterRequestFor` and
 * `alignRasterToAxes`, the pure geometry this function consumes, are what
 * `rasterLayer.test.ts` exercises instead.
 *
 * @param ctx The destination canvas's 2D context (`ChartCell`'s `chart-cell-underlay` canvas).
 * @param decoded The decoded raster (`ipc/rasters.ts`'s `decodeRaster` output).
 * @param rect Source/destination rectangles from `alignRasterToAxes`.
 */
export function drawRaster(ctx: CanvasRenderingContext2D, decoded: DecodedRaster, rect: RasterDrawRect): void {
  const offscreen = document.createElement("canvas");
  offscreen.width = decoded.width;
  offscreen.height = decoded.height;
  const offscreenCtx = offscreen.getContext("2d");
  if (offscreenCtx === null) {
    // TODO(idl0): no 2D context available (e.g. too many live contexts) —
    // the raster is silently skipped for this settle rather than throwing,
    // consistent with ChartCell's own swallowed-fetch-failure TODO.
    return;
  }
  // `decoded.pixels` is a view over `decodeRaster`'s `ArrayBuffer`, typed as
  // `Uint8ClampedArray<ArrayBufferLike>` by TS's DOM lib; `ImageData`'s
  // constructor requires the narrower `Uint8ClampedArray<ArrayBuffer>`, so a
  // defensive copy (also required in the `SharedArrayBuffer` case, which
  // `ImageData` never accepts) satisfies both the type and the runtime contract.
  offscreenCtx.putImageData(new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height), 0, 0);

  ctx.drawImage(
    offscreen,
    rect.srcX,
    rect.srcY,
    rect.srcWidth,
    rect.srcHeight,
    rect.destX,
    rect.destY,
    rect.destWidth,
    rect.destHeight
  );
}
