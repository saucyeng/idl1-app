import { useEffect, useRef, useState } from "react";

import { ELAPSED_VISIBLE_AFTER_MS } from "../model/cellStateLine";

/**
 * How long the current spell of `active` has lasted, in milliseconds, or
 * `null` when it is not active — the elapsed time ruling R250 shows beside
 * a cell's state line once a wait passes {@link ELAPSED_VISIBLE_AFTER_MS}.
 *
 * **Nothing ticks until there is something to say.** One `setTimeout` is
 * armed when `active` becomes true, for exactly the two seconds before the
 * number is first shown; only then does a one-second interval start. A
 * notebook whose cells all settle inside two seconds — the common case —
 * therefore runs one timer per cell and re-renders not once, and a notebook
 * waiting on a long decode re-renders once a second per waiting cell, which
 * is the rate the number changes at. No `requestAnimationFrame` loop, the
 * same reasoning as `CellFrame`'s own `useMsSinceSettle` (CLAUDE.md §3:
 * nothing on the interaction path).
 *
 * The clock is read here rather than passed in because a *component* is
 * necessarily where the clock lives; every rule about what the number means
 * is in `model/cellStateLine.ts`, which stays pure and takes the answer as
 * an argument.
 *
 * @param active Whether the thing being timed is happening right now.
 *   Every transition to `true` restarts the clock.
 */
export function useElapsedWhile(active: boolean): number | null {
  const startedAt = useRef<number | null>(null);
  const [, force] = useState(0);

  if (active && startedAt.current === null) startedAt.current = Date.now();
  if (!active && startedAt.current !== null) startedAt.current = null;

  useEffect(() => {
    if (!active) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    const started = startedAt.current ?? Date.now();
    const untilVisible = Math.max(ELAPSED_VISIBLE_AFTER_MS - (Date.now() - started), 0);

    const timeout = setTimeout(() => {
      force((n) => n + 1);
      interval = setInterval(() => force((n) => n + 1), 1000);
    }, untilVisible);

    return () => {
      clearTimeout(timeout);
      if (interval !== undefined) clearInterval(interval);
    };
  }, [active]);

  return startedAt.current === null ? null : Date.now() - startedAt.current;
}
