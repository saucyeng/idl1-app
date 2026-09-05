import { useEffect, useMemo, useReducer, useState } from "react";

import { listSessions, type SessionSummary } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { toSessionRow } from "./sessionRow";
import { compareSessions, defaultAscendingFor, sortFieldsForView, type SortField } from "./sort";

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

/** Data tab: the sessions result list. Loads once on mount from the
 *  catalog's `list_sessions` (C3 §3.2). Only the Sessions view exists so
 *  far — the Tracks table (and its view toggle) lands in Task 6, so the sort
 *  control here is fixed to `sortFieldsForView("sessions")`. No filter rail
 *  or detail pane yet — Tasks 3–4 add those. */
export default function Data() {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAscending, setSortAscending] = useState(defaultAscendingFor("date"));

  useEffect(() => {
    let cancelled = false;

    listSessions()
      .then((sessions) => {
        if (cancelled) return;
        dispatch({ type: "loaded", sessions });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    return [...state.sessions]
      .sort((a, b) => compareSessions(a, b, sortField, sortAscending))
      .map(toSessionRow);
  }, [state, sortField, sortAscending]);

  /** Selecting a field resets direction to that field's default; the arrow
   *  toggle then overrides it independently (idl0's `_SortControl`). */
  function handleFieldChange(field: SortField) {
    setSortField(field);
    setSortAscending(defaultAscendingFor(field));
  }

  if (state.status === "loading") {
    return <p>Loading sessions…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.text}</p>;
  }

  return (
    <div>
      <div role="toolbar" aria-label="Sort">
        <label>
          Sort by{" "}
          <select
            value={sortField}
            onChange={(e) => handleFieldChange(e.target.value as SortField)}
          >
            {sortFieldsForView("sessions").map((field) => (
              <option key={field} value={field}>
                {FIELD_LABELS[field]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setSortAscending((v) => !v)}>
          {sortAscending ? "↑" : "↓"}
        </button>
      </div>
      {rows.length === 0 ? (
        <p>No sessions yet — import a file.</p>
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
  );
}
