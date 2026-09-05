import type { SessionDetail, SessionSummary, TrackSummary } from "../../../ipc/catalog";
import { resolveDisplayVenue } from "./trackRow";

/** The Data tab's editable session-metadata draft — exactly C1 §6's nine
 *  `session.json` metadata fields (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`
 *  need 1's `SessionMetadataPatch`, field for field). `""` is the only
 *  "not set" representation for any of them; there is no null. */
export interface MetadataDraft {
  rider: string;
  bike: string;
  bike_comment: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  tag: string;
  short_comment: string;
  long_comment: string;
}

/** The nine-field save payload `save_session_metadata` (IPC need 1) takes,
 *  plus the `session_id` it is scoped to. This is a whole-block replace —
 *  every field is required so a concurrent editor cannot half-apply a
 *  save (IPC-NEEDS.md need 1). */
export interface SessionMetadataSavePayload extends MetadataDraft {
  session_id: string;
}

/** Adapts a `SessionDetail` into the `SessionSummary` shape
 *  [[resolveDisplayVenue]] (`trackRow.ts`, Task 6) expects, so this module
 *  reuses that function rather than redefining its venue-fallback rule.
 *  `resolveDisplayVenue` reads only `venue_name` off its `session`
 *  parameter — every field `SessionDetail` does not carry is filled with a
 *  harmless placeholder that is never read. */
function toVenueLookupSession(detail: SessionDetail): SessionSummary {
  return {
    session_id: detail.session_id,
    blob_sha256: detail.blob_sha256,
    source_format: detail.source_format,
    device_id: detail.device_id,
    config_checksum: detail.config_checksum,
    importer_version: "",
    seam_correction_version: "",
    engine_version: "",
    timestamp_utc_ms: detail.timestamp_utc_ms,
    created_at_ms: 0,
    rider: detail.rider,
    bike: detail.bike,
    venue_name: detail.venue_name,
    event_name: detail.event_name,
    event_session: detail.event_session,
    short_comment: detail.short_comment,
    tag: detail.tag,
    lap_count: null,
    duration_ms: null,
  };
}

/** Builds the metadata form's starting draft from one `get_session` result
 *  (C3 §3.2) and the full track list (C3 §3.2 `list_tracks`). `venue_name`
 *  is pre-filled from [[resolveDisplayVenue]] (idl0 §24.10's rule) rather
 *  than copied verbatim from `detail.venue_name`, so saving the form
 *  persists the venue the card already shows — including a venue resolved
 *  from a visited track — instead of leaving the session's own field
 *  blank. */
export function initialDraft(detail: SessionDetail, tracks: TrackSummary[]): MetadataDraft {
  const tracksById = new Map(tracks.map((t) => [t.track_id, t]));
  const venueName = resolveDisplayVenue(toVenueLookupSession(detail), detail.track_visits, tracksById);

  return {
    rider: detail.rider,
    bike: detail.bike,
    bike_comment: detail.bike_comment,
    venue_name: venueName,
    event_name: detail.event_name,
    event_session: detail.event_session,
    tag: detail.tag,
    short_comment: detail.short_comment,
    long_comment: detail.long_comment,
  };
}

/** Trims every field of a draft. `""` is the only "not set" representation
 *  C1 §6 recognises for these fields — trimming a field down to nothing
 *  yields `""`, never `null`. */
export function normalizeDraft(draft: MetadataDraft): MetadataDraft {
  return {
    rider: draft.rider.trim(),
    bike: draft.bike.trim(),
    bike_comment: draft.bike_comment.trim(),
    venue_name: draft.venue_name.trim(),
    event_name: draft.event_name.trim(),
    event_session: draft.event_session.trim(),
    tag: draft.tag.trim(),
    short_comment: draft.short_comment.trim(),
    long_comment: draft.long_comment.trim(),
  };
}

/** True iff `draft`, after normalisation, differs in any of the nine
 *  fields from `detail`'s own current values — i.e. there is something to
 *  save. Whitespace-only edits normalise away and do not count as dirty. */
export function isDirty(draft: MetadataDraft, detail: SessionDetail): boolean {
  const normalized = normalizeDraft(draft);
  const baseline = normalizeDraft({
    rider: detail.rider,
    bike: detail.bike,
    bike_comment: detail.bike_comment,
    venue_name: detail.venue_name,
    event_name: detail.event_name,
    event_session: detail.event_session,
    tag: detail.tag,
    short_comment: detail.short_comment,
    long_comment: detail.long_comment,
  });

  return (Object.keys(normalized) as (keyof MetadataDraft)[]).some((key) => normalized[key] !== baseline[key]);
}

/** The Venue autocomplete's suggestion list: every distinct, non-empty
 *  `TrackSummary.venue_name`, sorted ascending. Mirrors idl0 §24.10's
 *  `distinct Track.venueName` sourcing (the `SessionMetadata.venueName`
 *  half of that union is not available to this pure function — the caller
 *  may add the currently-loaded sessions' venues separately if needed). */
export function venueOptions(tracks: TrackSummary[]): string[] {
  const venues = new Set<string>();
  for (const track of tracks) {
    if (track.venue_name !== "") venues.add(track.venue_name);
  }
  return [...venues].sort((a, b) => a.localeCompare(b));
}

/** Builds `save_session_metadata`'s (IPC need 1) argument from a
 *  normalised draft — exactly the nine C1 §6 fields plus `session_id`,
 *  nothing else. Callers normalise the draft first ([[normalizeDraft]]);
 *  this function does not re-trim. */
export function toSavePayload(sessionId: string, draft: MetadataDraft): SessionMetadataSavePayload {
  return {
    session_id: sessionId,
    rider: draft.rider,
    bike: draft.bike,
    bike_comment: draft.bike_comment,
    venue_name: draft.venue_name,
    event_name: draft.event_name,
    event_session: draft.event_session,
    tag: draft.tag,
    short_comment: draft.short_comment,
    long_comment: draft.long_comment,
  };
}
