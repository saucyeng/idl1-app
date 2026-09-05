import { useMemo, useState } from "react";

import type { SessionDetail, TrackSummary } from "../../../ipc/catalog";
import { NotImplementedError, saveSessionMetadata } from "./ipcStubs";
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
}

/** Save-attempt state. `"not-implemented"` is the only failure this form
 *  can reach in wave 2 — `saveSessionMetadata` never rejects with anything
 *  else (`Data/ipcStubs.ts`). */
type SaveState = { status: "idle" } | { status: "saving" } | { status: "not-implemented" };

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
 *  `metadata_editor.dart`, IDL0_SPEC §24.10), over the `save_session_metadata`
 *  IPC need (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 1) — no real
 *  command behind it in wave 2. Save is settle-bound (explicit button
 *  press, never on keystroke, CLAUDE.md §2) and always fails honestly with
 *  the stub's `NotImplementedError` rather than pretending to persist. */
export function MetadataForm({ detail, tracks }: MetadataFormProps) {
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

    // `toSavePayload`'s return has only string-valued fields (every C1 §6
    // metadata field, plus `session_id`), so it is a `Record<string, string>`
    // in substance; the cast is only for `SessionMetadataSavePayload`'s named
    // fields versus the stub's untyped `Record` parameter (ipcStubs.ts).
    const payload = toSavePayload(detail.session_id, normalized) as unknown as Record<string, string>;

    saveSessionMetadata(detail.session_id, payload).catch((e: unknown) => {
      // The stub only ever rejects with NotImplementedError (ipcStubs.ts) —
      // this form has no other failure mode to distinguish in wave 2.
      if (e instanceof NotImplementedError) {
        setSaveState({ status: "not-implemented" });
        return;
      }
      setSaveState({ status: "not-implemented" });
    });
  };

  return (
    <form
      className="data-metadata-form"
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

      <label>
        Rider
        <input type="text" value={draft.rider} onChange={(e) => setField("rider", e.target.value)} />
      </label>
      <label>
        Bike
        <input type="text" value={draft.bike} onChange={(e) => setField("bike", e.target.value)} />
      </label>
      <label>
        Bike comment
        <input
          type="text"
          value={draft.bike_comment}
          onChange={(e) => setField("bike_comment", e.target.value)}
        />
      </label>
      <label>
        Venue
        <input
          type="text"
          list="data-metadata-venue-options"
          value={draft.venue_name}
          onChange={(e) => setField("venue_name", e.target.value)}
        />
      </label>
      <label>
        Event
        <input type="text" value={draft.event_name} onChange={(e) => setField("event_name", e.target.value)} />
      </label>
      <label>
        Event session
        <input
          type="text"
          value={draft.event_session}
          onChange={(e) => setField("event_session", e.target.value)}
        />
      </label>
      <label>
        Tag
        <input type="text" value={draft.tag} onChange={(e) => setField("tag", e.target.value)} />
      </label>
      <label>
        Comment
        <input
          type="text"
          value={draft.short_comment}
          onChange={(e) => setField("short_comment", e.target.value)}
        />
      </label>
      <label>
        Notes
        <textarea value={draft.long_comment} onChange={(e) => setField("long_comment", e.target.value)} />
      </label>

      <button type="submit" disabled={!dirty || saveState.status === "saving"}>
        Save
      </button>

      {saveState.status === "not-implemented" && (
        <p role="alert">Saving session metadata isn't wired up yet — your changes aren't saved.</p>
      )}

      <h3>Tracks visited</h3>
      {visited.length === 0 ? (
        <p>No track visits recorded for this session.</p>
      ) : (
        <ul>
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
