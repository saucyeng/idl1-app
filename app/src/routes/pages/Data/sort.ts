import type { SessionSummary, TrackSummary } from "../../../ipc/catalog";

/** Which result-panel layout is active — mirrors idl0's `DataView`
 *  (`data_filters_provider.dart`). The Tracks table lands in a later task;
 *  this type exists now so `sortFieldsForView` has both arms. */
export type DataView = "sessions" | "tracks";

/** Sortable field shared between the Sessions and Tracks views. Some apply
 *  to only one view — `sortFieldsForView` is what the UI offers; the other
 *  fields are still accepted by the comparators below (ported from idl0's
 *  `DataSortField`) but never chosen by a viewer on that view. */
export type SortField = "date" | "bestLap" | "duration" | "lapCount" | "lastRidden" | "name";

/** Sessions-view field order. First entry is the view's default field.
 *  idl0's `sortFieldsForView` also offers `bestLap` here, but a
 *  `SessionSummary` (C3 §3.2) has no best-lap field at all — not even
 *  nullable, unlike `lapCount`/`duration` which are real nullable columns
 *  pending lap indexing (R53 Data Q4). Offering a sort option that always
 *  ties and whose direction toggle is a silent no-op is worse than not
 *  offering it, so `bestLap` is left out of this list (review-task2 Minor)
 *  until the catalog carries a best-lap field; `compareSessions` keeps its
 *  `bestLap` arm so sorting resumes correctly the moment it does. */
const SESSION_FIELDS: SortField[] = ["date", "duration", "lapCount"];

/** Tracks-view field order, ported field-for-field from idl0's
 *  `sortFieldsForView`. First entry is the view's default field. */
const TRACK_FIELDS: SortField[] = ["lastRidden", "name", "lapCount", "bestLap"];

/** Sort fields exposed for `view`, in menu order — the first entry is that
 *  view's default field (idl0's `sortFieldsForView`). */
export function sortFieldsForView(view: DataView): SortField[] {
  return view === "tracks" ? TRACK_FIELDS : SESSION_FIELDS;
}

/** The direction `field` sorts in by default (`false` = descending), ported
 *  from idl0's `DataSortFieldX.defaultAscending`. Best-lap and name read
 *  most usefully ascending (fastest lap / A→Z first); every other field
 *  defaults to descending so the "most" or "most-recent" rows lead. */
export function defaultAscendingFor(field: SortField): boolean {
  return field === "bestLap" || field === "name";
}

/** Nulls sort last regardless of `ascending` (idl0 semantics: a missing
 *  value is never "highest" or "lowest", it drops to the bottom either way).
 *  Ties return 0 — callers add their own stable tie-break. */
function compareNullableNumber(a: number | null, b: number | null, ascending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return ascending ? a - b : b - a;
}

/** Compares two rows by a numeric key that may be absent, falling back to
 *  `tieKey` (ascending, always) when the primary comparison ties — this is
 *  what keeps `compareSessions`/`compareTracks` a stable sort regardless of
 *  the input array's original order. */
function compareByNumber<T>(
  a: T,
  b: T,
  extract: (row: T) => number | null,
  ascending: boolean,
  tieKey: (row: T) => string,
): number {
  const primary = compareNullableNumber(extract(a), extract(b), ascending);
  if (primary !== 0) return primary;
  return tieKey(a).localeCompare(tieKey(b));
}

/** Compares two rows by a string key, falling back to `tieKey` on a tie. */
function compareByString<T>(
  a: T,
  b: T,
  extract: (row: T) => string,
  ascending: boolean,
  tieKey: (row: T) => string,
): number {
  const cmp = extract(a).localeCompare(extract(b));
  const primary = ascending ? cmp : -cmp;
  if (primary !== 0) return primary;
  return tieKey(a).localeCompare(tieKey(b));
}

/** `timestamp_utc_ms` as a sort key, or `null` for C1 §3.1's "0 = unknown"
 *  sentinel — an unknown date sorts last rather than as the epoch. */
function sessionDateKey(s: SessionSummary): number | null {
  return s.timestamp_utc_ms === 0 ? null : s.timestamp_utc_ms;
}

/** Sessions have no best-lap time in a `SessionSummary` at wave 2 — no
 *  wave-1 import path populates the catalog's lap tables (R53 Data Q4), so
 *  there is nothing to key on yet. Every session ties here and falls back to
 *  `session_id`, which is honest rather than fabricating a value. */
function noBestLap(): number | null {
  return null;
}

/** Compares two `SessionSummary` rows by `field` and `ascending`, ported
 *  field-for-field from idl0's sort semantics. Ties (including every field
 *  not yet backed by real data) break stably by `session_id` ascending.
 *  `lastRidden` and `name` are Tracks-view fields — `sortFieldsForView`
 *  never offers them here, so reaching this switch's default arm for them
 *  falls back to the `session_id` tie-break with no primary key. */
export function compareSessions(a: SessionSummary, b: SessionSummary, field: SortField, ascending: boolean): number {
  switch (field) {
    case "date":
      return compareByNumber(a, b, sessionDateKey, ascending, (s) => s.session_id);
    case "duration":
      return compareByNumber(a, b, (s) => s.duration_ms, ascending, (s) => s.session_id);
    case "lapCount":
      return compareByNumber(a, b, (s) => s.lap_count, ascending, (s) => s.session_id);
    case "bestLap":
      return compareByNumber(a, b, noBestLap, ascending, (s) => s.session_id);
    case "lastRidden":
    case "name":
      return a.session_id.localeCompare(b.session_id);
  }
}

/** Tracks have no best-lap time, lap count, or "last ridden" contributing-lap
 *  timestamp in a `TrackSummary` (catalog scalar columns only) at wave 2 — no
 *  wave-1 import path populates the catalog's lap tables (R53 Data Q4).
 *  Every track ties here and falls back to `track_id`. */
function noTrackValue(): number | null {
  return null;
}

/** Compares two `TrackSummary` rows by `field` and `ascending`, ported
 *  field-for-field from idl0's sort semantics. Ties (including every field
 *  not yet backed by real data) break stably by `track_id` ascending.
 *  `date` and `duration` are Sessions-view fields — `sortFieldsForView`
 *  never offers them here, so reaching this switch's default arm for them
 *  falls back to the `track_id` tie-break with no primary key. */
export function compareTracks(a: TrackSummary, b: TrackSummary, field: SortField, ascending: boolean): number {
  switch (field) {
    case "name":
      return compareByString(a, b, (t) => t.name, ascending, (t) => t.track_id);
    case "lastRidden":
    case "bestLap":
    case "lapCount":
      return compareByNumber(a, b, noTrackValue, ascending, (t) => t.track_id);
    case "date":
    case "duration":
      return a.track_id.localeCompare(b.track_id);
  }
}
