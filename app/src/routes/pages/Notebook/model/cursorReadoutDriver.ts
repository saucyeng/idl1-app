import type { CursorReadout } from "../../../../ipc/cursor";
import { cursorRequestFor, describeCursorReadoutError, formatReadout, type ReadoutPanelState } from "./cursor";
import { isStaleSettleResult, makeSettle, type SettleTimer } from "./settle";
import type { Viewport } from "./viewport";

/**
 * How long the pointer must stop moving before the cursor readout panel
 * refreshes on its own, independent of any pan/zoom settle (design §6
 * "cursor settle"; ruling R62). Before this, the readout only ever
 * refreshed from `ChartCell`'s tile-fetch settle, so a plain hover-and-stop
 * with no pan/zoom gesture never produced a readout at all. ms.
 */
export const CURSOR_SETTLE_MS = 150;

/** What {@link makeCursorReadoutDriver} needs injected: the real
 *  `cursorReadout` IPC call (bound to this cell's session/channel) and a
 *  sink for the resulting panel state. Kept separate from `ChartCell`'s own
 *  props so this driver has no React import and is unit-testable with a
 *  fake fetch and a fake timer (`settle.test.ts`'s pattern). */
export interface CursorReadoutDriverDeps {
  /** `ipc/cursor.ts`'s `cursorReadout`, or a test double. */
  fetchCursorReadout(sessionId: string, channels: string[], tUs: number): Promise<CursorReadout>;
  /** Called with the panel's new display state after every dispatch (a
   *  resolved fetch, a rejected fetch, an out-of-plot pixel, or a
   *  pointer-leave) — `ChartCell.tsx` wires this to `setReadoutState`. */
  onState(state: ReadoutPanelState): void;
  sessionId: string;
  channelId: string;
  channelLabel?: string;
}

/** The handle {@link makeCursorReadoutDriver} returns. */
export interface CursorReadoutDriver {
  /** Called on every pointer move (drag or hover alike) with the current
   *  viewport and the pointer's CSS-px position. Debounces internally by
   *  {@link CURSOR_SETTLE_MS} — its own settle, independent of
   *  `ChartCell`'s tile-fetch settle — and dispatches once the pointer
   *  stops moving for that long. */
  notify(viewport: Viewport, pixelX: number): void;
  /** Called directly from `ChartCell`'s own viewport-settle callback, with
   *  no additional debounce (that settle already waited out its own
   *  delay) — "the viewport settle also refreshes the readout." `pixelX`
   *  is the pointer's last-known position (`null` if the pointer has
   *  already left the chart, which clears the panel rather than issuing a
   *  request for a stale position). */
  dispatchNow(viewport: Viewport, pixelX: number | null): void;
  /** The pointer left the chart: clears the panel immediately and
   *  invalidates any fetch already in flight from either trigger path
   *  above, so a late-resolving result can never land afterwards
   *  ("stale-by-sequence" — nothing in flight is cancelled, its result is
   *  just dropped on arrival). */
  leave(): void;
  /** Cancels a pending debounce timer from {@link notify}. Call on
   *  unmount, mirroring `model/settle.ts`'s own `cancel()`. */
  cancel(): void;
}

/**
 * The cross-channel cursor readout's settle-and-fetch driver (Task 10;
 * ruling R62, `runs/2026-09-03/decisions.md`). Two independent trigger
 * paths ({@link CursorReadoutDriver.notify} and
 * {@link CursorReadoutDriver.dispatchNow}) feed the same dispatch logic and
 * share **one** sequence counter for the stale-result guard, so whichever
 * fires last — a pan/zoom settle, or the pointer simply stopping — wins
 * consistently regardless of path.
 *
 * `pixelX === null` (no last-known pointer position, or the pointer has
 * left the chart) and a `cursorRequestFor` `null` (pixel outside the
 * plotted area) both clear the panel (`onState(null)`) rather than issuing
 * a request — mirrored from `ChartCell.tsx`'s pre-R62 inline logic.
 *
 * @param deps Injected fetch/session/channel/sink — see {@link CursorReadoutDriverDeps}.
 * @param delayMs Debounce delay for {@link CursorReadoutDriver.notify}, in ms ({@link CURSOR_SETTLE_MS} in production).
 * @param timer Injected `setTimeout`/`clearTimeout`-shaped scheduler for the internal `makeSettle`; defaults to the real global timer (see `settle.ts`).
 */
export function makeCursorReadoutDriver(deps: CursorReadoutDriverDeps, delayMs: number, timer?: SettleTimer): CursorReadoutDriver {
  let seq = 0;

  function dispatch(viewport: Viewport, pixelX: number | null): void {
    seq += 1;
    const seqAtDispatch = seq;

    if (pixelX === null) {
      deps.onState(null);
      return;
    }
    const request = cursorRequestFor(viewport, pixelX, [deps.channelId]);
    if (request === null) {
      deps.onState(null);
      return;
    }
    const labels = deps.channelLabel === undefined ? {} : { [deps.channelId]: deps.channelLabel };

    deps
      .fetchCursorReadout(deps.sessionId, request.channels, request.tUs)
      .then((readout) => {
        if (isStaleSettleResult(seqAtDispatch, seq)) {
          return;
        }
        deps.onState({ kind: "rows", rows: formatReadout(readout, labels) });
      })
      .catch((error: unknown) => {
        if (isStaleSettleResult(seqAtDispatch, seq)) {
          return;
        }
        deps.onState({ kind: "error", message: describeCursorReadoutError(error) });
      });
  }

  const settle = makeSettle<{ viewport: Viewport; pixelX: number }>(delayMs, ({ viewport, pixelX }) => dispatch(viewport, pixelX), timer);

  return {
    notify(viewport: Viewport, pixelX: number): void {
      settle.notify({ viewport, pixelX });
    },
    dispatchNow(viewport: Viewport, pixelX: number | null): void {
      dispatch(viewport, pixelX);
    },
    leave(): void {
      seq += 1;
      deps.onState(null);
    },
    cancel(): void {
      settle.cancel();
    },
  };
}
