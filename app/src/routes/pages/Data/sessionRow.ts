import type { SessionSummary } from "../../../ipc/catalog";
import { formatDateMs, formatDurationMs, formatTimeMs, localIsoDate } from "./format";

/** Synthetic label for an empty `venue_name`, shared with the venue facet
 *  (Task 3) so a filtered row and its chip always agree. */
const NONE_VENUE = "(none)";

/** Synthetic label for a `timestamp_utc_ms` of 0 (C1 §3.1: 0 means
 *  "unknown", never rendered as the 1970 epoch). */
const UNKNOWN_DATE = "unknown";

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
  const venueText = s.venue_name === "" ? NONE_VENUE : s.venue_name;
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
