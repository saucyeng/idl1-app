/**
 * The track editor's commands (track editor spec §3): the session's GPS line
 * in degrees for the satellite map, what a set of gates catches before the
 * track is saved, and the map's tiles. Saving is `saveTrack` (`ipc/catalog`).
 *
 * **Degrees, not metres.** Unlike the notebook's map cell (C2 §5.3), the
 * editor draws over a satellite basemap in Web Mercator, and gates are stored
 * in degrees, so latitude and longitude cross here (spec §2). Projection to
 * pixels is Leaflet's; every number a track's behaviour depends on comes from
 * Rust.
 */
import { invoke } from "@tauri-apps/api/core";

import type { GpsFix, LapTiming, SectorGate } from "./catalog";
import { decodeTraceLayout } from "./gps";
import type { Window } from "./workbook";

/** A decoded `fetch_session_fixes` response: one window's fixes. */
export interface LatLonTrace {
  /** Longitude, decimal degrees, one per point. */
  lons: Float64Array;
  /** Latitude, decimal degrees, index-aligned with {@link lons}. */
  lats: Float64Array;
  /** Seconds, session-relative. */
  ts: Float64Array;
  /** The colour-by channel at each fix (`NaN` where it has none), or `null`
   *  when none was asked for. */
  cs: Float64Array | null;
}

/** Decodes `IDLL` v1 bytes: the `IDLG` v1 layout with `x` = longitude and
 *  `y` = latitude (spec §3).
 *
 *  @throws Error on bad magic, version, or a short buffer. */
export function decodeLatLonTrace(buf: ArrayBuffer): LatLonTrace {
  const t = decodeTraceLayout(buf, "IDLL");
  return { lons: t.xs, lats: t.ys, ts: t.ts, cs: t.cs };
}

/** The session's GPS fixes in degrees, decimated to `budget` points. */
export async function fetchSessionFixes(window: Window, colourBy: string | null, budget: number): Promise<LatLonTrace> {
  const buf = await invoke<ArrayBuffer>("fetch_session_fixes", { window, colourBy, budget });
  return decodeLatLonTrace(buf);
}

/** One run a set of gates catches (spec §3). */
export interface TrackRun {
  /** Session-relative seconds. */
  start_secs: number;
  end_secs: number;
  /** The run's time, seconds. */
  duration_secs: number;
}

/** `preview_track_runs`' return (spec §3). */
export interface TrackRunsPreview {
  runs: TrackRun[];
  /** The reference run's fixes, every one; empty when there is no run. */
  reference_polyline: GpsFix[];
}

/** The runs `lapTiming` and `sectorGates` catch on `sessionId`, and the
 *  line a track made from it would take. */
export async function previewTrackRuns(sessionId: string, lapTiming: LapTiming | null, sectorGates: SectorGate[]): Promise<TrackRunsPreview> {
  return invoke<TrackRunsPreview>("preview_track_runs", { sessionId, lapTiming, sectorGates });
}

/** The basemap sources the map knows (spec §4). */
export type MapTileSource = "esri_world_imagery";

/** The deepest zoom the basemap serves. */
export const MAP_MAX_ZOOM = 19;

/** One basemap tile's bytes, from the cache or the network. Rejects with
 *  `not_found` when the tile is neither cached nor fetchable; the map then
 *  leaves that tile blank. */
export async function fetchMapTile(source: MapTileSource, z: number, x: number, y: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("fetch_map_tile", { source, z, x, y });
}
