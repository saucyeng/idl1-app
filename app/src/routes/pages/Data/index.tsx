import { useCallback, useEffect, useMemo, useReducer } from "react";

import { getSession, listLaps, listSessions, rebuildCatalog, type LapSummary, type SessionDetail, type SessionSummary } from "../../../ipc/catalog";
import { useAppState } from "../../../state/AppState";
import { ActiveChips } from "./ActiveChips";
import { DetailPane } from "./DetailPane";
import { describeIpcError } from "./errors";
import { facetCounts, matchesFilters } from "./facets";
import { FilterRail } from "./FilterRail";
import { filtersReducer, initialFilters } from "./filters";
import { ImportPanel } from "./ImportPanel";
import { deleteSession, listQuarantine } from "./ipcStubs";
import {
  initialMaintenanceState,
  maintenanceReducer,
  runDeleteSession,
  runForgetSession,
  runListQuarantine,
  runRebuildCatalog,
  startMaintenanceAction,
} from "./maintenance";
import { toDetailView } from "./sessionDetail";
import { toSessionRow } from "./sessionRow";
import { compareSessions, sortFieldsForView, type SortField } from "./sort";
import { TrackResults } from "./TrackResults";

/** The session detail pane's own fetch state — separate from the sessions
 *  list's `State` above, and from `AppState.selection` (which only tracks
 *  *which* session id is selected, not the fetch in flight for it). */
type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; detail: SessionDetail; laps: LapSummary[]; lapsErrorText: string | null }
  | { status: "error"; text: string };

type DetailAction =
  | { type: "detail-loading" }
  | { type: "detail-ready"; detail: SessionDetail; laps: LapSummary[]; lapsErrorText: string | null }
  | { type: "detail-failed"; text: string }
  | { type: "detail-closed" };

function detailReducer(_state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case "detail-loading":
      return { status: "loading" };
    case "detail-ready":
      return { status: "ready", detail: action.detail, laps: action.laps, lapsErrorText: action.lapsErrorText };
    case "detail-failed":
      return { status: "error", text: action.text };
    case "detail-closed":
      return { status: "idle" };
  }
}

type State =
  | { status: "loading" }
  | { status: "ready"; sessions: SessionSummary[] }
  | { status: "error"; text: string };

type Action =
  | { type: "loaded"; sessions: SessionSummary[] }
  | { type: "failed"; text: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { status: "ready", sessions: action.sessions };
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

/** Data tab: the sessions result list, filter rail and active-filter chips,
 *  plus the Tracks table (Task 6) behind a view toggle. Sessions loads once
 *  on mount from the catalog's `list_sessions` (C3 §3.2); Tracks
 *  (`TrackResults`) owns its own `list_tracks` fetch. Facets, filtering and
 *  the filter rail apply to the Sessions view only — no Track facet at
 *  wave 2 (R53 Data Q2/R54): a `SessionSummary` carries no track linkage,
 *  so a Tracks-view facet over sessions data would be a trap, not a filter.
 *  Filtering, sorting and facet counts are all local recomputation over the
 *  already-fetched list — no IPC on the interaction path (CLAUDE.md §2). */
export default function Data() {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [filters, filterDispatch] = useReducer(filtersReducer, initialFilters);
  const [detailState, detailDispatch] = useReducer(detailReducer, { status: "idle" });
  const [maintenanceState, maintenanceDispatch] = useReducer(maintenanceReducer, initialMaintenanceState);
  const [appState, appDispatch] = useAppState();
  const selectedSessionId = appState.selection.sessionId;

  /** Fetches `list_sessions` and applies the result, ignoring a stale
   *  response if the caller has already unmounted/moved on. Used on mount
   *  and as `ImportPanel`'s `onImported` refresh (settle-bound: once per
   *  queue drain, never per file — CLAUDE.md §2). */
  const loadSessions = useCallback((isCancelled: () => boolean) => {
    listSessions()
      .then((sessions) => {
        if (isCancelled()) return;
        dispatch({ type: "loaded", sessions });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSessions(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const handleImported = useCallback(() => {
    loadSessions(() => false);
  }, [loadSessions]);

  /** Toolbar's "Rebuild catalog" — the one real maintenance action
   *  (IPC-driving click delegates to [[startMaintenanceAction]], the pure
   *  driver — operating brief §4's rule). Refreshes the sessions list on
   *  success, since a rebuild can surface sessions this render never saw. */
  const handleRebuildCatalog = () => {
    startMaintenanceAction(maintenanceState, "rebuild_catalog", runRebuildCatalog(rebuildCatalog), (a) => {
      maintenanceDispatch(a);
      if (a.type === "SUCCEEDED") loadSessions(() => false);
    });
  };

  /** Toolbar's "Delete session" (IPC need 3, stubbed) — idl0's blob-deleting
   *  variant. Confirmed first: it is destructive the moment `delete_session`
   *  lands, so the confirmation is built now rather than added later
   *  alongside the real wiring (this task's brief). */
  const handleDeleteSession = () => {
    if (selectedSessionId === null) return;
    if (!window.confirm("Delete this session and its source file? This cannot be undone.")) return;
    startMaintenanceAction(maintenanceState, "delete_session", runDeleteSession(deleteSession, selectedSessionId, true), maintenanceDispatch);
  };

  /** Toolbar's "Forget session" (IPC need 3, stubbed) — idl0's
   *  non-blob-deleting variant, mapped onto the same `deleteSession` stub
   *  with `deleteBlob: false` rather than a fourth stub function. */
  const handleForgetSession = () => {
    if (selectedSessionId === null) return;
    if (!window.confirm("Remove this session from the catalog? Its source file is kept.")) return;
    startMaintenanceAction(maintenanceState, "forget_session", runForgetSession(deleteSession, selectedSessionId), maintenanceDispatch);
  };

  /** Toolbar's "Review quarantine" (IPC need 4, stubbed). Confirmed first,
   *  same reasoning as [[handleDeleteSession]]. */
  const handleReviewQuarantine = () => {
    if (!window.confirm("Review quarantined files?")) return;
    startMaintenanceAction(maintenanceState, "list_quarantine", runListQuarantine(listQuarantine), maintenanceDispatch);
  };

  /** Fetches `get_session` + `list_laps` in parallel on selection settle
   *  (R53 Data Q3; C3 §4: both are settle-bound, never a hover/pan/zoom
   *  handler). A `list_laps` rejection with kind `not_found` is not an
   *  error for this pane (R53 Q4: laps aren't indexed for most sessions at
   *  wave 2) — it renders as an empty lap table, not a banner. */
  useEffect(() => {
    if (selectedSessionId === null) {
      detailDispatch({ type: "detail-closed" });
      return;
    }

    let cancelled = false;
    detailDispatch({ type: "detail-loading" });

    const lapsAttempt: Promise<{ laps: LapSummary[]; errorText: string | null }> = listLaps(selectedSessionId)
      .then((laps) => ({ laps, errorText: null }))
      .catch((e: unknown) => {
        const described = describeIpcError(e);
        return { laps: [], errorText: described.kind === "not_found" ? null : described.text };
      });

    Promise.all([getSession(selectedSessionId), lapsAttempt])
      .then(([detail, lapsResult]) => {
        if (cancelled) return;
        detailDispatch({ type: "detail-ready", detail, laps: lapsResult.laps, lapsErrorText: lapsResult.errorText });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        detailDispatch({ type: "detail-failed", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const sessions = state.status === "ready" ? state.sessions : [];

  const matching = useMemo(() => sessions.filter((s) => matchesFilters(s, filters)), [sessions, filters]);

  const counts = useMemo(() => facetCounts(sessions, filters), [sessions, filters]);

  const rows = useMemo(
    () =>
      [...matching].sort((a, b) => compareSessions(a, b, filters.sortField, filters.sortAscending)).map(toSessionRow),
    [matching, filters.sortField, filters.sortAscending],
  );

  const detailView = useMemo(
    () => (detailState.status === "ready" ? toDetailView(detailState.detail, detailState.laps) : null),
    [detailState],
  );

  /** Row selection (R53 Data Q3): dispatches into `AppState.selection` so
   *  the notebook can read the chosen session later. Never dispatches
   *  `SET_LAP_CONTEXT` — no lap UI in this task picks a main/overlay lap
   *  (deferred to L6, per the Data lane brief's Parity gaps). */
  const selectSession = (sessionId: string) => {
    appDispatch({ type: "SET_SELECTED_SESSION", sessionId });
  };

  const closeDetail = () => {
    appDispatch({ type: "SET_SELECTED_SESSION", sessionId: null });
  };

  if (state.status === "loading") {
    return <p>Loading sessions…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.text}</p>;
  }

  return (
    <div className="data-tab">
      {filters.view === "sessions" && <FilterRail filters={filters} counts={counts} dispatch={filterDispatch} />}
      <div className="data-results">
        <div role="toolbar" aria-label="Import">
          <ImportPanel onImported={handleImported} />
        </div>
        <div role="toolbar" aria-label="Maintenance">
          <button type="button" onClick={handleRebuildCatalog} disabled={maintenanceState.status === "running"}>
            Rebuild catalog
          </button>
          <button
            type="button"
            onClick={handleDeleteSession}
            disabled={selectedSessionId === null || maintenanceState.status === "running"}
          >
            Delete session
          </button>
          <button
            type="button"
            onClick={handleForgetSession}
            disabled={selectedSessionId === null || maintenanceState.status === "running"}
          >
            Forget session
          </button>
          <button type="button" onClick={handleReviewQuarantine} disabled={maintenanceState.status === "running"}>
            Review quarantine
          </button>
          {maintenanceState.status === "running" && <p>Running {maintenanceState.action}…</p>}
          {maintenanceState.status === "done" && <p>{maintenanceState.result}</p>}
          {maintenanceState.status === "failed" && <p role="alert">{maintenanceState.error}</p>}
        </div>
        <div role="toolbar" aria-label="View">
          <button
            type="button"
            aria-pressed={filters.view === "sessions"}
            onClick={() => filterDispatch({ type: "SET_VIEW", view: "sessions" })}
          >
            Sessions
          </button>
          <button
            type="button"
            aria-pressed={filters.view === "tracks"}
            onClick={() => filterDispatch({ type: "SET_VIEW", view: "tracks" })}
          >
            Tracks
          </button>
        </div>
        {filters.view === "sessions" && <ActiveChips filters={filters} dispatch={filterDispatch} />}
        <div role="toolbar" aria-label="Sort">
          <label>
            Sort by{" "}
            <select
              value={filters.sortField}
              onChange={(e) => filterDispatch({ type: "SET_SORT_FIELD", field: e.target.value as SortField })}
            >
              {sortFieldsForView(filters.view).map((field) => (
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
        {filters.view === "tracks" ? (
          <TrackResults sortField={filters.sortField} sortAscending={filters.sortAscending} />
        ) : rows.length === 0 ? (
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
                <tr
                  key={row.sessionId}
                  tabIndex={0}
                  aria-selected={row.sessionId === selectedSessionId}
                  onClick={() => selectSession(row.sessionId)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    selectSession(row.sessionId);
                  }}
                >
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
        {filters.view === "sessions" && selectedSessionId !== null && (
          <div className="data-detail">
            {detailState.status === "loading" && <p>Loading session…</p>}
            {detailState.status === "error" && <p role="alert">{detailState.text}</p>}
            {detailState.status === "ready" && detailView !== null && (
              <DetailPane
                view={detailView}
                detail={detailState.detail}
                lapsErrorText={detailState.lapsErrorText}
                onClose={closeDetail}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
