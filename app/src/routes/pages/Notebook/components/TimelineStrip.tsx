import { useEffect, useRef, useState } from "react";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../state/selection";
import type { AbsoluteSpan } from "../model/viewportWindows";
import { bracketForLane, dragCandidate, handlePositionsFor, hitTestHandle, stripLanesFor, type HandleSide, type StripLane } from "../model/timelineStrip";

/** Fallback strip width (CSS px) before the container's own `ResizeObserver` reports one. */
const DEFAULT_STRIP_WIDTH_PX = 600;
/** Pointer distance (CSS px) within which a pointerdown is treated as hitting a boundary handle, rather than starting nothing. */
const HANDLE_HIT_TOLERANCE_PX = 6;
const LANE_HEIGHT_PX = 20;

/** Props for {@link TimelineStrip} -- see `model/timelineStrip.ts` for the pure geometry/drag model this component only renders and drives. */
export interface TimelineStripProps {
  /** The selection, in order -- `windows[0]` is the primary window. */
  windows: readonly SelectionWindow[];
  detailsByWindow: ReadonlyMap<string, SessionDetail | null>;
  spanUsByWindow: ReadonlyMap<string, number | null>;
  /** The worksheet's shared X range (`model/sharedViewport.ts`), already re-expressed as an `AbsoluteSpan` in the primary window's own coordinate frame -- `null` before any chart has settled once (§3.4: never a sentinel). */
  viewport: AbsoluteSpan | null;
  /**
   * Commits a completed drag -- called once, on pointer-up (§3.1's settle
   * discipline), never per frame. The caller applies
   * `model/timelineStrip.ts`'s `timelineCommit(windows, laneIndex,
   * candidate)` and dispatches the result via `SET_WINDOWS`; this
   * component holds no `AppState` reference itself.
   */
  onCommit: (laneIndex: number, candidate: AbsoluteSpan) => void;
}

/** Which handle of which lane a drag is currently moving, and its live candidate position -- purely local render state, never written back to `AppState` until pointer-up. */
interface DragState {
  laneIndex: number;
  side: HandleSide;
}

/**
 * The master timeline strip (decision 52, R115, R134 item 1) -- one lane
 * per selected window (`model/timelineStrip.ts`'s `stripLanesFor`), each
 * with its own draggable boundary handles in that window's own colour. A
 * drag moves only this component's own local `dragCandidateUs` state frame
 * by frame; {@link TimelineStripProps.onCommit} fires once, on pointer-up,
 * per §3.1 (a boundary drag re-runs `eval_workbook_v2` per window and
 * re-fetches every bound channel — running that per frame would be a
 * settle-discipline violation, not a nicety).
 *
 * Rendering itself is not unit-tested (CLAUDE.md §4) — every decision this
 * component makes (lane geometry, hit-testing, the drag candidate, the
 * commit) is `model/timelineStrip.ts`'s own tested pure functions; this
 * component only wires pointer events to them and paints the result.
 */
export default function TimelineStrip({ windows, detailsByWindow, spanUsByWindow, viewport, onCommit }: TimelineStripProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState(DEFAULT_STRIP_WIDTH_PX);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragCandidateUs, setDragCandidateUs] = useState<AbsoluteSpan | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) setWidthPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lanes = stripLanesFor(windows, detailsByWindow, spanUsByWindow);
  if (lanes.length === 0) return null;

  const primaryLane = lanes.find((l) => l.windowIndex === 0) ?? null;
  const primaryStartUs = primaryLane?.windowSpan?.startUs ?? 0;

  function pixelXFromEvent(event: React.PointerEvent): number {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect === undefined ? 0 : event.clientX - rect.left;
  }

  function handlePointerDown(lane: StripLane, event: React.PointerEvent) {
    const side = hitTestHandle(lane, widthPx, pixelXFromEvent(event), HANDLE_HIT_TOLERANCE_PX);
    if (side === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ laneIndex: lane.windowIndex, side });
    setDragCandidateUs(lane.windowSpan);
  }

  function handlePointerMove(lane: StripLane, event: React.PointerEvent) {
    if (drag === null || drag.laneIndex !== lane.windowIndex) return;
    const candidate = dragCandidate(lane, widthPx, drag.side, pixelXFromEvent(event));
    if (candidate !== null) setDragCandidateUs(candidate);
  }

  function handlePointerUp() {
    if (drag !== null && dragCandidateUs !== null) {
      onCommit(drag.laneIndex, dragCandidateUs);
    }
    setDrag(null);
    setDragCandidateUs(null);
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1 px-2 py-1">
      {lanes.map((lane) => {
        const liveLane: StripLane = drag !== null && drag.laneIndex === lane.windowIndex && dragCandidateUs !== null ? { ...lane, windowSpan: dragCandidateUs } : lane;
        const handles = handlePositionsFor(liveLane, widthPx);
        const bracket = viewport !== null ? bracketForLane(lane, widthPx, viewport, primaryStartUs) : null;

        return (
          <div
            key={lane.key}
            className="relative rounded-[var(--radius-structural)] bg-bg-inset"
            style={{ height: LANE_HEIGHT_PX, width: "100%" }}
            onPointerDown={(event) => handlePointerDown(lane, event)}
            onPointerMove={(event) => handlePointerMove(lane, event)}
            onPointerUp={handlePointerUp}
          >
            {bracket !== null && (
              <div
                className="absolute top-0 h-full bg-fg/10"
                style={{ left: bracket.startPx, width: Math.max(bracket.endPx - bracket.startPx, 1) }}
              />
            )}
            {handles !== null && (
              <div
                className="absolute top-0 h-full"
                style={{ left: handles.startPx, width: Math.max(handles.endPx - handles.startPx, 1), background: `var(${lane.colour})`, opacity: 0.5 }}
              />
            )}
            {handles !== null && (
              <>
                <div className="absolute top-0 h-full w-1 cursor-ew-resize" style={{ left: handles.startPx - 1, background: `var(${lane.colour})` }} />
                <div className="absolute top-0 h-full w-1 cursor-ew-resize" style={{ left: handles.endPx - 1, background: `var(${lane.colour})` }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
