import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { listTracks, type TrackSummary } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { compareTracks, type SortField } from "./sort";
import { toTrackRow } from "./trackRow";
import { TrackDetailPane } from "./TrackDetailPane";

/** Props for [[TrackResults]]. */
interface TrackResultsProps {
  sortField: SortField;
  sortAscending: boolean;
}

type State =
  | { status: "loading" }
  | { status: "ready"; tracks: TrackSummary[] }
  | { status: "error"; text: string };

type Action = { type: "loaded"; tracks: TrackSummary[] } | { type: "failed"; text: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { status: "ready", tracks: action.tracks };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** The Data tab's tracks result table, over `list_tracks` (C3 §3.2). Loads
 *  once on mount, flat and unfiltered — R53 Data Q2/R54 drop any facet or
 *  session-linkage view over tracks at wave 2. Row selection opens
 *  [[TrackDetailPane]] on explicit click, settle-bound (`get_track`,
 *  C3 §4) — never on hover. Sorting is local recomputation over the
 *  already-fetched list, driven by `sortField`/`sortAscending` from the
 *  shared sort control in `index.tsx` (`sortFieldsForView("tracks")`). */
export function TrackResults({ sortField, sortAscending }: TrackResultsProps) {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const loadTracks = useCallback((isCancelled: () => boolean) => {
    listTracks()
      .then((tracks) => {
        if (isCancelled()) return;
        dispatch({ type: "loaded", tracks });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTracks(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadTracks]);

  const tracks = state.status === "ready" ? state.tracks : [];

  const rows = useMemo(
    () => [...tracks].sort((a, b) => compareTracks(a, b, sortField, sortAscending)).map(toTrackRow),
    [tracks, sortField, sortAscending],
  );

  if (state.status === "loading") {
    return <p>Loading tracks…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.text}</p>;
  }

  return (
    <div className="data-tracks">
      {rows.length === 0 ? (
        <p>No tracks yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Venue</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.trackId}
                tabIndex={0}
                aria-selected={row.trackId === selectedTrackId}
                onClick={() => setSelectedTrackId(row.trackId)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  setSelectedTrackId(row.trackId);
                }}
              >
                <td>{row.name}</td>
                <td>{row.venueText}</td>
                <td>{row.createdText}</td>
                <td>{row.updatedText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedTrackId !== null && (
        <div className="data-detail">
          <TrackDetailPane trackId={selectedTrackId} onClose={() => setSelectedTrackId(null)} />
        </div>
      )}
    </div>
  );
}
