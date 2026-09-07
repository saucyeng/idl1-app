import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { saveSessionMetadata, type SessionDetail, type TrackSummary } from "../../../ipc/catalog";
import { SectionHead } from "../../../components/brand/SectionHead";
import { describeIpcError } from "./errors";
import { initialDraft, isDirty, normalizeDraft, toSavePayload, venueOptions, type MetadataDraft } from "./metadataDraft";

/** Props for [[MetadataForm]]. */
interface MetadataFormProps {
  /** The raw `get_session` result this session's draft is built from. */
  detail: SessionDetail;
  /** The full catalog track list (C3 §3.2 `list_tracks`), for the venue
   *  pre-fill and the Venue autocomplete's suggestion list. An empty array
   *  while the caller's own fetch is still in flight is safe — it only
   *  narrows the venue pre-fill/suggestions, never breaks the form. */
  tracks: TrackSummary[];
  /** Called with `save_session_metadata`'s re-read `SessionDetail` after a
   *  successful save, so the owning pane can redraw from canonical truth
   *  (C3 §3.2's own rationale for that command re-reading before it
   *  returns) rather than from what this form hoped it wrote. */
  onSaved: (detail: SessionDetail) => void;
}

/** Save-attempt state. */
type SaveState = { status: "idle" } | { status: "saving" } | { status: "error"; text: string };

/** One coalesced line of the read-only tracks-visited summary: a track
 *  visited one or more times, its display name resolved from `tracksById`
 *  when the track still resolves. */
interface VisitedTrackLine {
  trackId: string;
  label: string;
  /** count, number of `TrackVisitSummary` entries naming this track. */
  visitCount: number;
}

/** Coalesces `SessionDetail.track_visits` into one line per distinct
 *  `track_id`, in first-visit order, per idl0 §24.10's tracks-visited row.
 *  A `track_id` that no longer resolves in `tracksById` still gets a line
 *  (labelled by its id) rather than being silently dropped. */
function coalesceVisitedTracks(detail: SessionDetail, tracksById: Map<string, TrackSummary>): VisitedTrackLine[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const visit of detail.track_visits) {
    if (!counts.has(visit.track_id)) order.push(visit.track_id);
    counts.set(visit.track_id, (counts.get(visit.track_id) ?? 0) + 1);
  }
  return order.map((trackId) => ({
    trackId,
    label: tracksById.get(trackId)?.name ?? trackId,
    visitCount: counts.get(trackId) ?? 0,
  }));
}

/** The Data tab's nine-field session metadata editor (idl0
 *  `metadata_editor.dart`, IDL0_SPEC §24.10), over `save_session_metadata`
 *  (C3 §3.2, ruling R59). Save is settle-bound (explicit button press,
 *  never on keystroke, CLAUDE.md §2). On success, `onSaved` hands the
 *  re-read `SessionDetail` back up so the owning pane redraws from
 *  canonical truth. */
export function MetadataForm({ detail, tracks, onSaved }: MetadataFormProps) {
  const tracksById = useMemo(() => new Map(tracks.map((t) => [t.track_id, t])), [tracks]);
  const [draft, setDraft] = useState<MetadataDraft>(() => initialDraft(detail, tracks));
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const dirty = isDirty(draft, detail);
  const options = useMemo(() => venueOptions(tracks), [tracks]);
  const visited = useMemo(() => coalesceVisitedTracks(detail, tracksById), [detail, tracksById]);

  const setField = (key: keyof MetadataDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    const normalized = normalizeDraft(draft);
    setDraft(normalized);
    setSaveState({ status: "saving" });

    // `toSavePayload`'s return is `MetadataDraft`'s nine fields plus
    // `session_id`; `save_session_metadata`'s `metadata` argument is those
    // same nine fields alone (C3 §3.2's `SessionMetadataPatch`) — dropping
    // `session_id` here, not in `metadataDraft.ts`, keeps that module's own
    // shape usable by any future caller that still wants the id alongside it.
    const { session_id: _sessionId, ...patch } = toSavePayload(detail.session_id, normalized);

    saveSessionMetadata(detail.session_id, patch)
      .then((updated) => {
        setSaveState({ status: "idle" });
        onSaved(updated);
      })
      .catch((e: unknown) => {
        setSaveState({ status: "error", text: describeIpcError(e).text });
      });
  };

  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Session metadata"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <datalist id="data-metadata-venue-options">
        {options.map((venue) => (
          <option key={venue} value={venue} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Rider
          <Input type="text" value={draft.rider} onChange={(e) => setField("rider", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Bike
          <Input type="text" value={draft.bike} onChange={(e) => setField("bike", e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Bike comment
          <Input type="text" value={draft.bike_comment} onChange={(e) => setField("bike_comment", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Venue
          <Input
            type="text"
            list="data-metadata-venue-options"
            value={draft.venue_name}
            onChange={(e) => setField("venue_name", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Event
          <Input type="text" value={draft.event_name} onChange={(e) => setField("event_name", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Event session
          <Input type="text" value={draft.event_session} onChange={(e) => setField("event_session", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Tag
          <Input type="text" value={draft.tag} onChange={(e) => setField("tag", e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Comment
          <Input type="text" value={draft.short_comment} onChange={(e) => setField("short_comment", e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Notes
          <textarea
            className="min-h-16 w-full rounded-[var(--radius)] border border-rule bg-control px-3 py-1.5 font-mono text-sm text-fg outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus"
            value={draft.long_comment}
            onChange={(e) => setField("long_comment", e.target.value)}
          />
        </label>
      </div>

      <Button type="submit" emphasis="good" filled size="sm" className="self-start" disabled={!dirty || saveState.status === "saving"}>
        Save
      </Button>

      {saveState.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          Couldn't save: {saveState.text}
        </p>
      )}

      <SectionHead>Tracks visited</SectionHead>
      {visited.length === 0 ? (
        <p className="font-mono text-sm text-fg-dim">No track visits recorded for this session.</p>
      ) : (
        <ul className="flex flex-col gap-1 font-mono text-sm text-fg">
          {visited.map((v) => (
            <li key={v.trackId}>
              {v.label} ({v.visitCount}×)
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
