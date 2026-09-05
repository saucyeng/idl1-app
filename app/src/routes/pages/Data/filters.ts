import type { SessionSummary } from "../../../ipc/catalog";
import { defaultAscendingFor, sortFieldsForView, type DataView, type SortField } from "./sort";

/** Inclusive millisecond range, shared shape for the date and lap-time
 *  facets. Both bounds are Unix epoch ms for the date facet and plain
 *  durations in ms for the lap-time facet — callers own the distinction. */
export interface MsRange {
  startMs: number;
  endMs: number;
}

/** Faceted-search state for the Data tab's Sessions/Tracks result panel,
 *  ported field-for-field from idl0's `DataFilters`
 *  (`data_filters_provider.dart`). Filters compose with AND across
 *  categories — a row matches when it passes every active facet
 *  ([[matchesFilters]] in `facets.ts`). Within a multi-select facet,
 *  matching is "any of the selected values" (logical OR). `null` / empty
 *  values mean the facet is inactive (passes through all rows). The empty
 *  string in `bikes`, `riders`, `tags` and `venues` is the synthetic
 *  "(none)" pseudo-entry, matching a row whose field is empty. Has-gates,
 *  has-GPS and Track facets from idl0 are dropped for wave 2 (R53 Data Q2,
 *  R54) — there is no `requireGates`/`requireGps`/`trackIds` field here. A
 *  `SessionSummary` carries no track linkage at all, so a Track facet could
 *  only ever exclude every row rather than actually filter — R54 rules that
 *  a facet a viewer can select but that can never match is a trap, not
 *  honesty, so it does not exist here even as a disabled placeholder. It
 *  returns once a catalog amendment gives `SessionSummary` track linkage
 *  (wave 3, same item as has-GPS/has-gates). */
export interface DataFilters {
  /** Inclusive session-timestamp range (`SessionSummary.timestamp_utc_ms`),
   *  or `null` for no date filter. */
  dateRange: MsRange | null;
  /** Active bike-name whitelist; empty = pass-through. `""` is "(none)". */
  bikes: Set<string>;
  /** Active rider-name whitelist; empty = pass-through. `""` is "(none)". */
  riders: Set<string>;
  /** Active tag whitelist; empty = pass-through. `""` is "(none)". */
  tags: Set<string>;
  /** Active venue-name whitelist; empty = pass-through. `""` is "(none)". */
  venues: Set<string>;
  /** Inclusive lap-time range in milliseconds, or `null` for no filter. At
   *  wave 2 this keys off `SessionSummary.duration_ms` (there is no
   *  per-lap time on a `SessionSummary` — R53 Data Q4: no wave-1 import
   *  path populates the catalog's lap tables). */
  lapTimeMs: MsRange | null;
  /** Active `source_format` whitelist; empty = pass-through. */
  sources: Set<SessionSummary["source_format"]>;
  /** Free-text search; matched case-insensitively as a substring across
   *  venue, comments and tag ([[matchesFilters]]). */
  searchText: string;
  /** Active result-panel view (Sessions tree vs. Tracks table). */
  view: DataView;
  /** Active sort field for `view`. */
  sortField: SortField;
  /** Sort direction (`true` = ascending). Defaults per field via
   *  `defaultAscendingFor`; the user can flip it independently. */
  sortAscending: boolean;
}

/** The Data tab's filter state at first render: every facet inactive, the
 *  Sessions view, sorted by the Sessions view's default field in its
 *  default direction. */
export const initialFilters: DataFilters = {
  dateRange: null,
  bikes: new Set(),
  riders: new Set(),
  tags: new Set(),
  venues: new Set(),
  lapTimeMs: null,
  sources: new Set(),
  searchText: "",
  view: "sessions",
  sortField: sortFieldsForView("sessions")[0],
  sortAscending: defaultAscendingFor(sortFieldsForView("sessions")[0]),
};

/** State-changing gestures the filter rail, chip row, search box, view
 *  toggle and sort control dispatch — ported one-for-one from idl0's
 *  `DataFiltersNotifier` methods. */
export type FilterAction =
  | { type: "SET_DATE_RANGE"; range: MsRange | null }
  | { type: "TOGGLE_BIKE"; bike: string }
  | { type: "TOGGLE_RIDER"; rider: string }
  | { type: "TOGGLE_TAG"; tag: string }
  | { type: "TOGGLE_VENUE"; venue: string }
  | { type: "TOGGLE_SOURCE"; source: SessionSummary["source_format"] }
  | { type: "SET_LAP_TIME_RANGE"; range: MsRange | null }
  | { type: "SET_SEARCH_TEXT"; text: string }
  | { type: "SET_VIEW"; view: DataView }
  | { type: "SET_SORT_FIELD"; field: SortField }
  | { type: "TOGGLE_SORT_DIRECTION" }
  | { type: "CLEAR_ALL" };

/** Adds `value` to `set` if absent, removes it if present — the multi-select
 *  facet toggle idl0 shares across Bike/Rider/Tag/Venue. Returns a new
 *  `Set`; never mutates `set`. */
function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** `requested` if `view` offers it, else that view's default (first) field —
 *  idl0's `DataFiltersNotifier._validFieldFor`, used by `SET_VIEW` so
 *  switching view never leaves an invalid field selected. */
function validFieldFor(view: DataView, requested: SortField): SortField {
  const allowed = sortFieldsForView(view);
  return allowed.includes(requested) ? requested : allowed[0];
}

/** Pure reducer over [[DataFilters]] — every facet toggle/set/clear the
 *  filter rail, chip row, search box, view toggle and sort control can
 *  dispatch. Ported from idl0's `DataFiltersNotifier`. */
export function filtersReducer(state: DataFilters, action: FilterAction): DataFilters {
  switch (action.type) {
    case "SET_DATE_RANGE":
      return { ...state, dateRange: action.range };
    case "TOGGLE_BIKE":
      return { ...state, bikes: toggled(state.bikes, action.bike) };
    case "TOGGLE_RIDER":
      return { ...state, riders: toggled(state.riders, action.rider) };
    case "TOGGLE_TAG":
      return { ...state, tags: toggled(state.tags, action.tag) };
    case "TOGGLE_VENUE":
      return { ...state, venues: toggled(state.venues, action.venue) };
    case "TOGGLE_SOURCE":
      return { ...state, sources: toggled(state.sources, action.source) };
    case "SET_LAP_TIME_RANGE":
      return { ...state, lapTimeMs: action.range };
    case "SET_SEARCH_TEXT":
      return { ...state, searchText: action.text };
    case "SET_VIEW": {
      if (action.view === state.view) return state;
      const field = validFieldFor(action.view, state.sortField);
      const sortAscending = field === state.sortField ? state.sortAscending : defaultAscendingFor(field);
      return { ...state, view: action.view, sortField: field, sortAscending };
    }
    case "SET_SORT_FIELD":
      return { ...state, sortField: action.field, sortAscending: defaultAscendingFor(action.field) };
    case "TOGGLE_SORT_DIRECTION":
      return { ...state, sortAscending: !state.sortAscending };
    case "CLEAR_ALL":
      return { ...initialFilters, view: state.view, sortField: state.sortField, sortAscending: state.sortAscending };
  }
}

/** `true` when at least one row-affecting facet is active — excludes `view`
 *  and sort (those reorder, never filter). idl0's `DataFilters.hasAnyActiveFilter`. */
export function hasAnyActiveFilter(filters: DataFilters): boolean {
  return activeCount(filters) > 0;
}

/** Count of active row-affecting facets, ignoring `view` and sort — drives
 *  the narrow-layout "FILTERS (n)" bar badge. idl0's `DataFilters.activeCount`. */
export function activeCount(filters: DataFilters): number {
  let n = 0;
  if (filters.dateRange !== null) n++;
  if (filters.bikes.size > 0) n++;
  if (filters.riders.size > 0) n++;
  if (filters.tags.size > 0) n++;
  if (filters.venues.size > 0) n++;
  if (filters.lapTimeMs !== null) n++;
  if (filters.sources.size > 0) n++;
  if (filters.searchText.length > 0) n++;
  return n;
}
