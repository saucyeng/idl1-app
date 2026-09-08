import type { SessionSummary } from "../../../ipc/catalog";
import { assignColour, nextWindows, type SelectionModifier, type SelectionWindow } from "../../../state/selection";
import { formatDateMs, formatDurationMs, formatTimeMs, localIsoDate } from "./format";

/** Synthetic label for an empty `venue_name`, shared with the venue facet
 *  (Task 3) so a filtered row and its chip always agree. */
const NONE_VENUE = "(none)";

/** Synthetic label for a `timestamp_utc_ms` of 0 (C1 §3.1: 0 means
 *  "unknown", never rendered as the 1970 epoch). */
const UNKNOWN_DATE = "unknown";

/** `venue_name`, or the synthetic "(none)" label when it is empty — shared
 *  by the session list, its facet, and the detail pane (Task 4) so the same
 *  session always reads the same venue text everywhere. `toSessionRow`
 *  below has no Track-venue fallback (R54 drops track linkage from
 *  `SessionSummary` entirely, and the session list only ever sees a
 *  `SessionSummary`) — this is the "(none)" convention alone, not a track
 *  lookup. A context that does have `TrackVisitSummary[]`/`tracksById`
 *  (e.g. a future session-detail venue line) uses [[resolveDisplayVenue]]
 *  (`trackRow.ts`, Task 6) instead, then still passes the result through
 *  this same `venueLabel` for the shared "(none)" text. */
export function venueLabel(venueName: string): string {
  return venueName === "" ? NONE_VENUE : venueName;
}

/** One row in the sessions result list — a pure display derivation of one
 *  `SessionSummary` (C3 §3.2). Holds no engine truth: every number here came
 *  from the catalog, formatted for the screen only. */
export interface SessionRow {
  sessionId: string;
  /** `timestamp_utc_ms` rendered in the viewer's locale; "unknown" when the
   *  summary's `timestamp_utc_ms` is 0 (C1 §3.1: 0 means unknown). */
  dateText: string;
  timeText: string;
  /** `venue_name`, or "(none)" when empty — the same synthetic label the
   *  venue facet uses so a filtered row and its chip agree. */
  venueText: string;
  riderText: string;
  bikeText: string;
  /** `duration_ms` as `h:mm:ss`, or "—" when null. */
  durationText: string;
  /** `lap_count` as digits, or "—" when null (laps not indexed yet). */
  lapCountText: string;
  sourceFormat: SessionSummary["source_format"];
  /** Sort/group key: local ISO date (`YYYY-MM-DD`) plus display venue. */
  groupKey: string;
}

/** Derives a display row from one catalog `SessionSummary` (C3 §3.2). Pure
 *  formatting only — no IPC, no engine computation. */
export function toSessionRow(s: SessionSummary): SessionRow {
  const hasTimestamp = s.timestamp_utc_ms !== 0;
  const dateText = hasTimestamp ? formatDateMs(s.timestamp_utc_ms) : UNKNOWN_DATE;
  const timeText = hasTimestamp ? formatTimeMs(s.timestamp_utc_ms) : UNKNOWN_DATE;
  const venueText = venueLabel(s.venue_name);
  const groupKey = `${hasTimestamp ? localIsoDate(s.timestamp_utc_ms) : UNKNOWN_DATE} ${venueText}`;

  return {
    sessionId: s.session_id,
    dateText,
    timeText,
    venueText,
    riderText: s.rider,
    bikeText: s.bike,
    durationText: s.duration_ms === null ? "—" : formatDurationMs(s.duration_ms),
    lapCountText: s.lap_count === null ? "—" : s.lap_count.toString(),
    sourceFormat: s.source_format,
    groupKey,
  };
}

/** Returns a row's precomputed sort/group key (local date + display venue). */
export function groupKeyOf(row: SessionRow): string {
  return row.groupKey;
}

/** Maps a session/lap row click's modifier keys to a `state/selection.ts`
 *  `SelectionModifier` — the app-wide convention this task establishes for
 *  every clickable selection row (session rows here, lap rows in
 *  `lapSelection.ts`): shift-click extends the selection (`"add"`),
 *  ctrl/cmd-click toggles just the clicked window on or off (`"toggle"`),
 *  a plain click replaces the whole selection with the clicked window
 *  (`"replace"`) — idl0-parity (R96: a plain click is still how a user
 *  gets back to "just this one" after building a multi-window selection). */
export function modifierFromClick(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectionModifier {
  if (e.shiftKey) return "add";
  if (e.ctrlKey || e.metaKey) return "toggle";
  return "replace";
}

/** Computes the next `AppState.selection` when a session row (the whole
 *  session, `{ kind: "session" }`) is clicked, per `modifier`. All the
 *  combination logic — replace/add/toggle, de-duplication on toggle — lives
 *  in `state/selection.ts`'s `nextWindows`; this function is only "which
 *  window does a session-row click mint" (S1 Task 12, R117 item 2: a
 *  session already selected via a lap window and now clicked as a whole
 *  session is a second, legal window, not a collapse). A freshly minted
 *  window's colour comes from `assignColour(current)`; a window being
 *  toggled off is dropped by `nextWindows` and never needs one. */
export function sessionRowClicked(
  current: readonly SelectionWindow[],
  sessionId: string,
  modifier: SelectionModifier,
): SelectionWindow[] {
  // A "replace" click's result is `[clicked]` alone (`nextWindows`), so its
  // colour is the first of the cycle — `assignColour` against the *current*
  // (about-to-be-discarded) list would otherwise pick up wherever that list
  // left off.
  const colourBase = modifier === "replace" ? [] : current;
  const clicked: SelectionWindow = { sessionId, span: { kind: "session" }, colour: assignColour(colourBase) };
  return nextWindows(current, clicked, modifier);
}

/** Drops every window in `windows` whose `sessionId` is no longer in
 *  `existingSessionIds` — R117 item 5: a session removed from the catalog
 *  (deleted, forgotten, or missing after a rebuild) takes its windows with
 *  it, silently from the selection's point of view but never silently from
 *  the user's (the caller surfaces `droppedCount`, per decision 61/R117.5,
 *  as the Data tab's one-time notice). Pure set difference — no IPC, no
 *  knowledge of *why* a session is gone. */
export function dropDeletedSessionWindows(
  windows: readonly SelectionWindow[],
  existingSessionIds: ReadonlySet<string>,
): { windows: SelectionWindow[]; droppedCount: number } {
  const kept = windows.filter((w) => existingSessionIds.has(w.sessionId));
  return { windows: kept, droppedCount: windows.length - kept.length };
}
