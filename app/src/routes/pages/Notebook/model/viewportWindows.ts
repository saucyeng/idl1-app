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

/**
 * A span in session-relative microseconds, half-open `[startUs, endUs)` --
 * one window's own resolved bounds, or the gesture viewport re-expressed in
 * the same axis. **Both fields are always finite.** There is no "unbounded"
 * `AbsoluteSpan` -- ruling R134/plan Task 3: a `"session"`-kind window whose
 * true recorded duration is not yet resolved is not representable here at
 * all; {@link resolveWindowSpan} returns `null` for it instead, and its
 * caller drops that window from the result rather than passing a sentinel
 * through. This is the fix for the S1 "a default meaning everything" shape:
 * an `endUs: Infinity` sitting in the same field as a real finite end would
 * make `(t - start) / (end - start)` silently `0` for every `t` in a
 * timeline strip -- every window collapsing onto the left edge with no
 * error and no NaN. A window whose end is unresolved must be *absent*, not
 * a number that reads as valid.
 */
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
 * - `"session"` -- `[0, recordedSpanUs)`. `recordedSpanUs` is that same
 *   window's own recorded duration, in µs -- `model/sessionSpanDriver.ts`'s
 *   `runSessionSpan` result for *this* window, not only the primary one
 *   (plan Task 3: `Notebook/index.tsx`'s driver loop already runs
 *   `runSessionSpan` once per selected window; only the wiring dropped
 *   every non-primary result before this task). `recordedSpanUs === null`
 *   (not yet resolved, or resolution failed) returns `null` here -- the
 *   window is excluded, never treated as "the whole session" by a `0` or an
 *   `Infinity` standing in for "unknown" (this module's own `AbsoluteSpan`
 *   doc comment).
 * - `"range"` -- `[t0_us, t1_us)` verbatim; already absolute, no lookup
 *   needed.
 * - `"lap"` -- `detail.laps`' matching `lap_number`'s
 *   `start_time_secs`/`end_time_secs` (recording-time, t=0-anchored,
 *   C1 §6), converted to µs. `null` when no lap with that number exists
 *   in `detail.laps` -- a per-window resolution failure, matching every
 *   other per-window failure this task isolates (requirement 4): the
 *   caller drops just this window, not the whole channel.
 *
 * @param recordedSpanUs This window's own recorded session duration in µs,
 *   or `null` if unresolved -- only consulted for `"range"`/`"lap"` are
 *   already self-contained kinds; passing `null` for those is harmless.
 */
export function resolveWindowSpan(span: Span, detail: SessionDetail, recordedSpanUs: number | null): AbsoluteSpan | null {
  switch (span.kind) {
    case "session":
      if (recordedSpanUs === null) return null;
      return { startUs: 0, endUs: recordedSpanUs };
    case "range":
      return { startUs: span.t0_us, endUs: span.t1_us };
    case "lap": {
      const lap: LapDetail | undefined = detail.laps.find((l) => l.lap_number === span.lap_number);
      if (lap === undefined) return null;
      return { startUs: lap.start_time_secs * 1_000_000, endUs: lap.end_time_secs * 1_000_000 };
    }
  }
}

/**
 * Resolves the worksheet's shared cursor -- carried as `offsetUs`, an
 * elapsed time **since the primary window's own start** (ruling R131 Q2;
 * plan §3.2: "the cursor must be carried in the same frame [as the
 * viewport]... an offset from the primary window's start, not an absolute
 * session `t_us`") -- to an absolute instant *within `window`*, `window`'s
 * own `startUs` playing the same role {@link mapViewportToWindow}'s
 * `primaryStartUs` parameter does for a viewport span.
 *
 * Returns `null` once `offsetUs` runs past `window`'s own recorded end
 * (`window.startUs + offsetUs >= window.endUs`) -- decision 55's "a window
 * shorter than the [cursor's elapsed time] renders absence past its end,"
 * the same rule {@link mapViewportToWindow} already applies to a viewport
 * span, extended to the single instant a cursor is. A negative `offsetUs`
 * (the cursor sits before this window's own start -- only possible for a
 * window whose start postdates the primary window's) is `null` for the
 * same reason: it names no sample this window recorded.
 *
 * @param offsetUs Elapsed µs since the primary window's own start. May be
 *   negative (a window that starts *before* the primary window would then
 *   have real data there) -- this function only rejects an offset that
 *   falls outside `window` itself, never a negative one on principle.
 * @param window The window to resolve the cursor within -- the primary
 *   window itself (the ordinary single-window case; then this is the
 *   identity transform, `window.startUs + offsetUs`, `null` only past the
 *   primary window's own end) or any other selected window, re-based the
 *   same way `mapViewportToWindow` re-bases a whole viewport span.
 */
export function cursorTimeInWindow(offsetUs: number, window: AbsoluteSpan): number | null {
  const tUs = window.startUs + offsetUs;
  if (tUs < window.startUs || tUs >= window.endUs) return null;
  return tUs;
}
