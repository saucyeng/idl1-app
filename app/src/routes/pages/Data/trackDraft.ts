import type { TrackDetail, TrackDraft } from "../../../ipc/catalog";

/** The Data tab's editable track fields — name and venue only. The
 *  lap-timing geometry (`lap_timing`/`sector_gates`/`neutral_zones`/
 *  `reference_polyline`) has no editor here: the map-based gate placement
 *  UI stays wave 3 (ruling R54). */
export interface TrackNameVenueDraft {
  name: string;
  venue_name: string;
}

/** Builds the name/venue form's starting draft from one `get_track`
 *  result (C3 §3.2). */
export function initialTrackDraft(detail: TrackDetail): TrackNameVenueDraft {
  return { name: detail.name, venue_name: detail.venue_name };
}

/** Trims both fields. `""` is a valid `venue_name` (idl0 leaves it blank
 *  often); `name` trimmed to `""` fails `save_track`'s own validation
 *  (C3 §3.2: "non-empty trimmed name") — this module does not duplicate
 *  that check, it only normalises whitespace before the IPC call makes it. */
export function normalizeTrackDraft(draft: TrackNameVenueDraft): TrackNameVenueDraft {
  return { name: draft.name.trim(), venue_name: draft.venue_name.trim() };
}

/** True iff `draft`, after normalisation, differs from `detail`'s current
 *  name/venue — i.e. there is something to save. Whitespace-only edits
 *  normalise away and do not count as dirty. */
export function isTrackDraftDirty(draft: TrackNameVenueDraft, detail: TrackDetail): boolean {
  const normalized = normalizeTrackDraft(draft);
  return normalized.name !== detail.name || normalized.venue_name !== detail.venue_name;
}

/** Builds `save_track`'s (C3 §3.2, ruling R86) argument for an edit: the
 *  existing track's id and every geometry field carried through verbatim,
 *  with only `name`/`venue_name` replaced by the (already normalised)
 *  draft. Never touches `lap_timing`/`sector_gates`/`neutral_zones`/
 *  `reference_polyline` — this pane has no editor for them (R54). */
export function toTrackSaveDraft(detail: TrackDetail, draft: TrackNameVenueDraft): TrackDraft {
  return {
    track_id: detail.track_id,
    name: draft.name,
    venue_name: draft.venue_name,
    lap_timing: detail.lap_timing,
    neutral_zones: detail.neutral_zones,
    sector_gates: detail.sector_gates,
    reference_polyline: detail.reference_polyline,
  };
}
