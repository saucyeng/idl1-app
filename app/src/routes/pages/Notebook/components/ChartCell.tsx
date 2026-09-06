import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import type { CursorReadout } from "../../../../ipc/cursor";
import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { DecodedTile } from "../../../../ipc/tiles";
import type { ReadoutPanelState } from "../model/cursor";
import { CURSOR_SETTLE_MS, makeCursorReadoutDriver, type CursorReadoutDriverDeps } from "../model/cursorReadoutDriver";
import { hoverAt, type HoverGeometry } from "../model/hover";
import { isStaleSettleResult, makeSettle } from "../model/settle";
import { chooseTier, tileRange } from "../model/tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "../model/tileCache";
import { clampTo, panBy, transformFor, zoomAt, type Viewport } from "../model/viewport";
import CursorReadoutPanel from "./CursorReadout";
import RasterUnderlay from "./RasterUnderlay";

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
  /**
   * This cell's C2 fence-string id, for routing the `transform`/`layout`
   * `postMessage`s (R69 items (b)/(a)) to the matching sandbox-rendered
   * container (`host/protocol.ts`'s `transformMessage`/`layoutMessage`).
   */
  cellId: string;
  /** Decoded tiles currently covering `viewport`, in ascending time order. */
  tiles: DecodedTile[];
  /** CSS px width of the plotted area; also the `columnCount` tiles are fetched at (R43). */
  width: number;
  /**
   * CSS px height of the plotted area, used until the sandbox's own
   * `cellRendered` reports this cell's actual rendered height
   * ({@link heightPx}) -- the fallback for the brief window between mount
   * and that message's arrival, never overridden once `heightPx` is set.
   */
  height: number;
  /**
   * This cell's last `cellRendered.heightPx` (R69 item (a)), or `null`
   * before the sandbox has rendered it once. Drives this frame's actual
   * CSS height once known, so the frame always matches the sandbox's real
   * rendered output instead of a caller-guessed constant.
   */
  heightPx: number | null;
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
  /**
   * Present only for a raster-kind cell (Task 9: spectrogram or 2-D
   * histogram density under this cell's Plot axes). When set,
   * {@link RasterUnderlay} replaces the plain `<canvas
   * className="chart-cell-underlay">` placeholder and fetches/draws a
   * raster whenever this cell's settled `viewport` prop changes (never on a
   * live gesture frame, never on every render — see
   * `RasterUnderlay`'s own doc comment). `undefined` for a line-only cell,
   * which renders the placeholder canvas unused/empty as before.
   */
  raster?: {
    kind: RasterKind;
    params: SpectrogramParams | Histogram2dParams;
    devicePixelRatio: number;
    fetchRaster: (
      sessionId: string,
      channel: string,
      kind: RasterKind,
      width: number,
      height: number,
      params: SpectrogramParams | Histogram2dParams
    ) => Promise<DecodedRaster>;
    fetchRasterMeta: (
      sessionId: string,
      channel: string,
      kind: RasterKind,
      width: number,
      height: number,
      params: SpectrogramParams | Histogram2dParams
    ) => Promise<RasterMeta>;
  };
  /**
   * Reads the nearest recorded sample for `channels` at `tUs` (`ipc/cursor.ts`'s
   * `cursorReadout`). Injected, mirroring `fetchTile`/`raster.fetchRaster` —
   * this component imports `ipc/cursor.ts` only as a type, never calls
   * `invoke` itself. Called at most once per settle (Task 10; C3 §4), never
   * from a pointer-move/wheel/`requestAnimationFrame` handler (P1, P2).
   */
  fetchCursorReadout: (sessionId: string, channels: string[], tUs: number) => Promise<CursorReadout>;
  /**
   * Display label for this cell's own `channelId`, for the cursor readout
   * panel's row (Task 10). This cell plots exactly one channel, so the
   * readout requests/renders only that one channel; a future multi-channel
   * overlay cell would need its own label map, out of this task's scope.
   * `undefined` falls back to the raw `channelId` (`formatReadout`'s own
   * missing-label fallback, documented in `model/cursor.ts`).
   */
  channelLabel?: string;
  /**
   * Sends one gesture frame's CSS transform to the sandbox for this cell
   * (R69 item (b)) -- a thin closure over `host/SandboxHost.ts`'s
   * `sendTransform`, bound to `cellId`, injected the same way
   * `fetchTile`/`fetchCursorReadout` are so this component never imports
   * `host/SandboxHost.ts` itself. Called on every live drag/wheel frame
   * (mirroring this component's own local `transformFor` application to
   * its host-rendered raster underlay), never gated on settle.
   */
  sendTransform: (cellId: string, translateXPx: number, scaleX: number) => void;
  /**
   * Sends this cell's current on-screen rectangle to the sandbox (a
   * plumbing addition beyond R69's two named messages -- see
   * `host/protocol.ts`'s `layoutMessage` doc comment for why a single
   * shared iframe needs it) so the sandbox can position that cell's own
   * rendered container to appear under this frame. Called on mount and
   * whenever this frame's on-screen rectangle changes (resize, scroll) --
   * never on a live gesture frame, which uses {@link sendTransform}
   * instead of a full re-layout.
   */
  sendLayout: (cellId: string, rect: { top: number; left: number; width: number }) => void;
}

/**
 * The host-side gesture/orchestration frame for one notebook `js` cell
 * (design §6; R69 item (c)). This component renders **no** sandbox output
 * itself — the shared sandbox `<iframe>` (`host/SandboxHost.ts`, one per
 * notebook) renders every cell's own picture inside its own DOM and is
 * positioned by this frame's `sendLayout` calls to appear, pixel for
 * pixel, underneath this frame's own on-screen rect (`frameRef`); this
 * frame's own DOM only ever holds a raster underlay — either a plain empty
 * `<canvas className="chart-cell-underlay">` placeholder for a line-only
 * cell, or {@link RasterUnderlay} (Task 9) for a raster-kind cell (the
 * `raster` prop) — and an absolutely positioned hover tooltip. Its own
 * background is transparent and it sits above the iframe in z-order but
 * paints nothing over the sandbox's picture, so the sandbox's rendered
 * pixels show through while this frame alone captures pointer/wheel input
 * (the iframe itself is `pointer-events: none`, per `Notebook/index.tsx`'s
 * container styling).
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
 *
 * The cross-channel cursor readout (Task 10, `components/CursorReadout.tsx`;
 * ruling R62) is driven by `model/cursorReadoutDriver.ts`'s
 * `makeCursorReadoutDriver`, held in `cursorDriverRef` — a pure, unit-tested
 * settle-and-fetch driver with two independent trigger paths sharing one
 * sequence counter: `handlePointerMove` calls the driver's `notify` on
 * every move (drag or hover alike, still no IPC — the driver debounces
 * internally by `CURSOR_SETTLE_MS`, its own settle distinct from this
 * component's tile-fetch settle), so a plain hover-and-stop refreshes the
 * readout even with no pan/zoom gesture; the tile-fetch settle above also
 * calls the driver's `dispatchNow` with no extra debounce, so a pan/zoom
 * settle refreshes the readout too ("the viewport settle also refreshes
 * it," R62). `handlePointerLeave` calls the driver's `leave`, which clears
 * the panel, cancels a not-yet-fired `notify` debounce timer outright, and
 * bumps the driver's sequence counter so a fetch already dispatched and in
 * flight is dropped on arrival instead of repopulating the panel.
 */
export default function ChartCell({
  cellId,
  tiles,
  width,
  height,
  heightPx,
  viewport,
  sessionSpanUs,
  sessionId,
  channelId,
  sampleRateHz,
  cache,
  fetchTile,
  onViewportSettled,
  raster,
  fetchCursorReadout,
  channelLabel,
  sendTransform,
  sendLayout,
}: ChartCellProps) {
  const [hover, setHover] = useState<HoverReading | null>(null);
  const [liveViewport, setLiveViewport] = useState<Viewport>(viewport);
  const [readoutState, setReadoutState] = useState<ReadoutPanelState>(null);
  const draggingRef = useRef<{ pointerId: number; lastClientX: number } | null>(null);
  // The pointer's last-known CSS-px position within this cell, updated on
  // every pointer move (drag or hover alike) with no IPC — only the settle
  // callback below reads this to decide whether/what to request from
  // `cursorReadout` (P2). `null` once the pointer has left the chart, so the
  // settle callback can tell "no last-known position" apart from "position
  // 0" and skip the request entirely rather than reading a stale value.
  const lastPointerXRef = useRef<number | null>(null);

  // This frame's own on-screen rectangle, so `sendLayout` can tell the
  // sandbox where to position this cell's rendered container (R69 item
  // (a); `host/protocol.ts`'s `layoutMessage` doc comment). `cellId`/
  // `sendLayout` are read through a ref so this effect's dependency array
  // stays data-only per the tightened IPC/postMessage-effect rule
  // (`runs/2026-09-05/lanes/l6/review-STANDING.md`) — a `ResizeObserver`
  // callback and a `window` `resize`/`scroll` listener are the only
  // triggers, not a prop identity change.
  const frameRef = useRef<HTMLDivElement>(null);
  const layoutDepsRef = useRef({ cellId, sendLayout });
  layoutDepsRef.current = { cellId, sendLayout };

  // `sendTransform`'s own fresh-values-through-a-ref indirection (same
  // shape as `layoutDepsRef` above): `handlePointerMove`/`handleWheel`
  // (below) are `useCallback`s whose dependency arrays do not include
  // `viewport` (they never needed it before this task — panning/zooming
  // only ever reads the gesture-local `current` viewport their own
  // `setLiveViewport` updater receives), so this cell's *settled*
  // `viewport` prop is read through this ref rather than added to those
  // callbacks' deps, which would recreate them (and their pointer-capture
  // closures) on every settle.
  const transformDepsRef = useRef({ cellId, sendTransform, viewport });
  transformDepsRef.current = { cellId, sendTransform, viewport };

  // A newly committed `viewport` from the parent (post-settle, or any other
  // cause) always replaces whatever gesture-local state was live — a stale
  // in-gesture viewport must never persist across an externally driven change.
  // The sandbox's own transform resets to identity in lockstep: the parent
  // only commits a new `viewport` once it has re-derived and re-sent this
  // channel's data for that exact window (`onViewportSettled` ->
  // `setBoundChannel`/`setChannelHostVar`), so a leftover non-identity
  // transform from the gesture that triggered this commit would otherwise
  // double-apply on top of the freshly re-rendered picture.
  useEffect(() => {
    setLiveViewport(viewport);
    transformDepsRef.current.sendTransform(transformDepsRef.current.cellId, 0, 1);
  }, [viewport]);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;

    let pending = false;
    const sendNow = () => {
      pending = false;
      const rect = frame.getBoundingClientRect();
      layoutDepsRef.current.sendLayout(layoutDepsRef.current.cellId, { top: rect.top, left: rect.left, width: rect.width });
    };
    const scheduleSend = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(sendNow);
    };

    scheduleSend();
    const resizeObserver = new ResizeObserver(scheduleSend);
    resizeObserver.observe(frame);
    window.addEventListener("resize", scheduleSend);
    window.addEventListener("scroll", scheduleSend, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleSend);
      window.removeEventListener("scroll", scheduleSend, true);
    };
  }, []);

  // The cursor-readout driver's deps object is mutated in place on every
  // render (never replaced) so the driver instance below — created once via
  // `useRef` — always reads fresh `fetchCursorReadout`/`sessionId`/
  // `channelId`/`channelLabel` values through the same object reference,
  // the same "stable instance, fresh values read through a ref" shape as
  // `onSettleRef` below.
  const cursorDriverDepsRef = useRef<CursorReadoutDriverDeps>({
    fetchCursorReadout,
    sessionId,
    channelId,
    channelLabel,
    onState: (state) => setReadoutState(state),
  });
  cursorDriverDepsRef.current.fetchCursorReadout = fetchCursorReadout;
  cursorDriverDepsRef.current.sessionId = sessionId;
  cursorDriverDepsRef.current.channelId = channelId;
  cursorDriverDepsRef.current.channelLabel = channelLabel;

  const cursorDriverRef = useRef(makeCursorReadoutDriver(cursorDriverDepsRef.current, CURSOR_SETTLE_MS));

  useEffect(() => {
    const driver = cursorDriverRef.current;
    return () => driver.cancel();
  }, []);

  // Indirected through a ref so the debouncer instance below (and its
  // pending timer) stays stable across renders instead of being torn down
  // and recreated whenever a parent passes a fresh `onViewportSettled`/prop
  // closure identity.
  const onSettleRef = useRef<(next: Viewport) => void>(() => {});
  onSettleRef.current = (next: Viewport) => {
    // Captured synchronously, inside this settle's own firing (see
    // `makeSettle`'s `latestSeq()` doc comment) — compared again once the
    // fetch below resolves so an older settle's result, resolving after a
    // newer settle has already fired, is dropped rather than committed over
    // the newer settle's own (possibly still-pending) result
    // (review-task8.md: "no stale-settle guard").
    const seqAtDispatch = settleRef.current.latestSeq();
    const tier = chooseTier(next.endUs - next.startUs, next.pixelWidth, sampleRateHz);
    const range = tileRange(next.startUs, next.endUs, tier, sampleRateHz);
    const key: Omit<TileCacheKey, "tileIndex"> = { sessionId, channelId, tier, columnCount: width };

    ensureTiles(cache, key, range, (tileIndex) => fetchTile(tier, tileIndex, width))
      .then(() => {
        if (isStaleSettleResult(seqAtDispatch, settleRef.current.latestSeq())) {
          return;
        }
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

    // The cursor readout (Task 10; ruling R62) also refreshes on this same
    // settle firing — not gated on the tile fetch above succeeding, since a
    // stale/missing tile picture and a fresh numeric readout are unrelated
    // failures. The driver shares one sequence counter across this
    // "viewport settled" trigger and its own independent pointer-stop
    // trigger (`handlePointerMove`'s `notify`), so whichever fires last
    // wins consistently regardless of path — see
    // `model/cursorReadoutDriver.ts`.
    cursorDriverRef.current.dispatchNow(next, lastPointerXRef.current);
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
      lastPointerXRef.current = pixelX;
      // R62: every move — drag or hover alike — notifies the cursor
      // readout's own pointer-stop settle (no IPC here; `notify` only
      // (re)starts an internal debounce timer). Passed `liveViewport`, not
      // the settled `viewport` prop: during an active drag/zoom the picture
      // on screen is rendered from `liveViewport` (`transformFor(viewport,
      // liveViewport)` below), and `pixelX` is measured against that live,
      // panned picture — pairing it with the stale, pre-drag `viewport`
      // would compute `t_us` for a window the picture is no longer showing
      // at that pixel (review-fixes-9-10.md Important). Previously this was
      // masked only by `CURSOR_SETTLE_MS` and `SETTLE_DELAY_MS` happening to
      // both be 150ms, not by design.
      cursorDriverRef.current.notify(liveViewport, pixelX);

      if (dragging !== null && dragging.pointerId === event.pointerId) {
        const pixelDx = event.clientX - dragging.lastClientX;
        dragging.lastClientX = event.clientX;
        setLiveViewport((current) => {
          const next = clampTo(panBy(current, pixelDx), sessionSpanUs);
          settleRef.current.notify(next);
          const { cellId: id, sendTransform: send, viewport: settled } = transformDepsRef.current;
          const frameTransform = transformFor(settled, next);
          send(id, frameTransform.translateXPx, frameTransform.scaleX);
          return next;
        });
        setHover(null);
        return;
      }

      const geometry: HoverGeometry = { originPx: 0, pixelWidth: width };
      const reading = hoverAt(tiles, pixelX, geometry);
      setHover(reading === null ? null : { pixelX, ...reading });
    },
    [tiles, width, sessionSpanUs, liveViewport]
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
    // The pointer has left the chart — the next viewport-settle dispatch
    // must skip the cursor-readout request entirely rather than reading a
    // stale position, and the readout panel itself must clear immediately
    // rather than showing a reading for a cursor that no longer exists
    // (review-task10.md Important). `driver.leave()` also cancels a
    // not-yet-fired `notify` debounce timer outright and bumps the
    // driver's sequence counter so a readout fetch already dispatched and
    // in flight from either trigger path is dropped on arrival, never
    // repopulating the panel after the pointer is gone (R62).
    lastPointerXRef.current = null;
    cursorDriverRef.current.leave();
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setLiveViewport((current) => {
        const next = clampTo(zoomAt(current, pixelX, factor), sessionSpanUs);
        settleRef.current.notify(next);
        const { cellId: id, sendTransform: send, viewport: settled } = transformDepsRef.current;
        const frameTransform = transformFor(settled, next);
        send(id, frameTransform.translateXPx, frameTransform.scaleX);
        return next;
      });
    },
    [sessionSpanUs]
  );

  const transform = transformFor(viewport, liveViewport);
  // R69 item (a): once the sandbox has rendered this cell at least once,
  // its own reported height is authoritative — `height` is only the
  // pre-first-render fallback (see `ChartCellProps.heightPx`'s doc comment).
  const frameHeight = heightPx ?? height;

  return (
    <div
      ref={frameRef}
      className="chart-cell"
      style={{ position: "relative", width, height: frameHeight, overflow: "hidden" }}
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
        {raster === undefined ? (
          <canvas
            className="chart-cell-underlay"
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          />
        ) : (
          <RasterUnderlay
            kind={raster.kind}
            params={raster.params}
            viewport={viewport}
            width={width}
            height={height}
            devicePixelRatio={raster.devicePixelRatio}
            sessionId={sessionId}
            channelId={channelId}
            fetchRaster={raster.fetchRaster}
            fetchRasterMeta={raster.fetchRasterMeta}
          />
        )}
        {/* No mount div here (R69): the sandbox renders this cell's own
            picture in its own DOM, in the single shared iframe positioned
            by `sendLayout` to appear at this frame's own rect; this
            component never receives or injects that output's markup. */}
      </div>
      {hover !== null && (
        <div
          className="chart-cell-tooltip"
          style={{ position: "absolute", left: hover.pixelX, top: 0, pointerEvents: "none" }}
        >
          {`t=${Number(hover.tUs) / 1_000_000}s min=${hover.min} max=${hover.max} mean=${hover.mean}`}
        </div>
      )}
      <CursorReadoutPanel state={readoutState} />
    </div>
  );
}
