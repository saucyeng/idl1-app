import type { SessionSummary } from "../../../ipc/catalog";
import type { DataFilters } from "./filters";
import { localIsoDate } from "./format";

/** A `SessionSummary` field this module facets/filters over, sans `view` and
 *  sort (those reorder, never filter) — matches `DataFilters`'s
 *  row-affecting keys one-for-one. */
type FacetKey = "dateRange" | "bikes" | "riders" | "tags" | "venues" | "lapTimeMs" | "sources";

/** `true` when `row`'s date falls within `range`, inclusive of the range's
 *  own last calendar day regardless of time-of-day — compares local
 *  (viewer time zone) ISO dates, not raw millisecond boundaries, so a
 *  session at 5 pm on the range's last day still matches a range whose
 *  `endMs` is that same day's midnight (idl0's `DateTimeRange` is
 *  day-granular, not a precise instant). */
function matchesDateRange(timestampUtcMs: number, range: { startMs: number; endMs: number }): boolean {
  const day = localIsoDate(timestampUtcMs);
  return day >= localIsoDate(range.startMs) && day <= localIsoDate(range.endMs);
}

/** `true` when `value` matches an active whitelist facet, OR-within-facet:
 *  an empty `selected` set means the facet is inactive (passes through every
 *  row); `""` is the synthetic "(none)" entry, matching a row whose field is
 *  the empty string. */
function matchesStringFacet(value: string, selected: ReadonlySet<string>): boolean {
  return selected.size === 0 || selected.has(value);
}

/** `true` when `row` passes every active facet in `filters` except `skip` —
 *  `skip`'s own facet is not applied, so its own selections don't shrink the
 *  set a caller is about to tally per-option counts against ([[facetCounts]]:
 *  "counts each option against the other facets, not against its own").
 *  There is no Track facet here (R54, R53 Data Q2): a `SessionSummary`
 *  carries no track linkage, so a Track facet could only ever exclude every
 *  row — a facet a viewer can select but that can never match is a trap,
 *  not honesty, so `DataFilters` has no `trackIds` field to check. */
function matchesFiltersExcept(row: SessionSummary, filters: DataFilters, skip?: FacetKey): boolean {
  if (skip !== "dateRange" && filters.dateRange !== null && !matchesDateRange(row.timestamp_utc_ms, filters.dateRange)) {
    return false;
  }
  if (skip !== "bikes" && !matchesStringFacet(row.bike, filters.bikes)) return false;
  if (skip !== "riders" && !matchesStringFacet(row.rider, filters.riders)) return false;
  if (skip !== "tags" && !matchesStringFacet(row.tag, filters.tags)) return false;
  if (skip !== "venues" && !matchesStringFacet(row.venue_name, filters.venues)) return false;
  if (skip !== "lapTimeMs" && filters.lapTimeMs !== null) {
    if (row.duration_ms === null) return false;
    if (row.duration_ms < filters.lapTimeMs.startMs || row.duration_ms > filters.lapTimeMs.endMs) return false;
  }
  if (skip !== "sources" && !matchesStringFacet(row.source_format, filters.sources)) return false;
  return true;
}

/** `true` when `row`'s free text (venue, short comment, tag) contains
 *  `searchText` as a case-insensitive substring; an empty `searchText`
 *  always matches. */
function matchesSearchText(row: SessionSummary, searchText: string): boolean {
  if (searchText.length === 0) return true;
  const needle = searchText.toLowerCase();
  const haystack = `${row.venue_name} ${row.short_comment} ${row.tag}`.toLowerCase();
  return haystack.includes(needle);
}

/** `true` when `row` passes every active facet in `filters` (AND across
 *  categories) and the free-text search. Ported from idl0's
 *  `filteredSessionRowsProvider` facet predicate. */
export function matchesFilters(row: SessionSummary, filters: DataFilters): boolean {
  return matchesFiltersExcept(row, filters) && matchesSearchText(row, filters.searchText);
}

/** Per-facet option counts for the filter rail's `(N)` badges. Each facet's
 *  counts are computed against every *other* active facet — never its own —
 *  so selecting one bike still shows the other bikes' full counts rather
 *  than collapsing them to zero (idl0's `facetCountsProvider`). Free-text
 *  search applies to every facet's count (it is not itself a facet a
 *  category can "exclude"). No `trackIds` map — there is no Track facet at
 *  wave 2 (R54). */
export interface FacetCounts {
  bikes: Map<string, number>;
  riders: Map<string, number>;
  tags: Map<string, number>;
  venues: Map<string, number>;
  sources: Map<SessionSummary["source_format"], number>;
}

/** Tallies `extract(row)` for every `rows` entry that passes every filter
 *  except `key`'s own facet and the free-text search. */
function tally<T>(rows: readonly SessionSummary[], filters: DataFilters, key: FacetKey, extract: (row: SessionSummary) => T): Map<T, number> {
  const counts = new Map<T, number>();
  for (const row of rows) {
    if (!matchesFiltersExcept(row, filters, key) || !matchesSearchText(row, filters.searchText)) continue;
    const value = extract(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Computes [[FacetCounts]] for `rows` under `filters`. */
export function facetCounts(rows: readonly SessionSummary[], filters: DataFilters): FacetCounts {
  return {
    bikes: tally(rows, filters, "bikes", (r) => r.bike),
    riders: tally(rows, filters, "riders", (r) => r.rider),
    tags: tally(rows, filters, "tags", (r) => r.tag),
    venues: tally(rows, filters, "venues", (r) => r.venue_name),
    sources: tally(rows, filters, "sources", (r) => r.source_format),
  };
}
