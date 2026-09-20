/**
 * The one line a cell frame shows in place of (or over) its output while it
 * is not done — ruling R250's "never a blank, and no spinner without a
 * label".
 *
 * Pure and clock-free: the caller passes elapsed milliseconds in, exactly
 * as `model/plotChrome.ts` takes `msSinceSettle`. No React, no DOM, no
 * `Date`.
 *
 * `null` for `"done"` and `"error"`: those two already have their own
 * pixels (the ✓ that fades, the ✕ with its message) and a second line
 * repeating them would be noise. Every other state gets a line, because
 * every other state is one a reader is otherwise left guessing at.
 */
import type { BlockedBy } from "./blockedCells";
import type { CellStatus } from "./cellStatus";

/** How long a cell waits before its elapsed time is worth showing, in
 *  milliseconds (the R250 spec's §6). Below this the number flashes up and
 *  vanishes, which is noise; above it the reader is waiting and wants to
 *  know how long for. */
export const ELAPSED_VISIBLE_AFTER_MS = 2000;

/** What a frame draws for a cell that is not done. */
export interface CellStateLine {
  /** The line itself — `"fetching IMU0_AccelZ · 40 %"`, `"evaluating"`,
   *  `"blocked by Cell 3: unknown channel"`. Never empty. */
  text: string;
  /** The fraction `[0, 1]` a determinate ring is drawn at, or `null` for an
   *  indeterminate spinner. Only ever non-`null` for `"fetching"`, the one
   *  state with a measured fraction behind it (ruling R221). */
  fraction: number | null;
  /** Whether this state is work in progress, so a spinner or ring belongs
   *  beside the text. `false` for `"idle"` and `"blocked"`, neither of
   *  which is running or going to. */
  busy: boolean;
}

/** Everything {@link cellStateLine} reads. */
export interface CellStateLineInputs {
  status: CellStatus;
  /** `[0, 1]`, or `null` — `state/decodeProgress.ts`'s
   *  `cellDecodeFraction`. */
  decodeFraction: number | null;
  /** The channel currently being decoded for this cell, when exactly one
   *  is (`state/decodeProgress.ts`). `null` names none: with two channels
   *  in flight there is no single honest name, and with a cache hit there
   *  is nothing being read at all. */
  decodingChannel: string | null;
  /** This cell's upstream failure (`model/blockedCells.ts`), or `null`. */
  blockedBy: BlockedBy | null;
  /** Milliseconds this cell has been in a waiting state, or `null` when it
   *  has not been timed. Appended once past {@link
   *  ELAPSED_VISIBLE_AFTER_MS}. */
  elapsedMs: number | null;
}

/** The line for a state, before the elapsed suffix. */
function baseLine(inputs: CellStateLineInputs): CellStateLine | null {
  switch (inputs.status) {
    case "idle":
      return { text: "No session selected", fraction: null, busy: false };
    case "queued":
      return { text: "Queued", fraction: null, busy: true };
    case "fetching": {
      // `decodeFraction` is what made this state `"fetching"` in the first
      // place (`cellStatus.ts`), so it is non-null here; the `?? null`
      // keeps this function total rather than asserting it.
      const fraction = inputs.decodeFraction ?? null;
      const percent = fraction === null ? null : Math.floor(clamp01(fraction) * 100);
      const what = inputs.decodingChannel === null ? "Fetching channels" : `Fetching ${inputs.decodingChannel}`;
      // Floored, never rounded, for `describeDecodeSummary`'s own reason: a
      // line reading "100 %" while the decode is still running is the one
      // thing this text must not say.
      return { text: percent === null ? what : `${what} · ${percent} %`, fraction, busy: true };
    }
    case "evaluating":
      return { text: "Evaluating", fraction: null, busy: true };
    case "rendering":
      return { text: "Rendering", fraction: null, busy: true };
    case "stale":
      return { text: "Recomputing", fraction: null, busy: true };
    case "blocked":
      return inputs.blockedBy === null
        ? // Unreachable through `cellStatus`, which only returns `"blocked"`
          // when `blockedBy` is set — but a line saying nothing is worse
          // than a vaguer one, and this function stays total.
          { text: "Blocked by an upstream failure", fraction: null, busy: false }
        : { text: `Blocked by ${inputs.blockedBy.cellLabel}: ${inputs.blockedBy.message}`, fraction: null, busy: false };
    case "done":
    case "error":
      return null;
  }
}

/** Clamps to `[0, 1]` so a fraction outside it can never reach a ring. */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Formats an elapsed duration for the suffix — `"4 s"`, `"1 min 20 s"`.
 * Whole seconds: a waiting reader is not served by milliseconds, and a
 * digit changing thirty times a second is the flicker this ruling exists
 * to remove.
 */
export function describeElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * The line for one cell, or `null` when the cell's own pixels already say
 * it (`"done"`, `"error"`).
 *
 * The elapsed time is appended only past {@link ELAPSED_VISIBLE_AFTER_MS}
 * and only to a busy state: a blocked cell has not been waiting for
 * anything, and an idle one is not waiting at all.
 */
export function cellStateLine(inputs: CellStateLineInputs): CellStateLine | null {
  const line = baseLine(inputs);
  if (line === null) return null;
  if (!line.busy || inputs.elapsedMs === null || inputs.elapsedMs < ELAPSED_VISIBLE_AFTER_MS) return line;

  return { ...line, text: `${line.text} · ${describeElapsed(inputs.elapsedMs)}` };
}
