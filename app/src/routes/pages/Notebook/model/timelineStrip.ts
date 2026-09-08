/**
 * Pure master-timeline-strip model (direction-2 decision 52, R115, R134
 * item 1; plan `runs/2026-09-08/w32-time-plan.md` Task 8/9). No React, no
 * DOM, no `@/components/*` import.
 *
 * R134 item 1 rules the strip's shape: **one lane per selected window,
 * stacked, each with its own handles**, in that window's colour -- never
 * one merged lane, since windows can come from different sessions where a
 * union of two unrelated clocks means nothing. Decision 52's "the strip
 * always shows the whole lap/session" is read per lane: each lane's
 * background/edit surface is *that window's own session's full recorded
 * duration* (`sessionSpanUsByWindow`'s existing per-window value, task 3 --
 * unaffected by which lap/range within it happens to be selected), with the
 * window's own current resolved span (session/lap/range, task 3/6's
 * `windowSpanFor`) drawn as the highlighted, handle-bearing region inside
 * it. This lets a handle always be dragged back out to the full recording,
 * and it is why task 3's per-window session spans were a prerequisite for
 * this module rather than only for the cursor.
 *
 * R115/R134 item 3: a dragged boundary always mints a `range` span, the
 * same object a lap click mints, regardless of what kind of span it
 * replaces -- including a `"lap"` span, which the drag *converts* to a
 * `range`. `state/selection.ts`'s `describeWindow` already switches its
 * output on `span.kind`, so the visible label changes for free the instant
 * the span's `kind` changes; no separate "trimmed" flag is introduced here.
 */
import type { AbsoluteSpan } from "./viewportWindows";
import { mapViewportToWindow, windowSpanFor } from "./viewportWindows";
import { windowKey, type SelectionWindow } from "../../../../state/selection";
import type { SessionDetail } from "../../../../ipc/catalog";

/**
 * The minimum width, in **µs**, a dragged handle may produce -- R120: a
 * `range` with `t0_us >= t1_us` is a typed `InvalidArgument` for that
 * window, and a strip zoomed out over a long session can represent a
 * sub-microsecond drag distance in a single pixel. Enforced in time, not
 * only in pixels, so a legal-looking drag can never mint an illegal range.
 * 1 ms is a UI-feel choice (no session document specifies one) -- small
 * enough to feel unconstrained while dragging, comfortably above the
 * `t0Us < t1Us` floor R120 actually requires.
 */
export const MIN_RANGE_US = 1_000;

/** One lane of the strip -- one selected window, per R134 item 1. */
export interface StripLane {
  /** `state/selection.ts`'s `windowKey(window)` -- stable React key, identity excluding colour. */
  key: string;
  /** `window`'s position in the selection list (`windows[windowIndex]`) -- what {@link timelineCommit} writes back to. */
  windowIndex: number;
  /** This window's chart token colour (`--chart-1`…`--chart-8`), never a hex literal (R117 item 6). */
  colour: string;
  /** This window's own session's full recorded duration, in µs -- the lane's background/edit surface (decision 52). Always positive; a lane is never built for an unresolved one, see {@link stripLanesFor}. */
  sessionSpanUs: number;
  /** This window's own currently-resolved span (session/lap/range), or `null` while it is still resolving (task 3: never a `0`/`Infinity` stand-in) -- the highlighted, handle-bearing region. `null` draws the lane's background with no handles and no highlight, never a guessed placeholder. */
  windowSpan: AbsoluteSpan | null;
}

/**
 * Builds one {@link StripLane} per entry of `windows`, in list order,
 * skipping any window whose own session span hasn't resolved yet --
 * exactly `resolveWindowSpan`'s own "excluded, not treated as whole
 * session" rule (this module's own no-sentinel requirement), applied to
 * the *lane* rather than the cursor/viewport. `detailsByWindow`/
 * `spanUsByWindow` are `Notebook/index.tsx`'s own existing per-window maps
 * (`sessionDetailsByWindow`/`sessionSpanUsByWindow`) -- no new state.
 *
 * `windowSpanFor` (not a second, hand-rolled resolution) supplies each
 * lane's `windowSpan` -- ruling R138's own lesson, "resolved" gets one
 * definition shared by every consumer, applied here rather than
 * re-derived a third time.
 */
export function stripLanesFor(
  windows: readonly SelectionWindow[],
  detailsByWindow: ReadonlyMap<string, SessionDetail | null>,
  spanUsByWindow: ReadonlyMap<string, number | null>
): StripLane[] {
  const lanes: StripLane[] = [];
  windows.forEach((w, windowIndex) => {
    const key = windowKey(w);
    const sessionSpanUs = spanUsByWindow.get(key) ?? null;
    if (sessionSpanUs === null || sessionSpanUs <= 0) return;
    lanes.push({
      key,
      windowIndex,
      colour: w.colour,
      sessionSpanUs,
      windowSpan: windowSpanFor(w, detailsByWindow, spanUsByWindow),
    });
  });
  return lanes;
}

/** Converts a lane-relative time (µs since that lane's own session start) to strip px, clamped to `[0, stripWidthPx]`. */
export function pxForTimeUs(tUs: number, sessionSpanUs: number, stripWidthPx: number): number {
  if (sessionSpanUs <= 0 || stripWidthPx <= 0) return 0;
  const clampedUs = Math.min(Math.max(tUs, 0), sessionSpanUs);
  return (clampedUs / sessionSpanUs) * stripWidthPx;
}

/** Converts a strip px position back to lane-relative µs, clamped to `[0, sessionSpanUs]` -- the inverse of {@link pxForTimeUs}. */
export function timeUsForPx(pixelX: number, sessionSpanUs: number, stripWidthPx: number): number {
  if (stripWidthPx <= 0) return 0;
  const clampedPx = Math.min(Math.max(pixelX, 0), stripWidthPx);
  return (clampedPx / stripWidthPx) * sessionSpanUs;
}

/** A lane's two draggable boundary handles, in strip px. */
export interface HandlePositions {
  startPx: number;
  endPx: number;
}

/** `lane`'s current handle positions in strip px, or `null` when `lane.windowSpan` hasn't resolved (no highlighted region to put handles on). */
export function handlePositionsFor(lane: StripLane, stripWidthPx: number): HandlePositions | null {
  if (lane.windowSpan === null) return null;
  return {
    startPx: pxForTimeUs(lane.windowSpan.startUs, lane.sessionSpanUs, stripWidthPx),
    endPx: pxForTimeUs(lane.windowSpan.endUs, lane.sessionSpanUs, stripWidthPx),
  };
}

export type HandleSide = "start" | "end";

/**
 * Which handle (if any) of `lane` sits within `tolerancePx` of `pixelX` --
 * for a pointerdown to decide whether it starts a boundary drag. `null`
 * when `lane.windowSpan` is unresolved (no handles to hit) or `pixelX`
 * hits neither handle. When both handles are within tolerance (a
 * near-zero-width window at strip resolution) `"start"` wins -- an
 * arbitrary but stable and documented tie-break, matching this module's
 * "never guess silently" rule by naming the choice rather than leaving it
 * to iteration order.
 */
export function hitTestHandle(lane: StripLane, stripWidthPx: number, pixelX: number, tolerancePx: number): HandleSide | null {
  const positions = handlePositionsFor(lane, stripWidthPx);
  if (positions === null) return null;
  if (Math.abs(pixelX - positions.startPx) <= tolerancePx) return "start";
  if (Math.abs(pixelX - positions.endPx) <= tolerancePx) return "end";
  return null;
}

/**
 * The candidate `range` span a drag of `side` to `pixelX` would produce for
 * `lane` right now -- R119/R120: clamped to the lane's own session
 * (`[0, sessionSpanUs]`) and never narrower than {@link MIN_RANGE_US}.
 * Moving the dragged handle past the *other* handle's own position (minus
 * the minimum width) clamps it there rather than crossing over -- a drag
 * can shrink a window down to `MIN_RANGE_US` but never invert it.
 *
 * `null` when `lane.windowSpan` hasn't resolved (nothing to drag) or the
 * lane's own `sessionSpanUs` is too short to fit `MIN_RANGE_US` at all --
 * the caller keeps whatever the last valid candidate was rather than
 * committing a degenerate one.
 *
 * This is a **candidate only** -- §3.1's settle discipline (the strip must
 * commit on pointer-up only, since a boundary drag re-runs
 * `eval_workbook_v2` per window and re-fetches every bound channel) means
 * the caller applies this to its own local drag state on every pointer
 * move and only calls {@link timelineCommit} once, on pointer-up.
 */
export function dragCandidate(lane: StripLane, stripWidthPx: number, side: HandleSide, pixelX: number): AbsoluteSpan | null {
  if (lane.windowSpan === null) return null;
  if (lane.sessionSpanUs < MIN_RANGE_US) return null;

  const draggedUs = timeUsForPx(pixelX, lane.sessionSpanUs, stripWidthPx);
  let startUs = lane.windowSpan.startUs;
  let endUs = lane.windowSpan.endUs;

  if (side === "start") {
    startUs = Math.min(draggedUs, endUs - MIN_RANGE_US);
  } else {
    endUs = Math.max(draggedUs, startUs + MIN_RANGE_US);
  }

  startUs = Math.min(Math.max(startUs, 0), lane.sessionSpanUs - MIN_RANGE_US);
  endUs = Math.min(Math.max(endUs, MIN_RANGE_US), lane.sessionSpanUs);
  if (!(startUs < endUs)) return null;

  return { startUs, endUs };
}

/**
 * Commits `laneIndex`'s dragged boundary into `windows` -- called once, on
 * pointer-up, per §3.1's settle discipline. Replaces that entry's `span`
 * with `candidate` as a `"range"` (R115: the same object a lap click mints;
 * R134 item 3: this is the conversion, applied uniformly whether the
 * replaced span was `"session"`, `"lap"` or already `"range"`).
 * `sessionId`/`colour` are carried over unchanged -- only `span` moves.
 * Every other entry in `windows` is returned unchanged (same array
 * reference where possible is not attempted; `AppState`'s `SET_WINDOWS`
 * replaces the whole list regardless).
 */
export function timelineCommit(windows: readonly SelectionWindow[], laneIndex: number, candidate: AbsoluteSpan): SelectionWindow[] {
  return windows.map((w, i) => (i === laneIndex ? { ...w, span: { kind: "range" as const, t0Us: candidate.startUs, t1Us: candidate.endUs } } : w));
}

/** The shared viewport's own visible-range bracket within `lane`, in strip px -- where on this lane's background the currently-visible chart range sits. */
export interface BracketPx {
  startPx: number;
  endPx: number;
}

/**
 * `lane`'s viewport bracket, re-basing the worksheet's shared viewport
 * (`viewport`, an `AbsoluteSpan` in the *primary* window's own coordinate
 * frame -- `model/sharedViewport.ts`'s `SharedViewport`) onto `lane`'s own
 * window via {@link mapViewportToWindow} -- the exact same re-basing
 * `channelBindDriver.ts` applies per fetch, so the bracket the strip draws
 * and the data the charts actually fetch can never disagree (no second,
 * independently-spelled offset calculation).
 *
 * `primaryStartUs` is the primary (first) selected window's own resolved
 * `windowSpan.startUs` -- the frame every other window's mapped span is
 * re-based from (R131 Q2), matching `mapViewportToWindow`'s own parameter.
 *
 * `null` when `lane.windowSpan` hasn't resolved, or the mapped viewport has
 * no overlap with `lane`'s own window at all (`mapViewportToWindow`'s own
 * "absent, not zero-width" rule) -- the caller draws no bracket on this
 * lane, never one collapsed to a point.
 */
export function bracketForLane(lane: StripLane, stripWidthPx: number, viewport: AbsoluteSpan, primaryStartUs: number): BracketPx | null {
  if (lane.windowSpan === null) return null;
  const mapped = mapViewportToWindow(viewport, primaryStartUs, lane.windowSpan);
  if (mapped === null) return null;
  return {
    startPx: pxForTimeUs(mapped.startUs, lane.sessionSpanUs, stripWidthPx),
    endPx: pxForTimeUs(mapped.endUs, lane.sessionSpanUs, stripWidthPx),
  };
}
