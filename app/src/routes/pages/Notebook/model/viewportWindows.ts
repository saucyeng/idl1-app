/**
 * Pure span-mapping arithmetic for R131 Q2's window-relative viewport (S1
 * Task 11b): `ChartCell` carries one gesture-driven viewport, and a
 * multi-window selection (two laps of different duration, say) needs that
 * one viewport to become one fetch span *per selected window*, re-based so
 * the windows overlay by their own elapsed time rather than by wall-clock
 * (direction-2 decision 55). No React, no DOM, no IPC, no `@/components/*`
 * import -- `channelBindDriver.ts` calls this with plain numbers/spans it
 * already has; `resolveWindowSpan` below reads only the `SessionDetail`
 * its caller (`Notebook/index.tsx`) has already resolved per window
 * (`sessionDetailsByWindow`), never fetching anything itself.
 */
import type { LapDetail, SessionDetail } from "../../../../ipc/catalog";
import type { Span } from "../../../../ipc/workbook";

/** A span in session-relative microseconds, half-open `[startUs, endUs)` --
 *  one window's own resolved bounds, or the gesture viewport re-expressed
 *  in the same axis. `endUs: Infinity` marks an unbounded span (a
 *  `"session"`-kind window whose true recorded duration isn't resolved for
 *  every selected window today -- only the primary window's is, via
 *  `sessionSpanDriver.ts` -- so a `"session"` window never triggers the
 *  short-window clamp in {@link mapViewportToWindow} below). A `"lap"`/
 *  `"range"` window always carries a real, finite `endUs`. */
export interface AbsoluteSpan {
  startUs: number;
  endUs: number;
}

/**
 * Maps `viewport` (an absolute span in the *primary* window's own
 * coordinate frame -- `binding.initialSpan` or a settled `ChartCell`
 * viewport, both session-relative µs) onto `window`'s own absolute time,
 * per ruling R131 Q2: `viewport` is first re-expressed as an offset
 * `[a, b)` from `primaryStartUs`, then re-applied from `window.startUs` --
 * `[window.startUs + a, window.startUs + b)` -- clamped to `window.endUs`
 * so a window shorter than the viewport never reports data past its own
 * end (requirement 2: that must render as absence, never a value held flat
 * to the right-hand edge -- achieved simply by fetching nothing past the
 * clamp, not by any special-casing in the caller).
 *
 * Returns `null` when the mapped span is empty or inverted after clamping
 * (`window.startUs + a >= min(window.startUs + b, window.endUs)`) -- the
 * window has no data in the current viewport at all; the caller fetches
 * nothing for it and it is simply absent from the combined result, never
 * an error.
 *
 * For the ordinary single-window case (`window === ` the primary window),
 * `a === viewport.startUs - primaryStartUs` and `window.startUs ===
 * primaryStartUs`, so the mapped span equals `viewport` exactly -- a pure
 * re-basing with no behaviour change (R127 item 3, "byte-identical to
 * today").
 */
export function mapViewportToWindow(viewport: AbsoluteSpan, primaryStartUs: number, window: AbsoluteSpan): AbsoluteSpan | null {
  const aUs = viewport.startUs - primaryStartUs;
  const bUs = viewport.endUs - primaryStartUs;
  const startUs = window.startUs + aUs;
  const endUs = Math.min(window.startUs + bUs, window.endUs);
  if (!(startUs < endUs)) return null;
  return { startUs, endUs };
}

/**
 * Resolves one selected window's `span` to its own absolute
 * `[startUs, endUs)` within `detail`'s session, for
 * {@link mapViewportToWindow}'s `window` parameter.
 *
 * - `"session"` -- `[0, Infinity)` (see {@link AbsoluteSpan}'s doc comment
 *   on why the true end isn't resolved here).
 * - `"range"` -- `[t0_us, t1_us)` verbatim; already absolute, no lookup
 *   needed.
 * - `"lap"` -- `detail.laps`' matching `lap_number`'s
 *   `start_time_secs`/`end_time_secs` (recording-time, t=0-anchored,
 *   C1 §6), converted to µs. `null` when no lap with that number exists
 *   in `detail.laps` -- a per-window resolution failure, matching every
 *   other per-window failure this task isolates (requirement 4): the
 *   caller drops just this window, not the whole channel.
 */
export function resolveWindowSpan(span: Span, detail: SessionDetail): AbsoluteSpan | null {
  switch (span.kind) {
    case "session":
      return { startUs: 0, endUs: Infinity };
    case "range":
      return { startUs: span.t0_us, endUs: span.t1_us };
    case "lap": {
      const lap: LapDetail | undefined = detail.laps.find((l) => l.lap_number === span.lap_number);
      if (lap === undefined) return null;
      return { startUs: lap.start_time_secs * 1_000_000, endUs: lap.end_time_secs * 1_000_000 };
    }
  }
}
