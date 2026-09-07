import { XIcon } from "lucide-react";
import { useCallback, useEffect, useReducer } from "react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { SectionHead } from "../../../components/brand/SectionHead";
import { IconBtn } from "../../../components/brand/ToolGroup";
import { Table, TableBody, TableCell, TableHead, TableHeader as BrandTableHeader, TableRow } from "../../../components/ui/table";
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
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3" role="region" aria-label="Session detail">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-mono text-sm font-medium text-fg">
          {view.venue} · {view.eventName === "" ? "—" : view.eventName}
        </h2>
        <IconBtn icon={XIcon} label="Close" onClick={onClose} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionHead>Metadata</SectionHead>
        {tracksState.status === "error" && (
          <NoteBlock className="border-brand-accent text-brand-accent">
            Couldn't load tracks for the venue autocomplete ({tracksState.text}); metadata is still editable.
          </NoteBlock>
        )}
        <MetadataForm detail={detail} tracks={tracksState.status === "ready" ? tracksState.tracks : []} onSaved={onMetadataSaved} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionHead>Channels</SectionHead>
        {view.channels.length === 0 ? (
          <p className="font-mono text-sm text-fg-dim">No channels recorded for this session.</p>
        ) : (
          <Table>
            <BrandTableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Samples</TableHead>
                <TableHead>Nominal rate</TableHead>
              </TableRow>
            </BrandTableHeader>
            <TableBody>
              {view.channels.map((c) => (
                <TableRow key={c.channelId}>
                  <TableCell>{c.channelId}</TableCell>
                  <TableCell>{c.sourceKind}</TableCell>
                  <TableCell>{c.channelKind}</TableCell>
                  <TableCell>{c.unit}</TableCell>
                  <TableCell>{c.sampleCount}</TableCell>
                  {/* Metadata only — never used to synthesize time (C1 §3.5). */}
                  <TableCell>{c.nominalRateHz} Hz (metadata only, not used for timing)</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionHead>Laps</SectionHead>
        {lapsErrorText !== null ? (
          <p role="alert" className="font-mono text-sm text-brand-accent">
            {lapsErrorText}
          </p>
        ) : (
          <LapTable laps={view.laps} />
        )}
      </div>
    </div>
  );
}
