import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { SpecRow } from "../../../components/brand/SpecRow";
import { IconBtn } from "../../../components/brand/ToolGroup";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { deleteTrack, getTrack, saveTrack, type TrackDetail } from "../../../ipc/catalog";
import { describeIpcError } from "./errors";
import {
  formatLapTiming,
  formatNeutralZones,
  formatReferencePolylineSummary,
  formatRescanSessionsLabel,
  formatSectorGates,
} from "./trackDetailFormat";
import { initialTrackDraft, isTrackDraftDirty, normalizeTrackDraft, toTrackSaveDraft, type TrackNameVenueDraft } from "./trackDraft";
import { toTrackRow } from "./trackRow";

/** Props for [[TrackDetailPane]]. */
interface TrackDetailPaneProps {
  trackId: string;
  onClose: () => void;
  /** Called after a successful save or delete, so the caller (the tracks
   *  list) can refresh from canonical truth — this pane never re-fetches
   *  the list itself. */
  onChanged: () => void;
  /** Runs `save_track`/`delete_track`'s `stale_session_ids` (C3 §3.2,
   *  ruling R86) through the caller's own maintenance-action driver — this
   *  pane holds no maintenance-action state of its own. */
  onRescanSessions: (sessionIds: string[]) => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; detail: TrackDetail; staleSessionIds: string[] }
  | { status: "deleted"; staleSessionIds: string[] }
  | { status: "error"; text: string };

/** Save-attempt state for the name/venue editor. */
type SaveState = { status: "idle" } | { status: "editing"; draft: TrackNameVenueDraft } | { status: "saving"; draft: TrackNameVenueDraft } | { status: "error"; draft: TrackNameVenueDraft; text: string };

/** The Data tab's track detail pane, over one `get_track` result (C3
 *  §3.2). Fetches on explicit open, settle-bound (C3 §4) — opening a track
 *  is a gesture settle, not a hot path. Renders every `TrackDetail` field
 *  (ruling R86 typed the four that were `unknown`), and offers Name/Venue
 *  edit (`save_track`) and Delete (`delete_track`) — the map-based gate
 *  placement editor stays wave 3 (ruling R54), so lap timing/sectors/
 *  neutral zones/reference polyline are read-only text here. Both write
 *  paths surface `stale_session_ids` as a "Rescan N sessions" action. */
export function TrackDetailPane({ trackId, onClose, onChanged, onRescanSessions }: TrackDetailPaneProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setSaveState({ status: "idle" });

    getTrack(trackId)
      .then((detail) => {
        if (cancelled) return;
        setState({ status: "ready", detail, staleSessionIds: [] });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ status: "error", text: describeIpcError(e).text });
      });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (state.status !== "ready") {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3" role="region" aria-label="Track detail">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-mono text-sm font-medium text-fg">Track detail</h2>
          <IconBtn icon={XIcon} label="Close" onClick={onClose} />
        </div>
        {state.status === "loading" && <p className="font-mono text-sm text-fg-dim">Loading track…</p>}
        {state.status === "error" && (
          <p role="alert" className="font-mono text-sm text-brand-accent">
            {state.text}
          </p>
        )}
        {state.status === "deleted" && (
          <>
            <p className="font-mono text-sm text-fg-dim">Track deleted.</p>
            {state.staleSessionIds.length > 0 && (
              <Button type="button" size="sm" className="self-start" onClick={() => onRescanSessions(state.staleSessionIds)}>
                {formatRescanSessionsLabel(state.staleSessionIds.length)}
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  const { detail, staleSessionIds } = state;
  const row = toTrackRow(detail);

  const startEdit = () => {
    setSaveState({ status: "editing", draft: initialTrackDraft(detail) });
  };

  const cancelEdit = () => {
    setSaveState({ status: "idle" });
  };

  const setDraftField = (key: keyof TrackNameVenueDraft, value: string) => {
    setSaveState((current) =>
      current.status === "editing" || current.status === "error" ? { status: "editing", draft: { ...current.draft, [key]: value } } : current,
    );
  };

  const handleSave = () => {
    if (saveState.status !== "editing" && saveState.status !== "error") return;
    const normalized = normalizeTrackDraft(saveState.draft);
    setSaveState({ status: "saving", draft: normalized });

    saveTrack(toTrackSaveDraft(detail, normalized))
      .then((result) => {
        setState({ status: "ready", detail: result.track, staleSessionIds: result.stale_session_ids });
        setSaveState({ status: "idle" });
        onChanged();
      })
      .catch((e: unknown) => {
        setSaveState({ status: "error", draft: normalized, text: describeIpcError(e).text });
      });
  };

  const handleDelete = () => {
    // TODO(idl0): replace window.confirm() with the shell's in-app modal once one exists
    if (!window.confirm(`Delete track "${detail.name}"? This cannot be undone.`)) return;

    deleteTrack(detail.track_id)
      .then((report) => {
        setState({ status: "deleted", staleSessionIds: report.stale_session_ids });
        onChanged();
      })
      .catch((e: unknown) => {
        setState({ status: "error", text: describeIpcError(e).text });
      });
  };

  const editing = saveState.status === "editing" || saveState.status === "saving" || saveState.status === "error";
  const dirty = editing && isTrackDraftDirty(saveState.draft, detail);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3" role="region" aria-label="Track detail">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-mono text-sm font-medium text-fg">Track detail</h2>
        <IconBtn icon={XIcon} label="Close" onClick={onClose} />
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-2"
          aria-label="Edit track"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
            Name
            <Input type="text" value={saveState.draft.name} onChange={(e) => setDraftField("name", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
            Venue
            <Input type="text" value={saveState.draft.venue_name} onChange={(e) => setDraftField("venue_name", e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" emphasis="good" filled size="sm" disabled={!dirty || saveState.status === "saving"}>
              Save
            </Button>
            <Button type="button" size="sm" onClick={cancelEdit} disabled={saveState.status === "saving"}>
              Cancel
            </Button>
          </div>
          {saveState.status === "error" && (
            <p role="alert" className="font-mono text-sm text-brand-accent">
              Couldn't save: {saveState.text}
            </p>
          )}
        </form>
      ) : (
        <div role="toolbar" aria-label="Track actions" className="flex gap-2">
          <Button type="button" size="sm" onClick={startEdit}>
            Edit
          </Button>
          <Button type="button" size="sm" emphasis="accent" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      )}

      {staleSessionIds.length > 0 && (
        <Button type="button" size="sm" className="self-start" onClick={() => onRescanSessions(staleSessionIds)}>
          {formatRescanSessionsLabel(staleSessionIds.length)}
        </Button>
      )}

      <div className="flex flex-col gap-1.5">
        <SpecRow label="Name" value={row.name} />
        <SpecRow label="Venue" value={row.venueText} />
        <SpecRow label="Created" value={row.createdText} />
        <SpecRow label="Updated" value={row.updatedText} />
        <SpecRow label="Lap timing" value={formatLapTiming(detail.lap_timing)} />
        <SpecRow label="Sector gates" value={formatSectorGates(detail.sector_gates)} />
        <SpecRow label="Neutral zones" value={formatNeutralZones(detail.neutral_zones)} />
        <SpecRow label="Reference polyline" value={formatReferencePolylineSummary(detail.reference_polyline)} />
      </div>
    </div>
  );
}
