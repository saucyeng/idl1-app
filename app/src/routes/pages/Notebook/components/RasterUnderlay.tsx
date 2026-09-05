import { useEffect, useRef } from "react";

import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import { alignRasterToAxes, drawRaster, rasterRequestFor } from "../model/rasterLayer";
import type { Viewport } from "../model/viewport";

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
 * The fetch is triggered only by `viewport` changing (see its doc comment
 * above) — never by `width`/`height`/`devicePixelRatio` alone changing on
 * their own without a settled viewport change, and never from a
 * gesture/`requestAnimationFrame` callback (P1, P3, P4): this effect is the
 * same shape as `ChartCell`'s settle-bound `ensureTiles` call, just
 * expressed as "run when the settled prop changes" rather than "run inside
 * the settle debouncer's own callback" — both only fire once per settle.
 *
 * The wiring below (compute request → fetch pixels + meta → align → draw)
 * makes no decision of its own beyond that sequence — no caching, no
 * skip-if-unchanged check beyond React's own effect-dependency comparison —
 * so per the operating brief's IPC-effects rule (§4) this effect calling
 * `rasterRequestFor`/`fetchRaster`/`fetchRasterMeta`/`alignRasterToAxes`/
 * `drawRaster` directly is the rule's own "the effect only calls it" escape
 * hatch, not a missing pure driver module.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }

    const request = rasterRequestFor(viewport, kind, params, devicePixelRatio, height);
    let cancelled = false;

    Promise.all([
      fetchRaster(sessionId, channelId, kind, request.width, request.height, request.params),
      fetchRasterMeta(sessionId, channelId, kind, request.width, request.height, request.params),
    ])
      .then(([decoded, meta]) => {
        if (cancelled) {
          return;
        }
        const rect = alignRasterToAxes(meta, decoded.width, decoded.height, viewport, height);
        if (rect === null) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        drawRaster(ctx, decoded, rect);
      })
      .catch(() => {
        // TODO(idl0): a raster fetch failure is swallowed — the underlay
        // keeps whatever it last drew rather than surfacing an error,
        // mirroring ChartCell's own swallowed tile-fetch-failure TODO.
      });

    return () => {
      cancelled = true;
    };
  }, [kind, params, viewport, width, height, devicePixelRatio, sessionId, channelId, fetchRaster, fetchRasterMeta]);

  return (
    <canvas
      ref={canvasRef}
      className="chart-cell-underlay"
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
