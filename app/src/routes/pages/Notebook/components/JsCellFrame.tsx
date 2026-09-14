import { useEffect, useRef } from "react";

import { DEFAULT_JS_CELL_HEIGHT_PX, resolveJsCellFrameHeightPx } from "../model/jsCellFrameHeight";

/** `NoteBlock`'s own recipe (`components/brand/NoteBlock.tsx`), copied as a
 *  literal class string rather than importing that component: `NoteBlock`
 *  pulls in the shadcn `cn`/`@/lib/utils` alias chain, which the bare
 *  `vitest.config.ts` used by this module's own `jsCellFrameHeight.test.ts`
 *  (a `*.test.ts` file, no `@` alias configured there — `vite.config.ts`'s
 *  alias is dev/build-only) cannot resolve. */
const NOTE_BLOCK_CLASSES = "border-l pl-3 py-1 font-mono text-sm";

/** The default frame height lives in the pure model module (see its doc
 *  comment for why); re-exported here so the notebook keeps importing it
 *  beside the component. */
export { DEFAULT_JS_CELL_HEIGHT_PX };

/** Props for {@link JsCellFrame}. */
export interface JsCellFrameProps {
  /** This cell's C2 fence-string id, for `sendLayout` (`host/protocol.ts`'s `layoutMessage`). */
  cellId: string;
  /** This cell's last `cellRendered.heightPx`, or `null` before the sandbox has rendered it once. */
  heightPx: number | null;
  /** This cell's last `cellError.message`, if it threw. */
  error?: string;
  /** A visible note distinguishing "form-generated but names a channel this session doesn't have" from plain custom code (this task's dispatch). */
  note?: string;
  /**
   * Opens the cell decision 58's "Fix" button should point at
   * (`model/fixTarget.ts`'s `fixTargetCellId` — the failing definition's own
   * cell when known, this cell otherwise). `undefined` hides the button
   * entirely: a frame with neither `note` nor `error` never shows one, and
   * the same is true for a frame from before this task's callers.
   */
  onFix?: () => void;
  /** Sends this cell's current on-screen rectangle to the sandbox (`host/SandboxHost.ts`'s `sendLayout`), same contract as `ChartCellProps.sendLayout`. */
  sendLayout: (cellId: string, rect: { top: number; left: number; width: number }) => void;
}

/**
 * The host-side frame for a `js` cell that is **not** bound through
 * `ChartCell` (R66 item 1's plain-mount path: custom code, or
 * form-generated code naming a channel this session doesn't have). Same
 * pointer-events-none-underneath-the-iframe shape as `ChartCell` (R69 item
 * (c)) but with no pan/zoom/hover gesture handling -- a plain-mount cell
 * has no bound channel to re-fetch tiles for. Reserves `heightPx` (or the
 * pre-render fallback) and keeps the sandbox's own rendered container
 * positioned under this frame via `sendLayout`, exactly like `ChartCell`'s
 * own layout effect.
 */
/**
 * Decision 58's affordance: shown beside a note or error `NoteBlock`, opens
 * `onFix`'s target cell (`model/fixTarget.ts`) — never this frame's own
 * `onSelect`-equivalent, since `CellFrame`'s wrapping `onClick` would
 * otherwise re-select *this* cell right after `onFix` opens the actual
 * offending one; `stopPropagation` keeps the two from racing.
 */
function FixButton({ onFix }: { onFix: () => void }) {
  return (
    <button
      type="button"
      className="ml-2 underline text-fg"
      onClick={(e) => {
        e.stopPropagation();
        onFix();
      }}
    >
      Fix
    </button>
  );
}

export default function JsCellFrame({ cellId, heightPx, error, note, onFix, sendLayout }: JsCellFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const depsRef = useRef({ cellId, sendLayout });
  depsRef.current = { cellId, sendLayout };

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;

    let pending = false;
    const sendNow = () => {
      pending = false;
      const rect = frame.getBoundingClientRect();
      depsRef.current.sendLayout(depsRef.current.cellId, { top: rect.top, left: rect.left, width: rect.width });
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

  const resolvedHeightPx = resolveJsCellFrameHeightPx(heightPx, note !== undefined || error !== undefined);

  return (
    <div
      ref={frameRef}
      className="js-cell-frame"
      style={{ position: "relative", width: "100%", height: resolvedHeightPx }}
    >
      {note !== undefined && (
        <div className={`${NOTE_BLOCK_CLASSES} border-rule text-fg-dim`}>
          {note}
          {onFix !== undefined && <FixButton onFix={onFix} />}
        </div>
      )}
      {error !== undefined && (
        <div className={`${NOTE_BLOCK_CLASSES} border-accent text-accent`}>
          {error}
          {onFix !== undefined && <FixButton onFix={onFix} />}
        </div>
      )}
    </div>
  );
}
