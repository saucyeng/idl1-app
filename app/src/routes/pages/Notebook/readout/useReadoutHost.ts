/**
 * The notebook's side of the overlay readouts (video overlay spec §7b, §7c;
 * C3 §3.7.1): finds the names the readout cells read, opens a prepared
 * readout over the primary window's whole session, reads it at every
 * shared-cursor change through the newest-wins loop, and binds each answer
 * as the sandbox's `Readout`. React glue over the tested `scan.ts`,
 * `driver.ts` and `frame.ts`.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

import { closeReadout, openReadout, readReadout, type ReadoutTail } from "../../../../ipc/readout";
import type { SandboxHost } from "../host/SandboxHost";
import { makeReadoutDriver } from "./driver";
import { EMPTY_READOUT_FRAME, type ReadoutFrame } from "./frame";
import { scanReadouts, tailCount } from "./scan";
import { useDisplayUnits } from "./useDisplayUnits";

/** What {@link useReadoutHost} reads from the notebook page. */
export interface ReadoutHostInputs {
  /** The page's sandbox host, read at call time. */
  hostRef: MutableRefObject<SandboxHost | null>;
  /** The open workbook's id, or `null`. */
  workbookId: string | null;
  /** The primary window's session, or `null` with none selected. */
  sessionId: string | null;
  /** The workbook text; a change reopens the handle (its evaluation may have moved). */
  markdown: string | null;
  /** Every `js` cell's source, in document order. */
  jsCodes: readonly string[];
  /** The shared cursor, session-relative µs, `null` with none. */
  cursorTUs: bigint | null;
  /** The master video's frame rate (frames/s), or 60 with no video: the tail's spacing. */
  fps: number;
  /** Bumped when the sandbox is rebuilt. */
  primeEpoch: number;
  /** Also told every frame bound as `Readout`, for readouts the page draws
   *  itself (the overlay canvas, 2026-11-23). Never awaited. */
  onFrame?: (frame: ReadoutFrame) => void;
}

/** Runs the readouts for the notebook page. */
export function useReadoutHost(inputs: ReadoutHostInputs): void {
  const { hostRef, workbookId, sessionId, markdown, jsCodes, cursorTUs, fps, primeEpoch } = inputs;
  const onFrameRef = useRef(inputs.onFrame);
  onFrameRef.current = inputs.onFrame;
  const scan = useMemo(() => scanReadouts(jsCodes), [jsCodes]);
  const namesKey = scan.names.join("\u0000");
  const count = tailCount(scan.tailS, fps);

  const display = useDisplayUnits();

  const metaRef = useRef<Pick<ReadoutFrame, "units" | "extent">>({ units: {}, extent: {} });
  const displayRef = useRef(display);
  displayRef.current = display;

  const publish = (frame: ReadoutFrame) => {
    onFrameRef.current?.(frame);
    hostRef.current?.setHostVar("Readout", { kind: "json", value: frame });
  };

  const driverRef = useRef<ReturnType<typeof makeReadoutDriver> | null>(null);
  if (driverRef.current === null) {
    driverRef.current = makeReadoutDriver({
      read: readReadout,
      // Nothing on the interaction path waits on IPC (CLAUDE.md §2): the
      // draw never awaits this; it rebinds `Readout` when an answer lands.
      onValues: (v) => publish({ values: v.values, tail: v.tail ?? {}, ...metaRef.current, display: displayRef.current, tail_step_s: 1 / fpsRef.current }),
    });
  }
  const driver = driverRef.current;

  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  const cursorRef = useRef(cursorTUs);
  cursorRef.current = cursorTUs;

  useEffect(() => {
    if (workbookId === null || sessionId === null || namesKey === "") {
      driver.setHandle(null, null);
      return;
    }
    let disposed = false;
    let opened: number | null = null;
    const tail: ReadoutTail | null = count > 0 ? { count, step_us: Math.round(1e6 / fps) } : null;
    openReadout(workbookId, { session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" }, namesKey.split("\u0000")).then(
      (h) => {
        if (disposed) {
          void closeReadout(h.handle);
          return;
        }
        opened = h.handle;
        metaRef.current = { units: h.units, extent: h.extent };
        driver.setHandle(h.handle, tail);
        const t = cursorRef.current;
        if (t !== null) driver.request(Number(t));
      },
      () => driver.setHandle(null, null)
    );
    return () => {
      disposed = true;
      driver.setHandle(null, null);
      if (opened !== null) void closeReadout(opened);
    };
  }, [workbookId, sessionId, namesKey, markdown, count, fps, primeEpoch, driver]);

  useEffect(() => {
    if (cursorTUs === null) {
      publish({ ...EMPTY_READOUT_FRAME, ...metaRef.current, display });
      return;
    }
    driver.request(Number(cursorTUs));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `publish` reads the host ref at call time
  }, [cursorTUs, display, driver]);
}
