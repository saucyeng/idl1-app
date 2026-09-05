import { useEffect, useMemo, useReducer } from "react";

import { listSessions, listTracks, type SessionSummary, type TrackSummary } from "../../../ipc/catalog";
import { ActiveChips } from "./ActiveChips";
import { describeIpcError } from "./errors";
import { facetCounts, matchesFilters } from "./facets";
import { FilterRail } from "./FilterRail";
import { filtersReducer, initialFilters } from "./filters";
import { toSessionRow } from "./sessionRow";
import { compareSessions, sortFieldsForView, type SortField } from "./sort";

type State =
  | { status: "loading" }
  | { status: "ready"; sessions: SessionSummary[]; tracks: TrackSummary[] }
  | { status: "error"; text: string };

type Action =
  | { type: "loaded"; sessions: SessionSummary[]; tracks: TrackSummary[] }
  | { type: "failed"; text: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { status: "ready", sessions: action.sessions, tracks: action.tracks };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** Field labels for the sort chooser — idl0's `DataSortFieldX.label`. */
const FIELD_LABELS: Record<SortField, string> = {
  date: "Date",
  bestLap: "Best lap",
  duration: "Duration",
  lapCount: "Lap count",
  lastRidden: "Last ridden",
  name: "Name",
};

/** Data tab: the sessions result list, filter rail and active-filter chips.
 *  Loads once on mount from the catalog's `list_sessions` and `list_tracks`
 *  (C3 §3.2, in parallel — the Track facet's options come from `list_tracks`,
 *  never derived from session summaries, per the brief). Only the Sessions
 *  view exists so far — the Tracks table (and its view toggle) lands in
 *  Task 6, so the sort control here is fixed to `sortFieldsForView("sessions")`.
 *  No detail pane yet — Task 4 adds it. Filtering, sorting and facet counts
 *  are all local recomputation over the already-fetched lists — no IPC on
 *  the interaction path (CLAUDE.md §2). */
export default function Data() {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [filters, filterDispatch] = useReducer(filtersReducer, initialFilters);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listSessions(), listTracks()])
      .then(([sessions, tracks]) => {
        if (cancelled) return;
        dispatch({ type: "loaded", sessions, tracks });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sessions = state.status === "ready" ? state.sessions : [];
  const tracks = state.status === "ready" ? state.tracks : [];

  const matching = useMemo(() => sessions.filter((s) => matchesFilters(s, filters)), [sessions, filters]);

  const counts = useMemo(() => facetCounts(sessions, filters), [sessions, filters]);

  const rows = useMemo(
    () =>
      [...matching].sort((a, b) => compareSessions(a, b, filters.sortField, filters.sortAscending)).map(toSessionRow),
    [matching, filters.sortField, filters.sortAscending],
  );

  if (state.status === "loading") {
    return <p>Loading sessions…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.text}</p>;
  }

  return (
    <div className="data-tab">
      <FilterRail filters={filters} counts={counts} tracks={tracks} dispatch={filterDispatch} />
      <div className="data-results">
        <ActiveChips filters={filters} tracks={tracks} dispatch={filterDispatch} />
        <div role="toolbar" aria-label="Sort">
          <label>
            Sort by{" "}
            <select
              value={filters.sortField}
              onChange={(e) => filterDispatch({ type: "SET_SORT_FIELD", field: e.target.value as SortField })}
            >
              {sortFieldsForView("sessions").map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => filterDispatch({ type: "TOGGLE_SORT_DIRECTION" })}>
            {filters.sortAscending ? "↑" : "↓"}
          </button>
        </div>
        {rows.length === 0 ? (
          <p>{sessions.length === 0 ? "No sessions yet — import a file." : "No matches. Try clearing filters."}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Venue</th>
                <th>Rider</th>
                <th>Bike</th>
                <th>Duration</th>
                <th>Laps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sessionId}>
                  <td>{row.dateText}</td>
                  <td>{row.timeText}</td>
                  <td>{row.venueText}</td>
                  <td>{row.riderText}</td>
                  <td>{row.bikeText}</td>
                  <td>{row.durationText}</td>
                  <td>{row.lapCountText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
