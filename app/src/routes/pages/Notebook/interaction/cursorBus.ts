/**
 * Pure, dependency-free publish/subscribe holder for the worksheet's shared
 * cursor (direction-2 decision 51: the cursor follows the pointer across
 * every chart; a click pins it). Plan `runs/2026-09-08/w32-time-plan.md`
 * §2.2/Task 1, ruling R134 item 8's headline finding: the sandbox is never
 * on the pointer path (the iframe is `pointer-events: none`,
 * `ChartCell.tsx:265`), so cross-chart cursor propagation is a host-realm
 * concern end to end, and it must not go through React `setState` at
 * pointer rate — up to 120 Hz on a high-rate mouse would re-render
 * `Notebook/index.tsx` and every mounted `ChartCell` on every pointer move.
 *
 * One instance per worksheet, created in `Notebook/index.tsx` and handed
 * down by ref/context, never by React state. Subscribers (a `ChartCell`'s
 * cursor-line element, the future cursor value card) apply the new state to
 * the DOM imperatively (`el.style.transform = …`, `el.hidden = …`) instead
 * of re-rendering. `pin`/`unpin` still land in React state at the caller —
 * see this module's own doc note below — because pinning is a settle-grade
 * event (it seeds the R62 readout, the context menu's `hasCursor` and
 * playback), not an interaction-rate one.
 *
 * No React, no DOM, no timers — a plain closure over a mutable state object
 * and a subscriber list.
 */

/**
 * The worksheet's shared cursor, at a point in time. `tUs` is
 * session-relative microseconds — `number`, not `bigint`: this bus runs at
 * pointer rate, and `bigint` allocates per arithmetic operation. `bigint`
 * stays at the pinned/playback boundary where it already lives today
 * (`PlaybackState.tUs`); the one documented `number`↔`bigint` conversion
 * happens at the call site that seeds a pin from a pointer event, mirroring
 * `ChartCell.tsx`'s existing `Number(cursorTUs)`.
 *
 * `tUs === null` means no cursor is shown (nothing hovered, nothing
 * pinned) — never a sentinel number standing in for "absent".
 */
export interface CursorState {
  /** Session-relative microseconds, or `null` when nothing is hovered/pinned. */
  tUs: number | null;
  /** `true` once a click (or the future keyboard equivalent) has pinned the cursor at `tUs`. */
  pinned: boolean;
}

/** Called with the bus's new state on every `publish`/`pin`/`unpin`. */
export type CursorSubscriber = (state: CursorState) => void;

/** Unsubscribes the listener passed to {@link CursorBus.subscribe}. */
export type Unsubscribe = () => void;

/** The worksheet-shared cursor holder — see this module's top doc comment. */
export interface CursorBus {
  /** The bus's current state, for a subscriber that mounts after the last publish/pin/unpin (e.g. a chart added mid-session). */
  getState(): CursorState;
  /**
   * Moves the (unpinned) cursor to `tUs`, or hides it (`null`) — a hover
   * move or a pointer leaving every chart. Does **not** change `pinned`.
   * The decision of *whether* to call this while pinned belongs to
   * `interaction/cursorFollowPolicy.ts` (Task 2), not to the bus — the bus
   * is a plain holder, not a gesture-verb policy.
   */
  publish(tUs: number | null): void;
  /** Pins the cursor at `tUs` (a click) — sets `pinned: true`. */
  pin(tUs: number): void;
  /** Unpins the cursor (a click on an already-pinned cursor, or Esc) — clears `tUs` and sets `pinned: false`, matching today's `onClearCursor`. */
  unpin(): void;
  /** Registers `fn` to be called on every state change; returns a function that removes it. Safe to call from inside a subscriber (removal takes effect on the next notify). */
  subscribe(fn: CursorSubscriber): Unsubscribe;
}

/** Creates one worksheet's cursor bus, starting with no cursor shown. */
export function createCursorBus(): CursorBus {
  let state: CursorState = { tUs: null, pinned: false };
  let subscribers: CursorSubscriber[] = [];

  function notify(): void {
    for (const fn of subscribers) fn(state);
  }

  return {
    getState: () => state,
    publish(tUs) {
      state = { tUs, pinned: state.pinned };
      notify();
    },
    pin(tUs) {
      state = { tUs, pinned: true };
      notify();
    },
    unpin() {
      state = { tUs: null, pinned: false };
      notify();
    },
    subscribe(fn) {
      subscribers = [...subscribers, fn];
      return () => {
        subscribers = subscribers.filter((s) => s !== fn);
      };
    },
  };
}
