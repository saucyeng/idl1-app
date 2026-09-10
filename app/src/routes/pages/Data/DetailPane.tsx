import { XIcon } from "lucide-react";
import { useCallback, useEffect, useReducer, useState } from "react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { SectionHead } from "../../../components/brand/SectionHead";
import { IconBtn } from "../../../components/brand/ToolGroup";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader as BrandTableHeader, TableRow } from "../../../components/ui/table";
import { listTracks, type SessionDetail, type TrackSummary } from "../../../ipc/catalog";
import { setSessionStart } from "../../../ipc/library";
import type { SelectionWindow } from "../../../state/selection";
import { ColourPicker } from "./ColourPicker";
import { describeIpcError } from "./errors";
import { lapRowClicked } from "./lapSelection";
import { parseStartInput, shouldPromptForStart } from "./libraryPanel";
import { LapTable } from "./LapTable";
import { MetadataForm } from "./MetadataForm";
import type { DetailView } from "./sessionDetail";
import { modifierFromClick } from "./sessionRow";

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
  /** `AppState.selection` (S1 Task 12) — filtered here to `view.sessionId`'s
   *  own windows, to know which lap rows are selected and which windows'
   *  colour this pane's pickers edit. */
  selection: SelectionWindow[];
  /** Dispatches `SET_WINDOWS` — the whole-list replace `lapRowClicked` and
   *  the session-row click (owned by the results list, not this pane)
   *  both produce. */
  onWindowsChange: (windows: SelectionWindow[]) => void;
  /** Dispatches `SET_WINDOW_COLOUR` for the window at `index` in
   *  `AppState.selection` (decision 84's per-window colour picker). */
  onSetColour: (index: number, colour: string) => void;
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

/** "This session's start time is unknown — set it" (C1 §3.1/§6, C3 §3.3
 *  `set_session_start`, ruling R191). Shown only when the catalogued start
 *  is `0`, meaning no importer — GPS back-fill included — could determine
 *  one. The value the user types is stored in `session.json` with
 *  `timestamp_source: "user"`; `data.parquet` is never rewritten, because
 *  it is a function of (blob, importer version) and never of a human. */
function UnknownStartPrompt({ detail, onSaved }: { detail: SessionDetail; onSaved: (d: SessionDetail) => void }) {
  const [value, setValue] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = parseStartInput(value);

  const handleSave = () => {
    if (parsed === null) return;
    setSaving(true);
    setErrorText(null);
    setSessionStart(detail.session_id, parsed)
      .then((updated) => {
        setSaving(false);
        onSaved(updated);
      })
      .catch((e: unknown) => {
        setSaving(false);
        setErrorText(describeIpcError(e).text);
      });
  };

  return (
    <NoteBlock className="flex flex-col gap-2">
      <span className="font-mono text-sm text-fg">
        This session's start time is unknown — the log carried no clock and no GPS fix to recover one from. Set it:
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          className="w-56"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Session start time"
        />
        <Button type="button" size="sm" onClick={handleSave} disabled={parsed === null || saving}>
          Set start time
        </Button>
      </div>
      {errorText !== null && (
        <span role="alert" className="font-mono text-sm text-brand-accent">
          {errorText}
        </span>
      )}
    </NoteBlock>
  );
}

/** The Data tab's session detail pane, over one `toDetailView` result (C3
 *  §3.2's `get_session` + `list_laps`, R53 Data Q3), plus its own
 *  `list_tracks` fetch for [[MetadataForm]] (Task 7). Metadata is editable
 *  (Task 7); delete and track-create affordances remain out of scope for
 *  this task (Parity gaps table). Selection (S1 Task 12): the header carries
 *  a colour picker for this session's own `{ kind: "session" }` window when
 *  one is selected, and [[LapTable]]'s rows are clickable and each carry
 *  their own picker when selected as a `{ kind: "lap" }` window. */
export function DetailPane({ view, detail, lapsErrorText, selection, onWindowsChange, onSetColour, onMetadataSaved, onClose }: DetailPaneProps) {
  const [tracksState, tracksDispatch] = useReducer(tracksReducer, { status: "loading" });

  // This session's own windows only — a colour picker or a lap-row click
  // never touches another session's window, and `findIndex` below needs the
  // index *into the whole `selection` array* (`SET_WINDOW_COLOUR`'s shape),
  // not an index into this filtered subset.
  const sessionWindowIndex = selection.findIndex((w) => w.sessionId === view.sessionId && w.span.kind === "session");
  const selectedLapNumbers = new Set<number>();
  for (const w of selection) {
    if (w.sessionId === view.sessionId && w.span.kind === "lap") selectedLapNumbers.add(w.span.lapNumber);
  }
  const lapWindowIndex = (lapNumber: number) =>
    selection.findIndex((w) => w.sessionId === view.sessionId && w.span.kind === "lap" && w.span.lapNumber === lapNumber);

  const handleLapClick = (lapNumber: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    onWindowsChange(lapRowClicked(selection, view.sessionId, lapNumber, modifierFromClick(e)));
  };

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
        <div className="flex items-center gap-2">
          {sessionWindowIndex !== -1 && (
            <ColourPicker
              label="Session colour"
              colour={selection[sessionWindowIndex].colour}
              onChange={(token) => onSetColour(sessionWindowIndex, token)}
            />
          )}
          <IconBtn icon={XIcon} label="Close" onClick={onClose} />
        </div>
      </div>

      {shouldPromptForStart(detail) && <UnknownStartPrompt detail={detail} onSaved={onMetadataSaved} />}

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
          <LapTable
            laps={view.laps}
            selectedLapNumbers={selectedLapNumbers}
            onLapClick={handleLapClick}
            colourFor={(lapNumber) => {
              const index = lapWindowIndex(lapNumber);
              return index === -1 ? null : selection[index].colour;
            }}
            onColourChange={(lapNumber, token) => {
              const index = lapWindowIndex(lapNumber);
              if (index !== -1) onSetColour(index, token);
            }}
          />
        )}
      </div>
    </div>
  );
}
