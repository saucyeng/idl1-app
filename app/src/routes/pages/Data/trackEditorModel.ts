/**
 * The track editor's state (track editor spec §1): which gates are placed,
 * which one is being placed, and the name and venue, plus the draft it
 * hands `save_track`. Pure: no React, no Leaflet, no IPC.
 *
 * A gate is placed with two clicks, one at each end, across the trail. A
 * start and a finish make the track point-to-point (a downhill); a start
 * alone makes it a circuit, the start being the start/finish line (IDL0_SPEC
 * §16.2.a). Sector gates are placed the same way, in order. A circuit can
 * also have an out-lap gate (pit exit) and an in-lap gate (pit entry), placed
 * the same way; a point-to-point track has neither.
 */
import type { Gate, GpsFix, LapTiming, SectorGate, TrackDetail, TrackDraft } from "../../../ipc/catalog";

/** A point on the map, decimal degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Which gate a placement fills. */
export type GateTarget =
  | { kind: "start" }
  | { kind: "finish" }
  | { kind: "out-lap" }
  | { kind: "in-lap" }
  | { kind: "sector"; index: number }
  | { kind: "new-sector" };

/** The editor's state. */
export interface TrackEditorState {
  start: Gate | null;
  finish: Gate | null;
  /** A circuit's out-lap gate (pit exit): a lap from it to the next
   *  start/finish crossing is an out lap. Kept while a finish is placed,
   *  but only a circuit saves it ({@link lapTimingOf}). */
  outLap: Gate | null;
  /** A circuit's in-lap gate (pit entry): a lap from a start/finish
   *  crossing to it is an in lap. Circuit only, as {@link outLap}. */
  inLap: Gate | null;
  sectors: SectorGate[];
  /** The gate being placed, and its first end once clicked; `null` when
   *  no placement is under way. */
  placing: { target: GateTarget; first: LatLon | null } | null;
  name: string;
  venue: string;
}

/** What the editor can be told. */
export type TrackEditorAction =
  | { type: "LOAD"; state: TrackEditorState }
  | { type: "PLACE"; target: GateTarget }
  | { type: "MAP_CLICK"; at: LatLon }
  | { type: "CANCEL_PLACING" }
  | { type: "DELETE"; target: GateTarget }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_VENUE"; venue: string };

/** The editor's starting state: an existing track's gates, name and venue,
 *  or an empty track. */
export function initialEditorState(track: TrackDetail | null): TrackEditorState {
  const timing = track?.lap_timing ?? null;
  return {
    start: timing === null ? null : timing.kind === "circuit" ? timing.start_finish : timing.start,
    finish: timing !== null && timing.kind === "point_to_point" ? timing.finish : null,
    outLap: timing !== null && timing.kind === "circuit" ? timing.out_lap_gate : null,
    inLap: timing !== null && timing.kind === "circuit" ? timing.in_lap_gate : null,
    sectors: track?.sector_gates ?? [],
    placing: null,
    name: track?.name ?? "",
    venue: track?.venue_name ?? "",
  };
}

/** The name a new sector gets: `S1`, `S2`, … one past the highest `S<n>`
 *  already used, so deleting a middle sector never reuses a name. */
export function nextSectorName(sectors: SectorGate[]): string {
  const used = sectors.map((s) => /^S(\d+)$/.exec(s.name)).filter((m) => m !== null).map((m) => Number(m[1]));
  return `S${used.length === 0 ? sectors.length + 1 : Math.max(...used) + 1}`;
}

/** The two clicks of a placement as a gate. */
function gateFrom(a: LatLon, b: LatLon): Gate {
  return { lat1: a.lat, lon1: a.lon, lat2: b.lat, lon2: b.lon };
}

/** Puts `gate` where `target` says. */
function withGate(state: TrackEditorState, target: GateTarget, gate: Gate | null): TrackEditorState {
  switch (target.kind) {
    case "start":
      return { ...state, start: gate };
    case "finish":
      return { ...state, finish: gate };
    case "out-lap":
      return { ...state, outLap: gate };
    case "in-lap":
      return { ...state, inLap: gate };
    case "sector":
      if (gate === null) return { ...state, sectors: state.sectors.filter((_, i) => i !== target.index) };
      return { ...state, sectors: state.sectors.map((s, i) => (i === target.index ? { ...s, gate } : s)) };
    case "new-sector":
      if (gate === null) return state;
      return { ...state, sectors: [...state.sectors, { name: nextSectorName(state.sectors), gate }] };
  }
}

/** The editor's reducer. */
export function trackEditorReducer(state: TrackEditorState, action: TrackEditorAction): TrackEditorState {
  switch (action.type) {
    case "LOAD":
      return action.state;
    case "PLACE":
      return { ...state, placing: { target: action.target, first: null } };
    case "MAP_CLICK": {
      if (state.placing === null) return state;
      if (state.placing.first === null) return { ...state, placing: { ...state.placing, first: action.at } };
      const placed = withGate(state, state.placing.target, gateFrom(state.placing.first, action.at));
      return { ...placed, placing: null };
    }
    case "CANCEL_PLACING":
      return { ...state, placing: null };
    case "DELETE":
      return { ...withGate(state, action.target, null), placing: null };
    case "SET_NAME":
      return { ...state, name: action.name };
    case "SET_VENUE":
      return { ...state, venue: action.venue };
  }
}

/** The track's timing from the gates placed: start and finish make it
 *  point-to-point, a start alone a circuit (with its out-lap and in-lap
 *  gates, when placed), anything else no timing. */
export function lapTimingOf(state: Pick<TrackEditorState, "start" | "finish" | "outLap" | "inLap">): LapTiming | null {
  if (state.start === null) return null;
  if (state.finish === null) return { kind: "circuit", start_finish: state.start, out_lap_gate: state.outLap, in_lap_gate: state.inLap };
  return { kind: "point_to_point", start: state.start, finish: state.finish };
}

/** Why Save is off, or `null` when the track can be saved. `runCount` is the
 *  preview's run count on the editor's session, `null` when the editor has
 *  no session (editing a track on its own line). */
export function saveBlocker(state: TrackEditorState, runCount: number | null): string | null {
  if (state.name.trim() === "") return "Name the track.";
  if (state.start === null) return "Place a start gate.";
  if (state.placing !== null) return "Finish placing the gate, or press Esc.";
  if (runCount === 0) return "The gates catch no run on this ride. Check each gate crosses the line.";
  return null;
}

/** Same gate, compared by value. */
function sameGate(a: Gate | null, b: Gate | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lat1 === b.lat1 && a.lon1 === b.lon1 && a.lat2 === b.lat2 && a.lon2 === b.lon2;
}

/**
 * `save_track`'s argument (spec §3). `base` is the track being edited, or
 * `null` for a new one. `previewLine` is the preview's reference line on the
 * editor's session (`null` when the editor has no session).
 *
 * The reference line: a new track takes `previewLine`. An edited track keeps
 * its own unless the start or finish moved and the editor has a session
 * whose preview caught a run — then the new line replaces it, because the
 * old one no longer runs gate to gate.
 */
export function toTrackDraft(state: TrackEditorState, base: TrackDetail | null, previewLine: GpsFix[] | null): TrackDraft {
  const baseTiming = initialEditorState(base);
  const endsMoved = !sameGate(baseTiming.start, state.start) || !sameGate(baseTiming.finish, state.finish);
  const fresh = previewLine !== null && previewLine.length > 0 ? previewLine : null;
  const reference_polyline = base === null ? (fresh ?? []) : endsMoved && fresh !== null ? fresh : base.reference_polyline;
  return {
    track_id: base?.track_id ?? null,
    name: state.name.trim(),
    venue_name: state.venue.trim(),
    lap_timing: lapTimingOf(state),
    neutral_zones: base?.neutral_zones ?? [],
    sector_gates: state.sectors,
    reference_polyline,
  };
}

/** A run's time for the sidebar: `m:ss.s`. */
export function formatRunDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Session time for the sidebar and the range slider: `m:ss`. */
export function formatSessionTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
