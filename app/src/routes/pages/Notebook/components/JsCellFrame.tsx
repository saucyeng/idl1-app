import { useEffect, useRef } from "react";

/**
 * Default height reserved for a plain-mount `js` cell before its first
 * `cellRendered` (`ChartCellProps.heightPx`'s doc comment gives
 * `ChartCell`'s own equivalent). No spec number is given; matches the
 * fallback height any bound cell starts at.
 */
export const DEFAULT_JS_CELL_HEIGHT_PX = 240;

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
export default function JsCellFrame({ cellId, heightPx, error, note, sendLayout }: JsCellFrameProps) {
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

  return (
    <div
      ref={frameRef}
      className="js-cell-frame"
      style={{ position: "relative", width: "100%", height: heightPx ?? DEFAULT_JS_CELL_HEIGHT_PX }}
    >
      {note !== undefined && <div className="js-cell-frame-note">{note}</div>}
      {error !== undefined && <div className="js-cell-frame-error">{error}</div>}
    </div>
  );
}
