import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { DenseRow, TableHeader as BrandTableHeader } from "../../../components/brand/DenseRow";
import { listTracks, type TrackSummary } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { compareTracks, type SortField } from "./sort";
import { toTrackRow } from "./trackRow";
import { TrackDetailPane } from "./TrackDetailPane";

/** Props for [[TrackResults]]. */
interface TrackResultsProps {
  sortField: SortField;
  sortAscending: boolean;
  /** Forwarded to [[TrackDetailPane]]'s "Rescan N sessions" action
   *  (`stale_session_ids`, C3 §3.2 ruling R86) — the Tracks view has no
   *  maintenance-action state of its own, so this delegates to the shared
   *  toolbar driver `index.tsx` owns. */
  onRescanSessions: (sessionIds: string[]) => void;
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
export function TrackResults({ sortField, sortAscending, onRescanSessions }: TrackResultsProps) {
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
    return <p className="p-3 font-mono text-sm text-fg-dim">Loading tracks…</p>;
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="p-3 font-mono text-sm text-brand-accent">
        {state.text}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {rows.length === 0 ? (
        <p className="p-3 font-mono text-sm text-fg-dim">No tracks yet.</p>
      ) : (
        <div className="flex flex-col">
          <BrandTableHeader className="sticky top-0 z-10 bg-bg px-3">
            <span className="flex-[2]">Name</span>
            <span className="flex-[2]">Venue</span>
            <span className="flex-1">Created</span>
            <span className="flex-1">Updated</span>
          </BrandTableHeader>
          {rows.map((row) => (
            <DenseRow
              key={row.trackId}
              tabIndex={0}
              role="row"
              aria-selected={row.trackId === selectedTrackId}
              selected={row.trackId === selectedTrackId}
              className="cursor-pointer px-3"
              onClick={() => setSelectedTrackId(row.trackId)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setSelectedTrackId(row.trackId);
              }}
            >
              <span className="flex-[2] font-mono text-sm text-fg">{row.name}</span>
              <span className="flex-[2] font-mono text-sm text-fg-dim">{row.venueText}</span>
              <span className="flex-1 font-mono text-sm text-fg-dim">{row.createdText}</span>
              <span className="flex-1 font-mono text-sm text-fg-dim">{row.updatedText}</span>
            </DenseRow>
          ))}
        </div>
      )}
      {selectedTrackId !== null && (
        <TrackDetailPane
          trackId={selectedTrackId}
          onClose={() => setSelectedTrackId(null)}
          onChanged={() => loadTracks(() => false)}
          onRescanSessions={onRescanSessions}
        />
      )}
    </div>
  );
}
