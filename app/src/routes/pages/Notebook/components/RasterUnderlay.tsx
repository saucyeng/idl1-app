import { useEffect, useRef, useState } from "react";

import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import {
  alignRasterToAxes,
  devicePxSize,
  drawRaster,
  formatScaleRange,
  rasterFetchKeyEquals,
  rasterRequestFor,
  type RasterFetchKey,
} from "../model/rasterLayer";
import { buildLegendGradient } from "../model/rasterLegend";
import { isStaleSettleResult } from "../model/settle";
import type { Viewport } from "../model/viewport";
import { formatUnit } from "../model/unitText";

/** The subset of a resolved `RasterMeta` this component keeps in state to
 *  draw its label overlay (raster-labels lane, ruling R177) — `x_domain`/
 *  `y_domain`/`transparent_zero` feed `alignRasterToAxes`/`drawRaster`
 *  directly inside the fetch effect and are never needed after that, so
 *  they are not carried into state. */
interface RasterLabels {
  xLabel: string;
  yLabel: string;
  /** Pre-formatted per {@link formatScaleRange}: `scale.vmin`/`vmax` plus
   *  `magnitude_unit` (`formatUnit`'s three-state text, R154), computed
   *  once when the fetch resolves rather than on every render. */
  rangeText: string;
  /** `formatUnit(magnitude_unit).unknownReason` (`null` for `known`,
   *  `dimensionless`, or a `null` `magnitude_unit`) — carried separately
   *  from `rangeText` since `formatUnit`'s `unknown` state renders no text
   *  of its own but still has a reason worth surfacing (R154), same as the
   *  magnitude-unit-only display did before this task. */
  unknownReason: string | null;
  /** The colour-bar's CSS gradient, built by {@link buildLegendGradient}
   *  from the engine's `RasterMeta.ramp_stops` (C3 §3.6, ruling R177) —
   *  never from a ramp recomputed here. `null` when the meta carried too
   *  few stops to form a gradient, in which case no bar renders and the
   *  range text alone still says what the colours mean. */
  legendGradient: string | null;
}

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
 * Alongside the canvas, prints the fetched `RasterMeta.x_label`/`y_label`
 * and `scale.vmin`/`vmax` (raster-labels lane, ruling R177) — this canvas
 * has no other axis furniture at all (no Plot `<svg>` axis layer sits over
 * a raster underlay today, per this lane's report), so the labels are
 * plain absolutely-positioned overlay text rather than drawn ticks: the
 * `x_label` bottom-centre, `y_label` top-left rotated, and the range —
 * `scale.vmin`/`vmax` formatted by {@link formatScaleRange} with the
 * already-fetched `magnitude_unit` (chart-honesty lane task 2, ruling
 * R167) as its unit — top-right, where the unit alone used to sit alone.
 * Beside that range sits the colour bar itself, a CSS gradient built by
 * {@link buildLegendGradient} from `RasterMeta.ramp_stops` — the engine's
 * own Turbo samples (C3 §3.6, ruling R177). The ramp is never recomputed
 * here and never sampled back out of the fetched pixels, so the bar cannot
 * drift from the picture it describes. The text range stays: it prints, and
 * it is what a reader with no colour still gets.
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

  // `null` until the first `fetchRasterMeta` resolves — there is no wrong
  // state to show before that (the labels simply don't render, same as
  // `magnitudeUnit`'s own pre-R177 null state did).
  const [labels, setLabels] = useState<RasterLabels | null>(null);

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
        // `magnitude_unit === null` (a histogram2d, which has no spectral
        // magnitude) formats with no unit at all rather than routing
        // through `formatUnit`'s `unknown` path (task 2).
        const unitDisplay = meta.magnitude_unit === null ? null : formatUnit(meta.magnitude_unit);
        setLabels({
          // `x_label`/`y_label` arrive as engine-authored display strings
          // (task 1) — rendered as given, never reformatted/re-cased/unit-suffixed.
          xLabel: meta.x_label,
          yLabel: meta.y_label,
          rangeText: formatScaleRange(meta.scale.vmin, meta.scale.vmax, unitDisplay === null ? "" : unitDisplay.text),
          unknownReason: unitDisplay === null ? null : unitDisplay.unknownReason,
          legendGradient: buildLegendGradient(meta.ramp_stops),
        });
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
      {labels !== null && (
        <>
          {/* `RasterMeta.x_label` (task 1): rendered as given, no axis
              furniture (ticks, a line) exists on this canvas to attach it
              to today — plain overlay text, bottom-centre. */}
          <div
            className="chart-cell-raster-x-label"
            style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 11, pointerEvents: "none" }}
          >
            {labels.xLabel}
          </div>
          {/* `RasterMeta.y_label` (task 1), rotated to sit flush against
              the left edge — the same "no existing furniture" placement
              call as `x_label` above. */}
          <div
            className="chart-cell-raster-y-label"
            style={{
              position: "absolute",
              top: 4,
              left: 2,
              fontSize: 11,
              pointerEvents: "none",
              transformOrigin: "top left",
              transform: "rotate(-90deg) translateX(-100%)",
            }}
          >
            {labels.yLabel}
          </div>
          {/* `RasterMeta.scale.vmin`/`vmax` (task 2, ruling R177): a plain
              numeric range with `magnitude_unit` as its unit — three-state
              per `formatUnit` (R154), same convention the magnitude-unit-only
              display used before this task: `unknown` shows no text of its
              own but its `title` attribute carries `unknownReason` where a
              reader can reach it (there is no appendix to route it to on
              screen, unlike the report). */}
          <div
            className="chart-cell-raster-unit"
            style={{ position: "absolute", top: 4, right: 4, fontSize: 11, pointerEvents: "none", display: "flex", alignItems: "center", gap: 4 }}
          >
            {/* The colour bar (ruling R177): the engine's own ramp stops as
                a CSS gradient, left end `scale.vmin`, right end `scale.vmax`
                — the same order the range text beside it reads in. The bar
                is *data*, not decoration: `printColorAdjust: "exact"` keeps
                it as-is on paper, where a browser would otherwise drop a
                background gradient and leave a legend of nothing. No palette
                swap; a re-hued ramp would mislabel the pixels it describes.
                Renders only when `buildLegendGradient` had two or more stops
                — the text range alone still carries the meaning. */}
            {labels.legendGradient !== null && (
              <span
                className="chart-cell-raster-legend"
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 48,
                  height: 6,
                  background: labels.legendGradient,
                  printColorAdjust: "exact",
                  WebkitPrintColorAdjust: "exact",
                }}
              />
            )}
            <span>{labels.rangeText}</span>
            {labels.unknownReason !== null && <span title={labels.unknownReason}>{"†"}</span>}
          </div>
        </>
      )}
    </>
  );
}
