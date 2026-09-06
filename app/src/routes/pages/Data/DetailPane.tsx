import { useCallback, useEffect, useReducer } from "react";

import { listTracks, type SessionDetail, type TrackSummary } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { LapTable } from "./LapTable";
import { MetadataForm } from "./MetadataForm";
import type { DetailView } from "./sessionDetail";

/** Props for [[DetailPane]]. */
interface DetailPaneProps {
  view: DetailView;
  /** The raw `get_session` result behind `view` — [[MetadataForm]] (Task 7)
   *  needs the file-native nine metadata fields and `track_visits`, which
   *  `toDetailView`'s display projection does not carry. */
  detail: SessionDetail;
  /** Text from `describeIpcError` when `listLaps` failed with a kind other
   *  than `not_found` (that kind is not an error for this pane, R53 Data
   *  Q4 — it renders via `view.laps` being empty instead). Null when
   *  `listLaps` succeeded or wasn't attempted. */
  lapsErrorText: string | null;
  /** Passed straight through to `MetadataForm`'s `onSaved` — the owning
   *  page redraws `detail` from `save_session_metadata`'s re-read result. */
  onMetadataSaved: (detail: SessionDetail) => void;
  onClose: () => void;
}

/** [[DetailPane]]'s own `list_tracks` (C3 §3.2) fetch state, for
 *  [[MetadataForm]]'s venue pre-fill and Venue autocomplete. Independent of
 *  `sessionDetail`'s own fetch — a `list_tracks` failure narrows the
 *  metadata form (no track-derived venue fallback, no suggestions) rather
 *  than blocking the rest of the pane. */
type TracksState =
  | { status: "loading" }
  | { status: "ready"; tracks: TrackSummary[] }
  | { status: "error"; text: string };

type TracksAction = { type: "loaded"; tracks: TrackSummary[] } | { type: "failed"; text: string };

function tracksReducer(_state: TracksState, action: TracksAction): TracksState {
  switch (action.type) {
    case "loaded":
      return { status: "ready", tracks: action.tracks };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** The Data tab's session detail pane, over one `toDetailView` result (C3
 *  §3.2's `get_session` + `list_laps`, R53 Data Q3), plus its own
 *  `list_tracks` fetch for [[MetadataForm]] (Task 7). Metadata is editable
 *  (Task 7); delete and track-create affordances remain out of scope for
 *  this task (Parity gaps table). */
export function DetailPane({ view, detail, lapsErrorText, onMetadataSaved, onClose }: DetailPaneProps) {
  const [tracksState, tracksDispatch] = useReducer(tracksReducer, { status: "loading" });

  const loadTracks = useCallback((isCancelled: () => boolean) => {
    listTracks()
      .then((tracks) => {
        if (isCancelled()) return;
        tracksDispatch({ type: "loaded", tracks });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        tracksDispatch({ type: "failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTracks(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadTracks]);

  return (
    <div className="data-detail-pane" role="region" aria-label="Session detail">
      <div className="data-detail-header">
        <h2>
          {view.venue} · {view.eventName === "" ? "—" : view.eventName}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <h3>Metadata</h3>
      {tracksState.status === "error" && (
        <p role="alert">
          Couldn't load tracks for the venue autocomplete ({tracksState.text}); metadata is still editable.
        </p>
      )}
      <MetadataForm detail={detail} tracks={tracksState.status === "ready" ? tracksState.tracks : []} onSaved={onMetadataSaved} />

      <h3>Channels</h3>
      {view.channels.length === 0 ? (
        <p>No channels recorded for this session.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Source</th>
              <th>Kind</th>
              <th>Unit</th>
              <th>Samples</th>
              <th>Nominal rate</th>
            </tr>
          </thead>
          <tbody>
            {view.channels.map((c) => (
              <tr key={c.channelId}>
                <td>{c.channelId}</td>
                <td>{c.sourceKind}</td>
                <td>{c.channelKind}</td>
                <td>{c.unit}</td>
                <td>{c.sampleCount}</td>
                {/* Metadata only — never used to synthesize time (C1 §3.5). */}
                <td>{c.nominalRateHz} Hz (metadata only, not used for timing)</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Laps</h3>
      {lapsErrorText !== null ? <p role="alert">{lapsErrorText}</p> : <LapTable laps={view.laps} />}
    </div>
  );
}
