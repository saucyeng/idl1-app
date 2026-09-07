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
 */

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
