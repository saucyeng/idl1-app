import { useEffect, useReducer } from "react";

import { listSessions } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { toSessionRow, type SessionRow } from "./sessionRow";

type State =
  | { status: "loading" }
  | { status: "ready"; rows: SessionRow[] }
  | { status: "error"; text: string };

type Action =
  | { type: "loaded"; rows: SessionRow[] }
  | { type: "failed"; text: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { status: "ready", rows: action.rows };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** Data tab: the sessions result list. Loads once on mount from the
 *  catalog's `list_sessions` (C3 §3.2), no filter rail or detail pane yet —
 *  Tasks 2–4 add those. */
export default function Data() {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });

  useEffect(() => {
    let cancelled = false;

    listSessions()
      .then((summaries) => {
        if (cancelled) return;
        dispatch({ type: "loaded", rows: summaries.map(toSessionRow) });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p>Loading sessions…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.text}</p>;
  }

  if (state.rows.length === 0) {
    return <p>No sessions yet — import a file.</p>;
  }

  return (
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
        {state.rows.map((row) => (
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
  );
}
