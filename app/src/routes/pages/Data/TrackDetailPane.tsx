import { useEffect, useState } from "react";

import { getTrack, type TrackDetail } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import { toTrackRow } from "./trackRow";

/** Props for [[TrackDetailPane]]. */
interface TrackDetailPaneProps {
  trackId: string;
  onClose: () => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; detail: TrackDetail }
  | { status: "error"; text: string };

/** `0` for `null` (no lap-timing geometry set), `1` when present — the
 *  furthest this pane goes into `lap_timing`'s content: its sealed-union
 *  shape (`Circuit` | `PointToPoint`) is not yet fixed by any contract
 *  (C3 §6 item 10), so anything past presence/absence would be a guess. */
function lapTimingPresenceCount(lapTiming: TrackDetail["lap_timing"]): number {
  return lapTiming === null ? 0 : 1;
}

/** The Data tab's track detail pane, over one `get_track` result (C3 §3.2).
 *  Fetches on explicit open, settle-bound (C3 §4) — opening a track is a
 *  gesture settle, not a hot path. Renders `TrackDetail`'s scalar fields
 *  plus a *count* for each of its four unfixed-shape fields (`lap_timing`,
 *  `neutral_zones`, `sector_gates`, `reference_polyline`) — C3 §6 item 10
 *  leaves their element/union shapes unfixed, so parsing further would be a
 *  guess. No editing here: the track editor is deferred to wave 3 (Parity
 *  gaps table). */
export function TrackDetailPane({ trackId, onClose }: TrackDetailPaneProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    getTrack(trackId)
      .then((detail) => {
        if (cancelled) return;
        setState({ status: "ready", detail });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ status: "error", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  return (
    <div className="data-detail-pane" role="region" aria-label="Track detail">
      <div className="data-detail-header">
        <h2>Track detail</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {state.status === "loading" && <p>Loading track…</p>}
      {state.status === "error" && <p role="alert">{state.text}</p>}
      {state.status === "ready" && (
        <>
          <dl className="data-detail-meta">
            <dt>Name</dt>
            <dd>{toTrackRow(state.detail).name}</dd>
            <dt>Venue</dt>
            <dd>{toTrackRow(state.detail).venueText}</dd>
            <dt>Created</dt>
            <dd>{toTrackRow(state.detail).createdText}</dd>
            <dt>Updated</dt>
            <dd>{toTrackRow(state.detail).updatedText}</dd>
            <dt>Lap timing configured</dt>
            <dd>{lapTimingPresenceCount(state.detail.lap_timing)}</dd>
            <dt>Neutral zones</dt>
            <dd>{state.detail.neutral_zones.length}</dd>
            <dt>Sector gates</dt>
            <dd>{state.detail.sector_gates.length}</dd>
            <dt>Reference polyline points</dt>
            <dd>{state.detail.reference_polyline.length}</dd>
          </dl>
        </>
      )}
    </div>
  );
}
