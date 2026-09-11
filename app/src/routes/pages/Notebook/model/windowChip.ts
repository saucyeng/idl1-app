/**
 * The toolbar's window chip (ruling R212 item 4: "window chip (session +
 * laps, always visible)") — the projection from `AppState.selection` to the
 * few characters the chip shows.
 *
 * Grouped by session, because that is how the chip reads: one session name,
 * then the laps taken from it. Lap-to-lap comparison (UI-DIRECTION-2
 * decision 46: "lap to lap will be the most common case") therefore renders
 * as one chip with several lap swatches, not as three chips repeating the
 * same session name.
 *
 * Pure and dependency-free of React and the DOM (`notebookColumns.ts`'s
 * pattern). It computes no number the sync model depends on — a chip's text
 * is pixels, and the selection it describes is owned by `state/selection.ts`.
 */

import type { SessionDetail } from "../../../../ipc/catalog";
import { windowKey, type SelectionWindow } from "../../../../state/selection";

/** One window inside a session group — a lap, the whole session, or an
 *  explicit drag range. */
export interface WindowChipSpan {
  /** `windowKey(window)`, for React keys. */
  key: string;
  /** The window's chart token name (`--chart-1` … `--chart-8`), passed
   *  through unchanged — never resolved to a hex here (R117 item 6). */
  colour: string;
  /** What the swatch is labelled: `"L4"`, `"Full"`, or `"12.3–48.9s"`. */
  text: string;
}

/** One session's contribution to the chip. */
export interface WindowChipGroup {
  sessionId: string;
  /** The session's display name — its metadata if the catalog has landed,
   *  otherwise a short form of its id. */
  sessionText: string;
  /** Its selected windows, in selection order. */
  spans: WindowChipSpan[];
}

/** Seconds, one decimal, for a `"range"` span's own label. */
function seconds(us: number): string {
  return (us / 1_000_000).toFixed(1);
}

/** The swatch text for one span (see {@link WindowChipSpan.text}). */
export function spanText(window: SelectionWindow): string {
  switch (window.span.kind) {
    case "session":
      return "Full";
    case "lap":
      return `L${window.span.lapNumber}`;
    case "range":
      return `${seconds(window.span.t0Us)}–${seconds(window.span.t1Us)}s`;
  }
}

/**
 * A session's display name: the first non-empty of event name, venue and
 * rider (C1 §6's metadata, where `""` means "not set" — there is no null
 * form), falling back to the first eight characters of the session id.
 *
 * The fallback is not an error state: `detail` is `null` for every window
 * until `get_session_detail` lands for it, and a chip that showed nothing in
 * the meantime would flicker its width on every selection change.
 */
export function sessionText(sessionId: string, detail: SessionDetail | null): string {
  const candidates = detail === null ? [] : [detail.event_name, detail.venue_name, detail.rider];
  const named = candidates.find((value) => value.trim().length > 0);
  return named ?? sessionId.slice(0, 8);
}

/**
 * `windows` grouped by session, in first-appearance order, each group
 * keeping its windows in selection order.
 *
 * @param windows `AppState.selection`, unmodified.
 * @param detailsByWindow `Notebook/index.tsx`'s `sessionDetailsByWindow` — keyed by `windowKey`, `null` for a window whose detail has not landed.
 */
export function windowChipGroups(windows: readonly SelectionWindow[], detailsByWindow: Map<string, SessionDetail | null>): WindowChipGroup[] {
  const groups: WindowChipGroup[] = [];

  for (const window of windows) {
    const key = windowKey(window);
    const span: WindowChipSpan = { key, colour: window.colour, text: spanText(window) };
    const existing = groups.find((group) => group.sessionId === window.sessionId);
    if (existing !== undefined) {
      existing.spans.push(span);
      // A later window may be the one that carries the resolved detail.
      if (existing.sessionText === window.sessionId.slice(0, 8)) {
        existing.sessionText = sessionText(window.sessionId, detailsByWindow.get(key) ?? null);
      }
      continue;
    }
    groups.push({
      sessionId: window.sessionId,
      sessionText: sessionText(window.sessionId, detailsByWindow.get(key) ?? null),
      spans: [span],
    });
  }

  return groups;
}

/** The chip's text when nothing is selected — an invitation to act, not a
 *  blank (UI-DIRECTION "Empty state"). The Data tab is where a selection is
 *  made, so that is what it names. */
export const NO_SELECTION_TEXT = "No session — pick one in Data";
