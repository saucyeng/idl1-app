import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import type { DecodedTile } from "../../../../ipc/tiles";
import { hoverAt, type HoverGeometry } from "../model/hover";
import { makeSettle } from "../model/settle";
import { chooseTier, tileRange } from "../model/tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "../model/tileCache";
import { clampTo, panBy, transformFor, zoomAt, type Viewport } from "../model/viewport";

/** The value a successful {@link hoverAt} lookup adds to on-screen hover state. */
interface HoverReading {
  /** CSS px position of the pointer within this cell, for placing the tooltip. */
  pixelX: number;
  /** µs since session start of the hovered column. */
  tUs: bigint;
  min: number;
  max: number;
  mean: number;
}

/** Debounce delay for gesture settle (design §6; C3 §4 "Interaction budget"):
 *  a gesture frame updates only local viewport state and the CSS/canvas
 *  transform (`transformFor`, P3/P4); this many ms after the last such frame
 *  with no further gesture input, the settle callback below re-selects a
 *  tier and is the sole caller of `ensureTiles`. No spec number is given for
 *  the exact delay; 150ms is a reasonable implementation-time default —
 *  short enough to feel responsive once a gesture actually stops, long
 *  enough that no individual frame of a scroll/drag/pinch ever reaches it. */
const SETTLE_DELAY_MS = 150;

/** Wheel-to-zoom sensitivity (there is no pinch-gesture DOM API on desktop;
 *  the mouse wheel's `deltaY` drives zoom instead). No spec number is given;
 *  this converts a `deltaY` of 100 (one "notch" in most browsers/mice) to
 *  roughly a 10% zoom step, `factor = e^(-deltaY * sensitivity)`. */
const WHEEL_ZOOM_SENSITIVITY = 0.001;

/**
 * Props for {@link ChartCell}. `tiles`/`viewport` are the already-decoded
 * tiles and the time window they were fetched for — the "rendered" picture
 * that a gesture slides/scales locally with no fetch (P3/P4) until this
 * cell's own settle-triggered fetch (below) resolves and the parent commits
 * a new `viewport`/`tiles` pair back down via `onViewportSettled`.
 */
export interface ChartCellProps {
  /** Decoded tiles currently covering `viewport`, in ascending time order. */
  tiles: DecodedTile[];
  /** CSS px width of the plotted area; also the `columnCount` tiles are fetched at (R43). */
  width: number;
  /** CSS px height of the plotted area. */
  height: number;
  /** The time window `tiles` was fetched/rendered for. */
  viewport: Viewport;
  /** Total session duration, in µs, for clamping pan/zoom at the session's edges. */
  sessionSpanUs: number;
  /** Owning session id, for the tile cache key and `fetchTile`. */
  sessionId: string;
  /** This cell's bound channel id, for the tile cache key and `fetchTile`. */
  channelId: string;
  /** The channel's nominal sample rate, in Hz (C1 §2) — feeds `chooseTier`/`tileRange`. */
  sampleRateHz: number;
  /** The tile cache this cell's settle-triggered fetch reads/fills. Shared
   *  with anything else in the notebook rendering the same channel, so two
   *  cells (or a rebuild replay, `model/channelRebind.ts`) never re-fetch
   *  what the other already cached. */
  cache: TileCache;
  /** Fetches and decodes one tile at `tier`/`tileIndex`, at this cell's own
   *  `columnCount` (its `width`, R43). Injected — this component and
   *  `ensureTiles` import nothing from `ipc/tiles.ts`; the caller supplies
   *  the real fetch bound to `sessionId`/`channelId`. */
  fetchTile: (tier: number, tileIndex: number, columnCount: number) => Promise<DecodedTile>;
  /**
   * Called once a gesture settle's fetch resolves, with the newly committed
   * viewport, the tier it was fetched at, and the tiles now covering that
   * viewport, read back from `cache`. `tiles` here is always the *full*,
   * contiguous set for `[range.first, range.last]` — this callback never
   * fires with a partial range (a fetch failure is swallowed rather than
   * handing the caller a wrong-but-plausible gap; see the
   * `// TODO(idl0):` below). This is what closes `model/hover.ts`'s own
   * `// TODO(idl0)` about a mid-window hole: the tiles a caller then feeds
   * back into this cell's `tiles` prop (and to `hoverAt`/`tileToChannelData`)
   * are guaranteed contiguous by construction, not by hover's own checking.
   */
  onViewportSettled: (viewport: Viewport, tier: number, tiles: DecodedTile[]) => void;
}

/**
 * The chart frame for one notebook cell (design §6): a positioning
 * container holding the sandbox iframe's rendered Plot output (mounted by
 * `host/SandboxHost.ts`, not this component) plus a `<canvas>` raster
 * underlay (its content wired by Task 9) and an absolutely positioned hover
 * tooltip.
 *
 * Pan (drag) and zoom (wheel) update local viewport state and the CSS
 * transform (`transformFor`) only, every frame — neither `onPointerMove` nor
 * `onWheel` calls `ensureTiles`, `fetchTile`, or anything under `ipc/`
 * (performance budgets P3/P4). The debounced settle callback built from
 * `makeSettle` is the **sole** caller of `ensureTiles`, once the gesture
 * stops: it re-runs `chooseTier` for the settled viewport, computes the tile
 * range via `tileRange`, and fetches any indices `cache` is missing.
 *
 * Playback prefetch (design §6: "Playback prefetches ahead of the
 * playhead") is **not** implemented here — it is a separate mechanism
 * driven by a lookahead timer tracking the playhead, not a gesture frame,
 * and is out of this task's scope (do not read a future prefetch call site
 * as a P4 violation of the rule enforced here).
 *
 * The pointer-move hover path (when not dragging) calls {@link hoverAt} — a
 * pure read of the tiles already in memory — and only ever calls `setHover`
 * (React state); it never calls `invoke` or any `ipc/*` function (P1), and
 * hover never reaches `cursor_readout` (P2).
 */
export default function ChartCell({
  tiles,
  width,
  height,
  viewport,
  sessionSpanUs,
  sessionId,
  channelId,
  sampleRateHz,
  cache,
  fetchTile,
  onViewportSettled,
}: ChartCellProps) {
  const [hover, setHover] = useState<HoverReading | null>(null);
  const [liveViewport, setLiveViewport] = useState<Viewport>(viewport);
  const draggingRef = useRef<{ pointerId: number; lastClientX: number } | null>(null);

  // A newly committed `viewport` from the parent (post-settle, or any other
  // cause) always replaces whatever gesture-local state was live — a stale
  // in-gesture viewport must never persist across an externally driven change.
  useEffect(() => {
    setLiveViewport(viewport);
  }, [viewport]);

  // Indirected through a ref so the debouncer instance below (and its
  // pending timer) stays stable across renders instead of being torn down
  // and recreated whenever a parent passes a fresh `onViewportSettled`/prop
  // closure identity.
  const onSettleRef = useRef<(next: Viewport) => void>(() => {});
  onSettleRef.current = (next: Viewport) => {
    const tier = chooseTier(next.endUs - next.startUs, next.pixelWidth, sampleRateHz);
    const range = tileRange(next.startUs, next.endUs, tier, sampleRateHz);
    const key: Omit<TileCacheKey, "tileIndex"> = { sessionId, channelId, tier, columnCount: width };

    ensureTiles(cache, key, range, (tileIndex) => fetchTile(tier, tileIndex, width))
      .then(() => {
        const covered: DecodedTile[] = [];
        for (let tileIndex = range.first; tileIndex <= range.last; tileIndex++) {
          const tile = cache.get({ ...key, tileIndex });
          if (tile === undefined) {
            // TODO(idl0): a tile evicted between ensureTiles resolving and
            // this read (a very small window, but not impossible under
            // byte-cap pressure from another cell) drops this settle's
            // update entirely rather than handing a partial range up —
            // consistent with never handing hoverAt/tileToChannelData a
            // gap, but means a subsequent gesture is needed to recover.
            return;
          }
          covered.push(tile);
        }
        onViewportSettled(next, tier, covered);
      })
      .catch(() => {
        // TODO(idl0): a fetch failure here is swallowed — the picture stays
        // on its last successfully committed viewport rather than surfacing
        // an error. Typed fetch-error surfacing (e.g. into the tooltip or a
        // cell-level error state) is not in this task's scope.
      });
  };

  const settleRef = useRef(makeSettle<Viewport>(SETTLE_DELAY_MS, (next) => onSettleRef.current(next)));

  useEffect(() => {
    const settle = settleRef.current;
    return () => settle.cancel();
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = { pointerId: event.pointerId, lastClientX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const dragging = draggingRef.current;

      if (dragging !== null && dragging.pointerId === event.pointerId) {
        const pixelDx = event.clientX - dragging.lastClientX;
        dragging.lastClientX = event.clientX;
        setLiveViewport((current) => {
          const next = clampTo(panBy(current, pixelDx), sessionSpanUs);
          settleRef.current.notify(next);
          return next;
        });
        setHover(null);
        return;
      }

      const geometry: HoverGeometry = { originPx: 0, pixelWidth: width };
      const reading = hoverAt(tiles, pixelX, geometry);
      setHover(reading === null ? null : { pixelX, ...reading });
    },
    [tiles, width, sessionSpanUs]
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragging = draggingRef.current;
    if (dragging !== null && dragging.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      draggingRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragging = draggingRef.current;
    if (dragging !== null && dragging.pointerId === event.pointerId) {
      draggingRef.current = null;
    }
    setHover(null);
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setLiveViewport((current) => {
        const next = clampTo(zoomAt(current, pixelX, factor), sessionSpanUs);
        settleRef.current.notify(next);
        return next;
      });
    },
    [sessionSpanUs]
  );

  const transform = transformFor(viewport, liveViewport);

  return (
    <div
      className="chart-cell"
      style={{ position: "relative", width, height, overflow: "hidden" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      <div
        className="chart-cell-picture"
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${transform.translateXPx}px) scaleX(${transform.scaleX})`,
          transformOrigin: "left",
        }}
      >
        <canvas
          className="chart-cell-underlay"
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
        <div className="chart-cell-sandbox-mount" style={{ position: "absolute", inset: 0 }} />
      </div>
      {hover !== null && (
        <div
          className="chart-cell-tooltip"
          style={{ position: "absolute", left: hover.pixelX, top: 0, pointerEvents: "none" }}
        >
          {`t=${Number(hover.tUs) / 1_000_000}s min=${hover.min} max=${hover.max} mean=${hover.mean}`}
        </div>
      )}
    </div>
  );
}
