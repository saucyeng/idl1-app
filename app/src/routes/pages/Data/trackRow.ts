import type { SessionSummary, TrackSummary, TrackVisitSummary } from "../../../ipc/catalog";
import { formatDateMs } from "./format";
import { venueLabel } from "./sessionRow";

/** One row in the tracks result list — a pure display derivation of one
 *  `TrackSummary` (C3 §3.2). Holds no engine truth: every field here came
 *  from the catalog, formatted for the screen only. */
export interface TrackRow {
  trackId: string;
  name: string;
  /** `venue_name`, or "(none)" when empty — the same synthetic label the
   *  session list uses ([[sessionRow.ts]]'s `venueLabel`). */
  venueText: string;
  /** `created_at_ms` rendered in the viewer's locale. */
  createdText: string;
  /** `updated_at_ms` rendered in the viewer's locale. */
  updatedText: string;
}

/** Derives a display row from one catalog `TrackSummary` (C3 §3.2). Pure
 *  formatting only — no IPC, no engine computation. */
export function toTrackRow(summary: TrackSummary): TrackRow {
  return {
    trackId: summary.track_id,
    name: summary.name,
    venueText: venueLabel(summary.venue_name),
    createdText: formatDateMs(summary.created_at_ms),
    updatedText: formatDateMs(summary.updated_at_ms),
  };
}

/** idl0's `SessionRow.displayVenueName` rule (`data_results_provider.dart`):
 *  the session's own `venue_name` when non-empty; otherwise the first
 *  non-empty `venue_name` among the session's track visits, walked in visit
 *  order. A visit whose `track_id` does not resolve in `tracksById` is
 *  skipped rather than stopping the search there (idl0 §12.3's
 *  skip-on-resolve rule — a stale visit must not hide a later, valid one).
 *  Returns `""` (rendered as "(none)" by [[venueLabel]]) when neither the
 *  session nor any resolvable visited track carries a venue. */
export function resolveDisplayVenue(
  session: SessionSummary,
  visits: TrackVisitSummary[],
  tracksById: Map<string, TrackSummary>,
): string {
  if (session.venue_name !== "") return session.venue_name;

  for (const visit of visits) {
    const track = tracksById.get(visit.track_id);
    if (track === undefined) continue;
    if (track.venue_name !== "") return track.venue_name;
  }

  return "";
}
