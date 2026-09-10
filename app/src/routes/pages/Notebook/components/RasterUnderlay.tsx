import { useEffect, useRef, useState } from "react";

import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { UnitLabel } from "../../../../ipc/workbook";
import {
  alignRasterToAxes,
  devicePxSize,
  drawRaster,
  rasterFetchKeyEquals,
  rasterRequestFor,
  type RasterFetchKey,
} from "../model/rasterLayer";
import { isStaleSettleResult } from "../model/settle";
import type { Viewport } from "../model/viewport";
import { formatUnit } from "../model/unitText";

/** Props for {@link RasterUnderlay}. */
export interface RasterUnderlayProps {
  /** Which raster kind this cell shows. */
  kind: RasterKind;
  /** The kind-specific params (`x_bins`/`y_bins` on a `Histogram2dParams` are ignored, R42 — see `rasterRequestFor`). */
  params: SpectrogramParams | Histogram2dParams;
  /** The settled viewport this cell is showing. `ChartCell` passes its own
   *  `viewport` prop (the last-committed window, distinct from its
   *  in-gesture `liveViewport` local state) — this component's effect below
   *  runs only when *this* value changes, so it is inherently settle-bound:
   *  `viewport` is updated exactly once per settle, by the parent, after
   *  Task 8's settle-debounced tile fetch resolves and calls
   *  `onViewportSettled`; it never changes on a live drag/wheel frame. */
  viewport: Viewport;
  /** CSS px plotting-area width — must match `viewport.pixelWidth`; kept
   *  separate since `rasterRequestFor` and `alignRasterToAxes` take it that way. */
  width: number;
  /** CSS px plotting-area height (`Viewport` carries no vertical extent). */
  height: number;
  /** `window.devicePixelRatio`, or the caller's own override for testing. */
  devicePixelRatio: number;
  /** Session id, for the injected fetch functions below. */
  sessionId: string;
  /** The raster's source channel id (spectrogram's own channel, or a
   *  histogram2d's X channel — `Histogram2dParams.y_channel` names the Y one). */
  channelId: string;
  /** Fetches and decodes one raster's pixels. Injected (mirrors `ChartCell`'s
   *  own `fetchTile` prop) so this component imports nothing from `ipc/`. */
  fetchRaster: (
    sessionId: string,
    channel: string,
    kind: RasterKind,
    width: number,
    height: number,
    params: SpectrogramParams | Histogram2dParams
  ) => Promise<DecodedRaster>;
  /** Fetches one raster's axis domains/colour scale, without pixel bytes. */
  fetchRasterMeta: (
    sessionId: string,
    channel: string,
    kind: RasterKind,
    width: number,
    height: number,
    params: SpectrogramParams | Histogram2dParams
  ) => Promise<RasterMeta>;
}

/**
 * Draws a Rust-computed spectrogram or 2-D histogram raster beneath a chart
 * cell's Plot axes, into its own `<canvas className="chart-cell-underlay">`
 * (design §6 "Point budget"; C3 §3.6). Renders its own canvas rather than
 * taking a ref to `ChartCell`'s — swapping the previously-bare placeholder
 * `<canvas>` element for `<RasterUnderlay>` in `ChartCell.tsx`'s JSX is a
 * smaller, more localized change than lifting a canvas ref up through props
 * (the other option the plan's Task 9 note allows).
 *
 * Alongside the canvas, prints the fetched `RasterMeta.magnitude_unit`
 * (chart-honesty lane task 2, ruling R167) — the only place a spectral
 * raster's own axes are labelled at all today (`x_label`/`y_label`/`scale`
 * are likewise fetched here and, like the unit was before this task, drawn
 * nowhere; widening that is out of this task's scope).
 *
 * The fetch is triggered only by `kind`/`params`/`viewport`/`width`/
 * `height`/`devicePixelRatio`/`sessionId`/`channelId` actually changing
 * (see {@link rasterFetchKeyEquals}) — never merely by an unrelated
 * re-render (which can hand this component a fresh `fetchRaster`/
 * `fetchRasterMeta` closure with no stability contract), and never from a
 * gesture/`requestAnimationFrame` callback (P1, P3, P4): this effect is the
 * same shape as `ChartCell`'s settle-bound `ensureTiles` call, just
 * expressed as "run when the settled prop changes" rather than "run inside
 * the settle debouncer's own callback" — both only fire once per settle.
 *
 * **review-task9.md Critical fix.** `fetchRaster`/`fetchRasterMeta` are
 * held in refs (`ChartCell.tsx`'s `onSettleRef` pattern) and never sit in
 * this effect's own re-run condition; the effect itself has no dependency
 * array at all (it runs after every render) but is a no-op except when
 * `rasterFetchKeyEquals` says the fetch-relevant props actually changed
 * from the last dispatch — so a caller re-render that only recreates the
 * function props never tears down or duplicates an in-flight fetch. A
 * resolved fetch is guarded against a *newer* dispatch superseding it by a
 * monotonic `epochRef` compared via `isStaleSettleResult` (Task 8's
 * pattern) rather than by a `cancelled`-on-cleanup flag — there is no
 * cleanup function here at all, since nothing needs cancelling: a stale
 * result is simply dropped on arrival.
 *
 * The wiring below (compute request → fetch pixels + meta → align → draw)
 * makes no decision of its own beyond that sequence — no caching beyond the
 * `rasterFetchKeyEquals` gate above — so per the operating brief's
 * IPC-effects rule (§4) this effect calling `rasterRequestFor`/
 * `fetchRaster`/`fetchRasterMeta`/`alignRasterToAxes`/`drawRaster` directly
 * is the rule's own "the effect only calls it" escape hatch, not a missing
 * pure driver module — `rasterFetchKeyEquals` (in `model/rasterLayer.ts`,
 * unit-tested there) is the one piece of real decision logic, and it is
 * already extracted and pure.
 */
export default function RasterUnderlay({
  kind,
  params,
  viewport,
  width,
  height,
  devicePixelRatio,
  sessionId,
  channelId,
  fetchRaster,
  fetchRasterMeta,
}: RasterUnderlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // `RasterMeta.magnitude_unit` (R167) — `null` until the first fetch
  // resolves, indistinguishable on screen from a genuine `null` (a
  // histogram2d has no spectral magnitude at all): both render nothing,
  // so there is no wrong state to show before the first result arrives.
  const [magnitudeUnit, setMagnitudeUnit] = useState<UnitLabel | null>(null);

  // Held in refs so an unrelated re-render's fresh closure identity for
  // these two props can never by itself invalidate the effect below —
  // review-task9.md Critical, the same pattern ChartCell.tsx's
  // `onSettleRef` already uses for `fetchTile`.
  const fetchRasterRef = useRef(fetchRaster);
  fetchRasterRef.current = fetchRaster;
  const fetchRasterMetaRef = useRef(fetchRasterMeta);
  fetchRasterMetaRef.current = fetchRasterMeta;

  const key: RasterFetchKey = { kind, params, viewport, width, height, devicePixelRatio, sessionId, channelId };
  const dispatchedKeyRef = useRef<RasterFetchKey | null>(null);
  const epochRef = useRef(0);

  // No dependency array: this runs after every render, but is a no-op
  // except when `rasterFetchKeyEquals` says a fetch-relevant prop actually
  // changed since the last dispatch (review-task9.md Critical) — see the
  // doc comment above for why this replaces both the old dependency array
  // and the old `cancelled`-on-cleanup guard.
  useEffect(() => {
    if (dispatchedKeyRef.current !== null && rasterFetchKeyEquals(dispatchedKeyRef.current, key)) {
      return;
    }
    dispatchedKeyRef.current = key;

    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }

    epochRef.current += 1;
    const dispatchEpoch = epochRef.current;
    const request = rasterRequestFor(viewport, kind, params, devicePixelRatio, height);

    Promise.all([
      fetchRasterRef.current(sessionId, channelId, kind, request.width, request.height, request.params),
      fetchRasterMetaRef.current(sessionId, channelId, kind, request.width, request.height, request.params),
    ])
      .then(([decoded, meta]) => {
        if (isStaleSettleResult(dispatchEpoch, epochRef.current)) {
          return;
        }
        setMagnitudeUnit(meta.magnitude_unit);
        // Always clear in the canvas's own (identity) device-px coordinate
        // space first, regardless of whether a rect is drawn below.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = alignRasterToAxes(meta, decoded.width, decoded.height, viewport, height);
        if (rect === null) {
          return;
        }
        // `rect`'s dest coordinates are CSS px (`alignRasterToAxes`'s doc
        // comment); the canvas's backing store is device px (see the
        // element below) — this transform maps CSS-px draw calls onto the
        // device-px buffer, the standard high-DPI-canvas pattern
        // (review-task9.md Important).
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        drawRaster(ctx, decoded, rect);
      })
      .catch(() => {
        // TODO(idl0): a raster fetch failure is swallowed — the underlay
        // keeps whatever it last drew rather than surfacing an error,
        // mirroring ChartCell's own swallowed tile-fetch-failure TODO.
      });
  });

  const magnitudeUnitDisplay = magnitudeUnit === null ? null : formatUnit(magnitudeUnit);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="chart-cell-underlay"
        // Backing store sized in device px (review-task9.md Important: the
        // raster itself was fetched at device-px resolution via
        // `rasterRequestFor`'s own `devicePixelRatio` multiplication — a
        // canvas whose buffer is only CSS-px resolution would silently
        // downscale that crisper source). The CSS box below stays at the
        // CSS-px size so the element still occupies the same on-screen area.
        width={devicePxSize(width, devicePixelRatio)}
        height={devicePxSize(height, devicePixelRatio)}
        style={{ position: "absolute", inset: 0, width: `${width}px`, height: `${height}px`, pointerEvents: "none" }}
      />
      {/* `RasterMeta.magnitude_unit` (R167): a spectrogram's own magnitude
          axis unit, three-state per `formatUnit` (R154) — `known` shows its
          text, `dimensionless` and a pre-first-fetch/histogram2d `null`
          show nothing, `unknown` shows nothing but its `title` attribute
          carries `unknownReason` where a reader can reach it (there is no
          appendix to route it to on screen, unlike the report). */}
      {magnitudeUnitDisplay !== null && (magnitudeUnitDisplay.text !== "" || magnitudeUnitDisplay.unknownReason !== null) && (
        <div className="chart-cell-raster-unit" style={{ position: "absolute", top: 4, right: 4, fontSize: 11, pointerEvents: "none" }}>
          {magnitudeUnitDisplay.text}
          {magnitudeUnitDisplay.unknownReason !== null && <span title={magnitudeUnitDisplay.unknownReason}>{"†"}</span>}
        </div>
      )}
    </>
  );
}
