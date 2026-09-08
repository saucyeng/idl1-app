/**
 * Live-speed playback's clock (decision 18: "playback is a feature, not an
 * animation" — a play button runs the shared worksheet cursor at live
 * speed). Pure: a `requestAnimationFrame` loop in `Notebook/index.tsx`
 * supplies `elapsedMs` from its own injected clock/scheduler and calls
 * {@link tick} with it; nothing here touches `requestAnimationFrame`,
 * `Date.now`, IPC or `postMessage` itself, so start/pause/seek/rate and the
 * end-of-span stop are all tested with no timer and no DOM.
 *
 * Panning every open chart while the cursor advances (`UI-DIRECTION`
 * decision 18) is a separate concern, in `interaction/cursorFollow.ts`:
 * this module only ever answers "what is the cursor's new time and is
 * playback still running", never "what does a chart show".
 *
 * Decision 57 (plan Task 10) wants selectable speed and "play stops at the
 * end of the **lap**" rather than the end of the session. {@link tick}
 * already takes an arbitrary `spanUs` bound — it needed no change for the
 * second half; only its *caller* did (`Notebook/index.tsx` now passes the
 * primary selected window's own resolved span, via {@link playableSpanUs}
 * below, instead of `[0, sessionSpanUs]`). R134 item 6: with several windows
 * selected, playback follows the **primary** window and the transport names
 * it (`PlaybackTransport`, plan Task 12).
 */
import type { AbsoluteSpan } from "../model/viewportWindows";

/** Playback's own state: the shared cursor's current time, whether it is
 *  advancing, and its rate. */
export interface PlaybackState {
  /** The shared cursor's current position, in µs since session start. */
  tUs: bigint;
  /** Whether the clock is currently advancing `tUs`. */
  playing: boolean;
  /** A multiple of real time; `1` is live speed (decision 18 ships only
   *  this multiple — see the brief's Open question 3). */
  speed: number;
}

/**
 * Advances `state.tUs` by `elapsedMs * state.speed` (converted to µs),
 * clamped to `spanUs`. Returns `state` unchanged (by reference) when not
 * playing, so a caller can skip a `setState` call for a no-op tick.
 *
 * Reaching or passing `spanUs[1]` (the end of the session/lap span) clamps
 * `tUs` to exactly `spanUs[1]` and sets `playing` to `false` — playback
 * stops at the end rather than looping or running off it, even under a
 * long frame gap (a stalled tab, a slow frame) that would otherwise
 * overshoot by more than one span's worth in a single tick.
 *
 * @param state Playback state before this tick.
 * @param elapsedMs Wall-clock time since the previous tick, in ms.
 * @param spanUs `[start, end]` of the playable span, in µs since session start.
 */
export function tick(state: PlaybackState, elapsedMs: number, spanUs: [bigint, bigint]): PlaybackState {
  if (!state.playing) {
    return state;
  }

  const [startUs, endUs] = spanUs;
  const deltaUs = BigInt(Math.round(elapsedMs * state.speed * 1000));
  let nextTUs = state.tUs + deltaUs;

  if (nextTUs >= endUs) {
    return { tUs: endUs, playing: false, speed: state.speed };
  }
  if (nextTUs < startUs) {
    nextTUs = startUs;
  }

  return { tUs: nextTUs, playing: true, speed: state.speed };
}

/**
 * Flips `state.playing`. Deliberately does **not** reset `tUs` to the
 * start of the span when toggling play on from the span's end (decided,
 * per the brief's "decide, document, test"): this function's given
 * signature carries no span bound to detect "at the end" against, and
 * `Notebook/index.tsx`'s own toggle handler already re-seeds `tUs` from
 * the worksheet's manually-set cursor before calling this when one exists
 * (see `index.tsx`'s `handleTogglePlay`). Toggling play at the exact end
 * of a span with no manual cursor set "stays put": the state becomes
 * `{playing: true}` at `tUs === spanUs[1]`, and the very next {@link tick}
 * call immediately re-detects `nextTUs >= endUs` and sets `playing` back
 * to `false` — a harmless one-tick no-op, not a surprise jump backwards.
 *
 * @param state Playback state before the toggle.
 */
export function togglePlay(state: PlaybackState): PlaybackState {
  return { ...state, playing: !state.playing };
}

/**
 * Whether `PlaybackTransport` should render at all. It portals into
 * `shell/TopBar.tsx`'s slot (outside the Notebook route's own `hidden`
 * subtree, per mount-and-hide/R93), so the `hidden` attribute that
 * correctly hides the rest of the Notebook page never reaches it — this
 * function is the explicit substitute check the caller must apply before
 * rendering `PlaybackTransport` at all (not just `disabled`), so the
 * play/pause control and timer do not leak into the shared top bar while
 * the Device/Data/Settings tab is the active route (R95/R99).
 *
 * @param routeVisible Whether the Notebook route is the active, visible route.
 * @param cursorTUs The shared cursor's current time, or `null` when nothing
 *   is loaded (no session/worksheet) or no cursor has ever been placed.
 */
export function shouldRenderPlaybackTransport(routeVisible: boolean, cursorTUs: bigint | null): boolean {
  return routeVisible && cursorTUs !== null;
}

/**
 * Formats a cursor time as `mm:ss.mmm` for `PlaybackTransport`'s live-speed
 * readout. Pure text formatting, not a unit conversion of any sample value
 * (CLAUDE.md §4: UI rendering itself is not unit-tested, but this function
 * is, since it is the one piece of display logic separable from JSX).
 *
 * @param tUs Time since session start, in µs.
 */
export function formatPlaybackTime(tUs: bigint): string {
  const totalMs = tUs / 1000n;
  const ms = totalMs % 1000n;
  const totalSeconds = totalMs / 1000n;
  const seconds = totalSeconds % 60n;
  const minutes = totalSeconds / 60n;
  const pad = (n: bigint, width: number) => n.toString().padStart(width, "0");
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(ms, 3)}`;
}

/** One selectable playback rate (decision 57) — a multiple of real time and
 *  the label `PlaybackTransport`'s speed select (plan Task 12) shows for it. */
export interface PlaybackSpeed {
  /** Multiple of real time; `1` is live speed. Matches {@link PlaybackState.speed}. */
  value: number;
  /** Display label, e.g. `"2×"`. */
  label: string;
}

/** The named speed set `PlaybackTransport`'s select offers (decision 57:
 *  "speed is selectable"). `1` (live speed) is the default a fresh
 *  {@link PlaybackState} starts at. Order is display order, slowest first. */
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [
  { value: 0.25, label: "0.25×" },
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
];

/**
 * Sets `state.speed` to `speed`, leaving `tUs`/`playing` untouched — a rate
 * change takes effect on the very next {@link tick} call, mid-playback or
 * while paused alike.
 *
 * @param state Playback state before the change.
 * @param speed The new speed multiple (ordinarily one of
 *   {@link PLAYBACK_SPEEDS}' `value`s, but not asserted here — the select
 *   only ever offers those, and asserting membership would make an
 *   in-between value, e.g. from a future slider, a defect rather than a
 *   feature).
 */
export function setSpeed(state: PlaybackState, speed: number): PlaybackState {
  return { ...state, speed };
}

/**
 * Converts a resolved window span (`model/viewportWindows.ts`'s
 * `AbsoluteSpan`, plain finite µs numbers) to {@link tick}'s `spanUs` bigint
 * tuple, per decision 57/plan Task 10: playback stops at the **playing
 * window's own end**, not the whole session. `window.startUs` is carried
 * through as-is (not clamped to `0`) so a window that does not start at the
 * session's own `t=0` — a lap other than the first — plays from *its* start,
 * matching {@link cursorTimeInWindow}'s own frame in `viewportWindows.ts`.
 *
 * Returns `null` when `window` itself is `null` — the playing window's span
 * hasn't resolved yet (or nothing is selected) — so the caller can skip
 * ticking rather than pass a fabricated bound (this module's own "no
 * sentinel" rule, matching `viewportWindows.ts`'s `AbsoluteSpan` doc
 * comment: an unresolved span is absent, never `[0, 0]` or `[0, Infinity]`).
 *
 * @param window The playing window's own resolved span, or `null` if unresolved.
 */
export function playableSpanUs(window: AbsoluteSpan | null): [bigint, bigint] | null {
  if (window === null) return null;
  return [BigInt(Math.round(window.startUs)), BigInt(Math.round(window.endUs))];
}
