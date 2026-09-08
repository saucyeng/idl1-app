import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";

import type { CursorReadout } from "../../../../ipc/cursor";
import type { DecodedRaster, Histogram2dParams, RasterKind, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { DecodedTile } from "../../../../ipc/tiles";
import { cursorRequestFor, type ReadoutPanelState } from "../model/cursor";
import { CURSOR_SETTLE_MS, makeCursorReadoutDriver, type CursorReadoutDriverDeps } from "../model/cursorReadoutDriver";
import { cursorCardRows, type CombinedChannelPayload, type CursorCardRow } from "../model/cursorCard";
import { hoverAt, type HoverGeometry } from "../model/hover";
import { isStaleSettleResult, makeSettle } from "../model/settle";
import { chooseTier, tileRange } from "../model/tiers";
import { ensureTiles, type TileCache, type TileCacheKey } from "../model/tileCache";
import { clampTo, panBy, transformFor, zoomAt, type Viewport } from "../model/viewport";
import { cursorTimeInWindow, type AbsoluteSpan } from "../model/viewportWindows";
import ChartContextMenu from "../interaction/ChartContextMenu";
import type { ChartAction } from "../interaction/chartActions";
import type { CursorBus } from "../interaction/cursorBus";
import { cursorFollowPolicy } from "../interaction/cursorFollowPolicy";
import { pixelXForTUs } from "../interaction/cursorFollow";
import { advanceForMode, type PlaybackMode } from "../interaction/playbackMode";
import { classifyWheelEvent, dragActionFor, wheelActionFor } from "../interaction/gestureVerbs";
import type { GestureAction, InputMapPreset } from "../interaction/inputMap";
import { actionForKey } from "../interaction/keymap";
import { findPeakTUs } from "../interaction/peak";
import { zoomToRect } from "../interaction/rectZoom";
import CursorCard from "./CursorCard";
import CursorReadoutPanel from "./CursorReadout";
import RasterUnderlay from "./RasterUnderlay";

/** Keyboard zoom step (decision 27's `ArrowUp`/`ArrowDown`, `interaction/keymap.ts`):
 *  scales the visible span by this factor per key press, anchored at the
 *  chart's own horizontal centre (a keyboard action has no pointer position
 *  to anchor on, unlike the wheel handler below). No spec number is given;
 *  20% is a readable, discoverable step for a discrete key press. */
const KEYBOARD_ZOOM_FACTOR = 1.2;

/** Keyboard pan step (decision 27's `ArrowLeft`/`ArrowRight`), as a
 *  fraction of the chart's own plotted width per key press. No spec number
 *  is given; 10% mirrors a typical "page" step. */
const KEYBOARD_PAN_FRACTION = 0.1;

/** Minimum CSS-px width of a drag-rectangle selection (Shift+drag; see this
 *  component's own doc comment on why Shift, not idl0's right-click+drag,
 *  is the modifier here) before {@link zoomToRect} is applied on release —
 *  below this, the gesture reads as an accidental jitter rather than an
 *  intentional selection and is discarded with no viewport change. */
const MIN_SELECTION_PX = 4;

/** Maximum CSS-px movement between a left-button pointerdown and pointerup
 *  for the release to count as a "click" (decision 27 / idl0's
 *  `Settings/controls.ts` "Place cursor: Left-click") rather than a pan
 *  drag — {@link handlePointerUp} sets the shared cursor at the release
 *  position when under this threshold, and does nothing beyond the normal
 *  pan-drag end otherwise. */
const CLICK_MAX_MOVEMENT_PX = 3;

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
  /**
   * The *true* primary window's own resolved `AbsoluteSpan` (`model/
   * viewportWindows.ts`'s `windowSpanFor`), `null` while it hasn't resolved
   * yet — the one predicate `Notebook/index.tsx`'s `bindWindowsFor` and its
   * playback loop already share (R138: "resolved" has one definition). This
   * cell's own hover-follow offset (`cursorBus`), the value card's rows, and
   * a click's pin all use it as `cursorTimeInWindow`'s `window`/the offset
   * origin — **not** `{startUs: 0, endUs: sessionSpanUs}`: that was only
   * ever correct for a `"session"`-kind primary window (the review that
   * added this prop found it silently mis-scoping every `"lap"`/`"range"`
   * primary window, R138's pattern for the fourth time — see the removed
   * `TODO(idl0)` this replaces). `Notebook/index.tsx` passes a
   * `useMemo`-stabilized object (same `startUs`/`endUs` ⇒ same reference)
   * so this prop is safe in a dependency array without resubscribing every
   * render.
   */
  primaryWindowSpan: AbsoluteSpan | null;
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
  /** `ChannelSummary.unit` (C1 §4.1) for this cell's own channel, for the
   *  cursor value card's rows (Task 7, decision 55). `undefined` renders as
   *  `""` (`model/cursorCard.ts`'s own fallback), same shape as
   *  {@link channelLabel}'s missing-label convention. */
  channelUnit?: string;
  /** The total number of selected windows (`AppState.selection.length`),
   *  for the cursor value card's R132 naming (`model/jsCellNote.ts`'s
   *  `primaryWindowNote`: no marker at `1`, that row's own window's label
   *  otherwise). `undefined` treated as `1` -- byte-identical, no marker. */
  windowCount?: number;
  /**
   * This cell's own mounted channel's combined multi-window payload
   * (ruling R139): `Notebook/index.tsx` retains `channelBindDriver.ts`'s
   * `CombinedChannelPayload` -- the same `{t, v, w, windows}` arrays sent
   * to the sandbox, kept in host memory rather than dropped -- and hands
   * the mounted channel's own entry down here. The cursor value card
   * (Task 7) reads it at pointer rate with no new fetch and no IPC (P2):
   * `model/cursorCard.ts`'s `cursorCardRows` is a filter over already-
   * decoded, already-decimated arrays. `undefined` before the first
   * channel-bind dispatch resolves -- the card renders nothing.
   */
  combinedChannelData?: CombinedChannelPayload;
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
  /**
   * The worksheet's shared cursor time (UI-11, R99), in µs since session
   * start, or `null` when no cursor is set. Every mounted `ChartCell` in
   * the worksheet receives the same value from `Notebook/index.tsx` — this
   * component never holds its own cursor-time state, only the per-cell
   * `cursorReadoutDriver` instance that fetches *this* cell's own reading
   * at that shared time (R99: "what is shared is the cursor time, not the
   * driver"). See {@link playing}'s doc comment for how this value changing
   * is interpreted.
   */
  cursorTUs: bigint | null;
  /**
   * Whether live-speed playback (decision 18) is currently advancing
   * {@link cursorTUs}. When `true`, a change in `cursorTUs` pans this
   * cell's own live viewport by the elapsed time (via
   * `interaction/cursorFollow.ts`'s `advanceViewportByTime`) through the
   * *existing* settle/debounce pipeline (`settleRef`'s `notify`, exactly as
   * a drag/wheel gesture does) — a continuously-advancing cursor therefore
   * never fires a tile re-fetch or a cursor-readout IPC call per animation
   * frame, only once playback stops advancing for `SETTLE_DELAY_MS`/
   * `CURSOR_SETTLE_MS` (R99: "ship playback as pan-visually-then-refetch-
   * once-when-playback-stops"). When `false`, a `cursorTUs` change (a
   * manual `setCursor`/`clearCursor` from any chart's own action menu or
   * click) only redraws this cell's cursor line and refreshes its own
   * readout — it never pans.
   */
  playing: boolean;
  /**
   * Decision 57's playback mode (plan Task 11) -- which of
   * `interaction/playbackMode.ts`'s two arithmetics {@link playing} applies
   * while it is panning this cell's own live viewport: `"cursor-fixed"`
   * (today's `advanceViewportByTime`, the cursor stays put on screen and
   * the chart passes under it) or `"scroll-at-edge"` (the chart holds still
   * until the cursor reaches its right edge, then pages forward). Read only
   * while {@link playing} is `true`; irrelevant otherwise. `Notebook/
   * index.tsx` owns the worksheet-level toggle (Task 12).
   */
  playbackMode: PlaybackMode;
  /**
   * Lifts a user-chosen cursor time up to `Notebook/index.tsx`'s shared
   * cursor state (a left-click, the "Set cursor here"/"Cursor to peak"
   * menu actions) — `tUs` is in µs since session start, this cell's own
   * time axis, matching {@link cursorTUs}'s unit.
   */
  onSetCursor: (tUs: number) => void;
  /** Clears the shared cursor ("Clear cursor" menu action). */
  onClearCursor: () => void;
  /**
   * The worksheet's one shared {@link CursorBus} (Task 1), passed down by
   * `Notebook/index.tsx` as a stable ref -- every mounted `ChartCell`
   * subscribes to the same instance. Drives the hover-follow half of
   * decision 51 (the pointer-following cursor, not yet built before this
   * task): `handlePointerMove`/`handlePointerLeave` `publish` to it at
   * pointer rate through `interaction/cursorFollowPolicy.ts`'s decision,
   * never through `setState` (operating brief §4); this component's own
   * hover-line element subscribes and repositions itself imperatively.
   * `handlePointerUp`'s click path calls `pin`/`unpin` on it directly,
   * mirroring the same verb into {@link onSetCursor}/{@link onClearCursor}'s
   * React state (`cursorFollowPolicy.ts`'s own doc comment on why pin/unpin
   * are settle-grade and still land in state).
   */
  cursorBus: CursorBus;
  /**
   * The worksheet's currently selected gesture input-map preset (ruling
   * R137, `interaction/inputMap.ts`; Task 5), read fresh on every
   * pointerdown/wheel event -- `Notebook/index.tsx` holds the chosen preset
   * as React state and re-renders every mounted `ChartCell` with the new
   * object when the user switches it, so a preset switch takes effect on
   * the very next gesture with no reload and no extra plumbing here.
   * Preset objects are the `INPUT_MAP_PRESETS` module constants (stable
   * identity), so this changing recreates `handlePointerDown`/`handleWheel`
   * (it is in their dependency arrays) without recreating them on every
   * unrelated render.
   */
  inputMapPreset: InputMapPreset;
  /** Toggles this cell's code visibility ("Show/hide code" menu action) --
   *  a thin closure over `Notebook/index.tsx`'s existing `model/codeVisibility.ts`
   *  state, injected so this component never imports that module directly. */
  onToggleCode: () => void;
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
  primaryWindowSpan,
  sessionId,
  channelId,
  sampleRateHz,
  cache,
  fetchTile,
  onViewportSettled,
  raster,
  fetchCursorReadout,
  channelLabel,
  channelUnit,
  windowCount,
  combinedChannelData,
  sendTransform,
  sendLayout,
  cursorTUs,
  playing,
  playbackMode,
  onSetCursor,
  onClearCursor,
  cursorBus,
  inputMapPreset,
  onToggleCode,
}: ChartCellProps) {
  const [hover, setHover] = useState<HoverReading | null>(null);
  /** The cursor value card's rows (Task 7, decision 55, R139) -- kept as
   *  its own state, alongside `hover`, since it depends on `cursorBus`'s
   *  window-relative offset rather than `hover.tUs` (this chart's own
   *  absolute-µs reading), and can legitimately be `[]` (every window's
   *  offset ran past its own end -- decision 55's "renders absence") while
   *  `hover` is not `null`. */
  const [card, setCard] = useState<{ pixelX: number; rows: CursorCardRow[] } | null>(null);
  const [liveViewport, setLiveViewport] = useState<Viewport>(viewport);
  const [readoutState, setReadoutState] = useState<ReadoutPanelState>(null);
  // The pending drag-rectangle selection (decision 56, wired per-preset by
  // R137/Task 5: whichever drag `inputMapPreset` binds to `"zoom-region"`
  // — every shipped preset binds *plain* drag there), in this cell's own
  // CSS px — `null` when no selection drag is in progress. A drag whose
  // preset instead binds it to `"pan-x"`/`"none"` never touches this state
  // (see `DragGestureState`/`handlePointerDown` below). Right-click is
  // this cell's own context-menu trigger (`ChartContextMenu`) and is
  // filtered out of gesture classification entirely (documented judgment
  // call carried over from the pre-R137 implementation).
  const [selectionRectPx, setSelectionRectPx] = useState<{ x0: number; x1: number } | null>(null);
  // One ref for whichever gesture a pointerdown started (Task 5): its
  // `action` is `inputMapPreset`'s own lookup for that drag/modifier
  // combination, decided once at pointerdown and replayed for every move
  // and the eventual release -- never re-read mid-drag, so a preset switch
  // mid-gesture (the user opens Settings while dragging) cannot change
  // what an already-started drag does. `x0` is only meaningful for a
  // `"zoom-region"` drag (the selection rectangle's anchor); other actions
  // ignore it.
  const dragStateRef = useRef<{ pointerId: number; action: GestureAction; startClientX: number; lastClientX: number; x0: number } | null>(null);
  // The shared cursor time (`cursorTUs`) this cell last reacted to, so the
  // playback-pan effect below can compute *this frame's* delta rather than
  // the delta since the cursor was first set — `null` means "no shared
  // cursor applied yet" (mirrors `lastPointerXRef`'s own null-as-distinct
  // convention). Read/written only inside that effect.
  const lastCursorTUsAppliedRef = useRef<number | null>(null);
  // Fresh-value indirection for the playback-pan effect, the same
  // "stable callback, values read through a ref" shape as
  // `transformDepsRef`/`layoutDepsRef` below -- keeps that effect's own
  // dependency array data-only (`[cursorTUs, playing, sessionSpanUs]`).
  const liveViewportRef = useRef(liveViewport);
  liveViewportRef.current = liveViewport;
  // The hover-follow cursor line (decision 51's first half, Task 2) --
  // positioned imperatively from `cursorBus` subscriptions, never via
  // `setState`, since a hover fires at pointer rate. Distinct from the
  // declarative, `cursorTUs`-prop-driven line below it in the JSX, which
  // keeps rendering the *pinned*/playback cursor exactly as before; this
  // element only ever shows while the bus reports `pinned: false`.
  const hoverLineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return cursorBus.subscribe((state) => {
      const el = hoverLineRef.current;
      if (el === null) return;
      if (state.pinned || state.tUs === null) {
        el.hidden = true;
        return;
      }
      // Task 6 / R131 Q2: the bus reports an *offset* from the primary
      // window's own start, not an absolute instant -- `cursorTimeInWindow`
      // resolves it against `primaryWindowSpan` before `pixelXForTUs` (which
      // still works in this chart's own absolute session-µs axis, matching
      // `liveViewport`). `null` here means either the primary window's own
      // span hasn't resolved yet, or the offset has run past its recorded
      // end (decision 55's "renders absence"), same as an off-viewport pixel
      // below.
      const tUs = primaryWindowSpan === null ? null : cursorTimeInWindow(state.tUs, primaryWindowSpan);
      const px = tUs === null ? null : pixelXForTUs(liveViewportRef.current, tUs);
      if (px === null) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.style.transform = `translateX(${px}px)`;
    });
  }, [cursorBus, sessionSpanUs, primaryWindowSpan]);
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

  // Commits a new live viewport through the exact same pipeline every
  // gesture already uses (local state, the tile-fetch settle debounce, the
  // live sandbox transform) — factored out so the wheel/drag gestures
  // below, the new keyboard/menu actions, and the playback-pan effect all
  // go through one path rather than three copies of it.
  const applyViewport = useCallback(
    (compute: (current: Viewport) => Viewport) => {
      setLiveViewport((current) => {
        const next = clampTo(compute(current), sessionSpanUs);
        settleRef.current.notify(next);
        const { cellId: id, sendTransform: send, viewport: settled } = transformDepsRef.current;
        const frameTransform = transformFor(settled, next);
        send(id, frameTransform.translateXPx, frameTransform.scaleX);
        return next;
      });
    },
    [sessionSpanUs]
  );

  // The shared worksheet cursor (UI-11, R99): reacts to `cursorTUs`
  // changing, never to a gesture. `[cursorTUs, playing, playbackMode,
  // sessionSpanUs]` is a data-only dependency array (the tightened effects
  // rule) — no function prop, no cancelling cleanup. `playbackMode` decides
  // *how* `playing` pans (Task 11's `advanceForMode`, decision 57); it is
  // otherwise inert here (no branch on it besides the call itself), so it
  // never needs its own conditional the way `playing` does.
  useEffect(() => {
    if (cursorTUs === null) {
      if (lastCursorTUsAppliedRef.current !== null) {
        cursorDriverRef.current.leave();
      }
      lastCursorTUsAppliedRef.current = null;
      return;
    }

    const tUsNum = Number(cursorTUs);
    const prevApplied = lastCursorTUsAppliedRef.current;
    lastCursorTUsAppliedRef.current = tUsNum;

    let atViewport = liveViewportRef.current;

    // Only pan when playback is actually advancing the cursor *and* this
    // isn't the first time this cell has seen a cursor value (a `null` ->
    // non-null transition has no previous position to diff against, and
    // must never be read as an infinite delta -- see `playing`'s doc
    // comment on `ChartCellProps`).
    if (playing && prevApplied !== null) {
      const deltaUs = tUsNum - prevApplied;
      atViewport = clampTo(advanceForMode(atViewport, tUsNum, deltaUs, playbackMode), sessionSpanUs);
      applyViewport(() => atViewport);
    }

    const pixelX = pixelXForTUs(atViewport, tUsNum);
    if (pixelX === null) {
      cursorDriverRef.current.leave();
    } else {
      // `notify`, not `dispatchNow`: during continuous playback this is
      // called every animation frame, so its internal `CURSOR_SETTLE_MS`
      // debounce keeps being reset and never actually fires a
      // `cursorReadout` IPC call until the cursor stops advancing (pause or
      // end of span) -- R99's "pan-visually-then-refetch-once" for the
      // readout, for free from the existing debounce, no new throttle.
      cursorDriverRef.current.notify(atViewport, pixelX);
    }
  }, [cursorTUs, playing, playbackMode, sessionSpanUs, applyViewport]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button === 2) {
        return; // right-click: this cell's own `ChartContextMenu` handles it natively.
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const action = dragActionFor(inputMapPreset, event.shiftKey);
      dragStateRef.current = { pointerId: event.pointerId, action, startClientX: event.clientX, lastClientX: event.clientX, x0: pixelX };
      if (action === "zoom-region") {
        setSelectionRectPx({ x0: pixelX, x1: pixelX });
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [inputMapPreset]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;

      const dragState = dragStateRef.current;
      if (dragState !== null && dragState.pointerId === event.pointerId) {
        if (dragState.action === "zoom-region") {
          setSelectionRectPx((prev) => (prev === null ? prev : { x0: prev.x0, x1: pixelX }));
          return;
        }
        if (dragState.action === "pan-x") {
          const pixelDx = event.clientX - dragState.lastClientX;
          dragState.lastClientX = event.clientX;
          applyViewport((current) => panBy(current, pixelDx));
          setHover(null);
          return;
        }
        // `"none"`/`"zoom-x"`: this preset doesn't bind this drag to a
        // viewport change (`"zoom-x"` is never a shipped drag binding, but
        // the type doesn't forbid it — treated the same as `"none"` here,
        // documented rather than silently mis-zooming). Movement is still
        // tracked (`lastClientX` stays stale, which is fine: only
        // `startClientX` matters for the click check below) and falls
        // through to the hover-follow path, since nothing is visually
        // "dragging".
      }

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

      // Decision 51's hover-follow half (Task 2): while nothing is pinned,
      // every hover move publishes to `cursorBus` for every chart's
      // hover-line subscriber (`hoverLineRef`'s effect above) to pick up --
      // never `setState` at pointer rate (operating brief §4).
      // `cursorFollowPolicy` itself still works in this chart's own
      // absolute session-µs axis (`cursorTUs` prop, `liveViewport`); Task 6
      // converts its result to an offset from the primary window's own
      // start before it reaches the bus (`cursorBus.ts`'s own doc comment).
      // `primaryWindowSpan === null` (its own span hasn't resolved yet) --
      // there is no offset origin to convert against, so nothing publishes.
      const verb = cursorFollowPolicy("hover", cursorTUs !== null, cursorTUs !== null ? Number(cursorTUs) : null, pixelX, liveViewport);
      const offsetUs = verb.kind === "publish" && verb.tUs !== null && primaryWindowSpan !== null ? verb.tUs - primaryWindowSpan.startUs : null;
      if (verb.kind === "publish" && primaryWindowSpan !== null) cursorBus.publish(verb.tUs === null ? null : verb.tUs - primaryWindowSpan.startUs);

      const geometry: HoverGeometry = { originPx: 0, pixelWidth: width };
      const reading = hoverAt(tiles, pixelX, geometry);
      setHover(reading === null ? null : { pixelX, ...reading });

      // Cursor value card (Task 7, decision 55, R139) -- reads
      // `combinedChannelData` (retained by `Notebook/index.tsx` from the
      // same combined arrays `channelBindDriver.ts` already built for the
      // sandbox), filtered by `w` at the same window-relative `offsetUs`
      // the hover-follow line just published. No second tile read, no IPC.
      // `[]` while unpinned and off this chart's own plotted area
      // (`offsetUs === null`), or before `combinedChannelData` has
      // resolved -- the card renders nothing either way.
      const rows =
        offsetUs === null || combinedChannelData === undefined
          ? []
          : cursorCardRows(offsetUs, combinedChannelData, channelLabel ?? channelId, channelUnit ?? "", windowCount ?? 1);
      setCard(rows.length === 0 ? null : { pixelX, rows });
    },
    [tiles, width, liveViewport, applyViewport, cursorTUs, cursorBus, channelId, channelLabel, channelUnit, windowCount, combinedChannelData, primaryWindowSpan]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState === null || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;

      // decision 27 / idl0's "Place cursor: Left-click": a release with
      // negligible movement since pointerdown reads as a click, not the end
      // of whatever drag action was in effect (`"zoom-region"`, `"pan-x"`
      // or `"none"` alike — a click is a click regardless of the preset).
      // `cursorFollowPolicy`'s click rule (Task 2) decides pin vs. unpin —
      // a click at the instant already pinned releases it instead of
      // re-pinning at the same place.
      if (Math.abs(event.clientX - dragState.startClientX) <= CLICK_MAX_MOVEMENT_PX) {
        if (dragState.action === "zoom-region") setSelectionRectPx(null);
        const bounds = event.currentTarget.getBoundingClientRect();
        const pixelX = event.clientX - bounds.left;
        const verb = cursorFollowPolicy("click", cursorTUs !== null, cursorTUs !== null ? Number(cursorTUs) : null, pixelX, liveViewport);
        if (verb.kind === "pin") {
          // `onSetCursor` keeps its existing absolute-µs contract
          // (`Notebook/index.tsx`'s `manualCursorTUs`, unchanged by this
          // task); only `cursorBus` -- Task 6's own offset frame -- gets
          // the converted value, and only once there is a resolved primary
          // window to convert against (`primaryWindowSpan !== null`) --
          // `onSetCursor` still fires either way, so a click still pins the
          // worksheet's absolute cursor even the instant before the primary
          // window's own span has resolved; only the bus's window-relative
          // line/card lag behind it by that same instant.
          onSetCursor(verb.tUs);
          if (primaryWindowSpan !== null) cursorBus.pin(verb.tUs - primaryWindowSpan.startUs);
        } else if (verb.kind === "unpin") {
          onClearCursor();
          cursorBus.unpin();
        }
        return;
      }

      if (dragState.action === "zoom-region") {
        setSelectionRectPx((rect) => {
          if (rect !== null && Math.abs(rect.x1 - rect.x0) >= MIN_SELECTION_PX) {
            const x0 = Math.min(rect.x0, rect.x1);
            const x1 = Math.max(rect.x0, rect.x1);
            applyViewport((current) => zoomToRect(current, x0, x1));
          }
          return null;
        });
      }
      // `"pan-x"` already applied its viewport change per-frame in
      // `handlePointerMove`; `"none"` never changed the viewport at all —
      // neither needs anything further on release.
    },
    [liveViewport, cursorTUs, onSetCursor, onClearCursor, cursorBus, applyViewport, primaryWindowSpan]
  );

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState !== null && dragState.pointerId === event.pointerId) {
        dragStateRef.current = null;
        if (dragState.action === "zoom-region") setSelectionRectPx(null);
      }
      setHover(null);
      setCard(null);
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
      // Hides this chart's hover-follow line the same way a hover move off
      // the plotted area would (`cursorFollowPolicy`'s `pixelX: null` rule) —
      // a no-op while pinned, matching "hover never moves a pinned cursor".
      const verb = cursorFollowPolicy("hover", cursorTUs !== null, cursorTUs !== null ? Number(cursorTUs) : null, null, liveViewport);
      // `verb.tUs` is already `null` here (a `pixelX: null` hover always
      // resolves to `{kind: "publish", tUs: null}`) -- the same
      // null-preserving conversion as `handlePointerMove`'s, for symmetry
      // (and the reason `primaryWindowSpan` is never actually dereferenced
      // in this particular call, since `verb.tUs` is always `null` here).
      if (verb.kind === "publish") cursorBus.publish(verb.tUs === null || primaryWindowSpan === null ? null : verb.tUs - primaryWindowSpan.startUs);
    },
    [cursorTUs, liveViewport, cursorBus, primaryWindowSpan]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const eventKind = classifyWheelEvent(event.deltaX, event.deltaY, event.ctrlKey);
      const action = wheelActionFor(inputMapPreset, eventKind);
      if (action === "zoom-x") {
        // `deltaY` is the magnitude for both the plain wheel and a
        // ctrlKey-synthesized pinch — a pinch's "deltaY" is the browser's
        // own zoom-intensity signal, not a real vertical scroll amount, but
        // it is delivered in the same field (`gestureVerbs.ts`'s own doc
        // comment on why there is no separate pinch DOM event).
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        applyViewport((current) => zoomAt(current, pixelX, factor));
      } else if (action === "pan-x") {
        // A trackpad's two-finger horizontal scroll and a physical
        // horizontal-wheel notch both report `deltaX` directly in CSS px
        // for the common `deltaMode: 0` case — no separate sensitivity
        // constant, mirroring `handlePointerMove`'s 1:1 drag-to-pan.
        // Negated: scrolling/panning right (positive `deltaX`) moves the
        // visible window to *later* time, the opposite sign convention
        // from `panBy`'s drag-to-pan (`viewport.ts`'s own doc comment).
        applyViewport((current) => panBy(current, -event.deltaX));
      }
      // `"none"`/`"zoom-region"`: this preset doesn't bind this wheel-family
      // event to a viewport change (`"zoom-region"` is never a shipped
      // wheel binding; treated the same as `"none"`, not applied).
    },
    [applyViewport, inputMapPreset]
  );

  // Keyboard zoom/pan (decision 27; `interaction/keymap.ts`) — mounted on
  // this focused chart `<div>` (`tabIndex=0` below), never on `window`, so
  // it never fights a focused CodeMirror editor or another input
  // (`ChartCell.tsx`'s own Step 6 requirement). A plain function, not a
  // memoized `useCallback` -- it and `dispatchAction` below always close
  // over the *current* render's `liveViewport`/`tiles`/`selectionRectPx`/
  // etc., which a memoized version would need a large, easy-to-miss
  // dependency array to keep fresh for (keyboard events are not a
  // per-frame hot path, so recreating this each render costs nothing).
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const action = actionForKey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
    if (action === null) {
      return;
    }
    event.preventDefault();
    dispatchAction(action);
  }

  /** Applies one `ChartAction` (from the keyboard or `ChartContextMenu`) --
   *  the single dispatch point both `handleKeyDown` and the context menu's
   *  `onAction` use, so a key and its matching menu item can never diverge
   *  in what they actually do. */
  function dispatchAction(action: ChartAction): void {
    switch (action) {
      case "zoomIn":
        applyViewport((current) => zoomAt(current, current.pixelWidth / 2, KEYBOARD_ZOOM_FACTOR));
        return;
      case "zoomOut":
        applyViewport((current) => zoomAt(current, current.pixelWidth / 2, 1 / KEYBOARD_ZOOM_FACTOR));
        return;
      case "panLeft":
        applyViewport((current) => panBy(current, current.pixelWidth * KEYBOARD_PAN_FRACTION));
        return;
      case "panRight":
        applyViewport((current) => panBy(current, -current.pixelWidth * KEYBOARD_PAN_FRACTION));
        return;
      case "resetZoom":
        applyViewport((current) => ({ startUs: 0, endUs: sessionSpanUs, pixelWidth: current.pixelWidth }));
        return;
      case "zoomToSelection":
        if (selectionRectPx !== null && Math.abs(selectionRectPx.x1 - selectionRectPx.x0) >= MIN_SELECTION_PX) {
          const x0 = Math.min(selectionRectPx.x0, selectionRectPx.x1);
          const x1 = Math.max(selectionRectPx.x0, selectionRectPx.x1);
          applyViewport((current) => zoomToRect(current, x0, x1));
          setSelectionRectPx(null);
        }
        return;
      case "setCursor": {
        const pixelX = lastPointerXRef.current ?? width / 2;
        const request = cursorRequestFor(liveViewport, pixelX, []);
        if (request !== null) onSetCursor(request.tUs);
        return;
      }
      case "clearCursor":
        onClearCursor();
        return;
      case "cursorToPeak": {
        const peakTUs = findPeakTUs(tiles);
        if (peakTUs !== null) onSetCursor(Number(peakTUs));
        return;
      }
      case "toggleCode":
        onToggleCode();
        return;
      case "copyValue":
        if (readoutState !== null && readoutState.kind === "rows" && typeof navigator !== "undefined" && navigator.clipboard) {
          const text = readoutState.rows.map((row) => `${row.label}: ${row.value === null ? "no data" : row.value}`).join("\n");
          void navigator.clipboard.writeText(text);
        }
        return;
    }
  }

  const transform = transformFor(viewport, liveViewport);
  // R69 item (a): once the sandbox has rendered this cell at least once,
  // its own reported height is authoritative — `height` is only the
  // pre-first-render fallback (see `ChartCellProps.heightPx`'s doc comment).
  const frameHeight = heightPx ?? height;
  const cursorLinePx = cursorTUs !== null ? pixelXForTUs(liveViewport, Number(cursorTUs)) : null;
  const canReset = liveViewport.startUs !== 0 || liveViewport.endUs !== sessionSpanUs;

  return (
    <ChartContextMenu
      ctx={{ hasCursor: cursorTUs !== null, hasSelection: selectionRectPx !== null, canReset }}
      onAction={dispatchAction}
    >
      <div
        ref={frameRef}
        className="chart-cell"
        tabIndex={0}
        style={{ position: "relative", width, height: frameHeight, overflow: "hidden", outline: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
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
        {card !== null && <CursorCard pixelX={card.pixelX} rows={card.rows} />}
        {selectionRectPx !== null && (
          <div
            className="chart-cell-selection"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: Math.min(selectionRectPx.x0, selectionRectPx.x1),
              width: Math.abs(selectionRectPx.x1 - selectionRectPx.x0),
              background: "var(--control-active)",
              opacity: 0.4,
              pointerEvents: "none",
            }}
          />
        )}
        {cursorLinePx !== null && (
          <div
            className="chart-cell-cursor-line"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: cursorLinePx,
              width: 1,
              background: "var(--fg-dim)",
              pointerEvents: "none",
            }}
          />
        )}
        {
          // Decision 51's hover-follow line (Task 2): positioned imperatively
          // by `hoverLineRef`'s `cursorBus.subscribe` effect above, never by
          // a render-time `left` (that would need `setState` at pointer
          // rate). Starts `hidden` — the subscriber only un-hides it once a
          // hover actually publishes an on-viewport instant.
        }
        <div
          ref={hoverLineRef}
          className="chart-cell-cursor-line chart-cell-cursor-line--hover"
          hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 1,
            background: "var(--fg-dim)",
            opacity: 0.5,
            pointerEvents: "none",
          }}
        />
        <CursorReadoutPanel state={readoutState} />
      </div>
    </ChartContextMenu>
  );
}
