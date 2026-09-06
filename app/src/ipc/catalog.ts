import { invoke } from "@tauri-apps/api/core";

/** Catalog `sessions` table row (C3 §3.2, C4 §5), column for column. */
export interface SessionSummary {
  session_id: string;
  /** hex-encoded, lowercase, 64 chars (C4 §5 sessions.blob_sha256) */
  blob_sha256: string;
  /** file-level: which importer produced this session — C1 §2 `Session.source_format`,
   *  C4 §5 sessions.source_format. Distinct from `ChannelSummary.source_kind`. */
  source_format: "idl0" | "fit" | "gpx" | "csv";
  /** null for FIT/GPX/CSV sources (no device) — C1 §2 */
  device_id: string | null;
  /** null for FIT/GPX/CSV sources — C1 §2 */
  config_checksum: string | null;
  /** SemVer 2.0.0, e.g. "0.1.0" (C1 §4.3) */
  importer_version: string;
  /** e.g. "v1", §3.3's algorithm version (C1 §4.3) */
  seam_correction_version: string;
  /** SemVer 2.0.0, `idl-rs` core `CARGO_PKG_VERSION` (C1 §4.3) */
  engine_version: string;
  /** i64, session start, Unix epoch milliseconds; 0 = unknown (C1 §3.1) */
  timestamp_utc_ms: number;
  /** i64, catalog row insert time (import time) */
  created_at_ms: number;
  /** "" = not set (C4 §5 sessions.rider default) */
  rider: string;
  bike: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  tag: string;
  /** u32 | null — null until laps are indexed for this session; counts the
   *  same rows `listLaps` returns. */
  lap_count: number | null;
  /** i64 milliseconds | null */
  duration_ms: number | null;
}

/** `LapDetail.sectors` element (C1 §6 `laps[].sectors[]`, C3 §6 item 11,
 *  closed 2026-09-06) — the landed `session_json::SectorJson` shape,
 *  mirrored field for field. */
export interface LapSector {
  name: string;
  /** i64, UTC ms */
  start_ms: number;
  /** i64, UTC ms */
  end_ms: number;
  /** f64, seconds, recording-time (t=0-anchored) */
  start_time_secs: number;
  /** f64, seconds */
  end_time_secs: number;
}

/** `LapDetail.neutral_zone_visits` element (C1 §6
 *  `laps[].neutral_zone_visits[]`, C3 §6 item 11, closed 2026-09-06). */
export interface LapNeutralZoneVisit {
  name: string;
  /** i64, UTC ms */
  enter_ms: number;
  /** i64, UTC ms */
  exit_ms: number;
}

/** `session.json`'s file-native `laps[]` shape (C1 §6) — distinct from the
 *  catalog-cached `LapSummary` (returned only by `listLaps`). */
export interface LapDetail {
  /** int, 1-based (C1 §6 laps[].lap_number) */
  lap_number: number;
  /** i64, UTC ms */
  start_timestamp_ms: number;
  /** i64, UTC ms */
  end_timestamp_ms: number;
  /** i64, ms — end_timestamp_ms - start_timestamp_ms */
  raw_elapsed_ms: number;
  /** i64, ms — raw_elapsed_ms minus neutral-zone time */
  lap_time_ms: number;
  /** f64, seconds, recording-time (t=0-anchored) */
  start_time_secs: number;
  /** f64, seconds */
  end_time_secs: number;
  /** present when sector_gates is non-empty (C3 §6 item 11, closed) */
  sectors: LapSector[];
  /** C3 §6 item 11, closed */
  neutral_zone_visits: LapNeutralZoneVisit[];
}

/** `session.json`'s `track_visits[]` entry (C1 §6). */
export interface TrackVisitSummary {
  /** UUID (C1 §6 track_visits[].visit_id) */
  visit_id: string;
  /** UUID */
  track_id: string;
  /** i64, UTC ms */
  start_timestamp_ms: number;
  /** i64, UTC ms, always >= start_timestamp_ms */
  end_timestamp_ms: number;
  /** same shape as top-level laps; `[]` when session.json omits the key */
  laps: LapDetail[];
}

/** One channel on a session (C1 §4). */
export interface ChannelSummary {
  channel_id: string;
  /** f64, metadata only — never used to synthesize time (C1 §3.5) */
  nominal_rate_hz: number;
  /** C1 §4.1's per-channel unit */
  unit: string;
  /** channel-level: which sensor this channel came from — C1 §4.2 token,
   *  e.g. "imu0", "gps", "fit", "gpx". Distinct from the file-level
   *  `SessionSummary.source_format`. */
  source_kind: string;
  /** C1 §4.2; "event" iff nominal_rate_hz == 0.0 */
  channel_kind: "fixed-rate" | "event";
  /** u64 */
  sample_count: number;
}

/** `get_session`'s return: C1 `Session` metadata plus `session.json` content
 *  (C3 §3.2). Reads canonical files directly — does not extend
 *  `SessionSummary` (the catalog's cached, possibly-stale copy). */
export interface SessionDetail {
  // --- C1 §2 `Session` ---
  session_id: string;
  /** null for FIT/GPX/CSV sources — C1 §2 */
  device_id: string | null;
  /** i64, session start, Unix epoch ms; 0 = unknown — C1 §3.1 */
  timestamp_utc_ms: number;
  /** null for FIT/GPX/CSV sources — C1 §2 */
  config_checksum: string | null;
  /** file-level, same field as `SessionSummary.source_format` — C1 §2/§4.3 */
  source_format: "idl0" | "fit" | "gpx" | "csv";
  /** hex-encoded, lowercase, 64 chars — C1 §2 */
  blob_sha256: string;
  channels: ChannelSummary[];

  // --- session.json (C1 §6) — SessionMetadata carry-forward ---
  /** "" = not set, no null representation (C1 §6) */
  rider: string;
  bike: string;
  bike_comment: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  long_comment: string;
  tag: string;
  /** verbatim BikeProfile.config at recording time (C1 §6) */
  bike_profile_snapshot: Record<string, unknown> | null;

  // --- session.json (C1 §6) — laps, track visits, lap flags ---
  /** session.json's own laps[] — file-native shape, not the catalog's `LapSummary` */
  laps: LapDetail[];
  track_visits: TrackVisitSummary[];
  /** null/omitted = "use fastest lap" (C1 §6) */
  reference_lap_number: number | null;
  /** sorted ascending (C1 §6) */
  ignored_lap_numbers: number[];
  main_lap_number: number | null;
  overlay_lap_key: { session_id: string; lap_number: number } | null;
  starred_lap_number: number | null;
  /** opaque, do not parse (C1 §6) */
  track_visits_library_hash: string | null;
}

/** One `lap_summary` row for a (session, lap, channel) — C4 §5. */
export interface LapChannelStat {
  /** materialised channel name (C4 §5 lap_summary.channel_id) */
  channel_id: string;
  /** 64-hex — which derived/<hash>.parquet this was computed from */
  derived_hash: string;
  min_value: number;
  max_value: number;
  mean_value: number;
}

/** Catalog-backed lap shape, returned only by `listLaps` (C3 §3.2, C4 §5
 *  `laps` + `lap_summary` tables). Distinct from `SessionDetail.laps`'s
 *  file-native `LapDetail`. */
export interface LapSummary {
  /** i32, 1-based — matches C1 §6 session.json laps[].lap_number and C4 §5 laps.lap_number */
  lap_number: number;
  /** i64 ms (C4 §5 laps.lap_time_ms) */
  lap_time_ms: number;
  /** C4 §5 laps.track_id — null if this lap isn't attributed to a track */
  track_id: string | null;
  /** C4 §5 lap_summary rows for this (session, lap) */
  channel_stats: LapChannelStat[];
}

/** `rebuild_catalog`'s return (C3 §3.2). */
export interface RebuildReport {
  /** u32 */
  sessions_indexed: number;
  /** u32 */
  workbooks_indexed: number;
  /** u32 */
  tracks_indexed: number;
  /** u64, wall-clock time the rebuild took */
  duration_ms: number;
}

/** Catalog `workbooks` table row (C4 §5), column for column. */
export interface WorkbookSummary {
  /** stable id from front matter (C2) */
  workbook_id: string;
  /** the bare, filesystem-sanitised display name used as
   *  `workbooks/<file_name>.idl1wb` (C4 §2) — not a path relative to `workbooks/` */
  file_name: string;
  /** display name from front matter (C2) */
  name: string;
  /** i64, file mtime */
  updated_at_ms: number;
  /** u64 */
  size_bytes: number;
}

/** Catalog `tracks` table row's scalar columns only (C4 §5), excluding
 *  `full_json` — `getTrack` returns that. */
export interface TrackSummary {
  track_id: string;
  name: string;
  venue_name: string;
  /** i64 */
  created_at_ms: number;
  /** i64 */
  updated_at_ms: number;
}

/** A gate: two lat/lon endpoints, decimal degrees (C3 §3.2, ruling R86).
 *  The `.idl0t` file stores degrees x1e7 (SPEC §17b.1); that scaling is a
 *  wire detail of the file, never of the IPC surface. */
export interface Gate {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
}

/** One sector-timing gate (C3 §3.2). */
export interface SectorGate {
  name: string;
  gate: Gate;
}

/** One neutral-zone's enter/exit gate pair (C3 §3.2). */
export interface NeutralZone {
  name: string;
  enter: Gate;
  exit: Gate;
}

/** One point of a track's reference polyline (C3 §3.2). */
export interface GpsFix {
  /** i64, UTC ms */
  timestamp_ms: number;
  lat: number;
  lon: number;
}

/** A track's lap-timing geometry: a single start/finish gate, or a
 *  separate start and finish gate (C3 §3.2). Sealed union tagged by
 *  `kind`. */
export type LapTiming =
  | { kind: "circuit"; start_finish: Gate }
  | { kind: "point_to_point"; start: Gate; finish: Gate };

/** The full `.idl0t` artifact content — the engine's
 *  `track_artifact::model::Track` (`idl-rs` core) serialised (C3 §3.2).
 *  **REVISED (2026-09-06, L8x, ruling R86)** — the four fields C3 §6 open
 *  question 10 left `unknown` are now typed, decimal degrees on the wire. */
export interface TrackDetail {
  track_id: string;
  name: string;
  venue_name: string;
  /** i64 */
  created_at_ms: number;
  /** i64 */
  updated_at_ms: number;
  lap_timing: LapTiming | null;
  neutral_zones: NeutralZone[];
  sector_gates: SectorGate[];
  reference_polyline: GpsFix[];
}

/** `save_track`'s argument (C3 §3.2, ruling R86). One command for create
 *  and edit: `track_id: null` creates (the command mints a UUID v4 and
 *  both timestamps); a string edits, preserving `created_at_ms` and
 *  bumping `updated_at_ms` to now. */
export interface TrackDraft {
  track_id: string | null;
  name: string;
  venue_name: string;
  lap_timing: LapTiming | null;
  neutral_zones: NeutralZone[];
  sector_gates: SectorGate[];
  reference_polyline: GpsFix[];
}

/** `save_track`'s return (C3 §3.2, ruling R86). */
export interface SaveTrackResult {
  track: TrackDetail;
  /** Sessions whose `track_visits_library_hash` no longer matches the
   *  library after this write. The UI offers "Rescan N sessions" over
   *  `rescanTracks`. */
  stale_session_ids: string[];
  warnings: string[];
}

/** `delete_track`'s return (C3 §3.2, ruling R86). */
export interface DeleteTrackReport {
  track_id: string;
  stale_session_ids: string[];
  warnings: string[];
}

/** Lists every indexed session (C3 §3.2). Never on a hot path. */
export async function listSessions(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_sessions");
}

/** Reads one session's canonical files directly, not the catalog cache
 *  (C3 §3.2). Settle-bound, e.g. explicit session-detail open. */
export async function getSession(sessionId: string): Promise<SessionDetail> {
  return invoke<SessionDetail>("get_session", { sessionId });
}

/** Catalog-backed lap list for one session (C3 §3.2). Settle-bound
 *  alongside `getSession`, never a hot path. */
export async function listLaps(sessionId: string): Promise<LapSummary[]> {
  return invoke<LapSummary[]>("list_laps", { sessionId });
}

/** Rebuilds the catalog index from canonical files (C3 §3.2). Explicit
 *  user action, never a hot path. */
export async function rebuildCatalog(): Promise<RebuildReport> {
  return invoke<RebuildReport>("rebuild_catalog");
}

/** Lists every indexed workbook (C3 §3.2). */
export async function listWorkbooks(): Promise<WorkbookSummary[]> {
  return invoke<WorkbookSummary[]>("list_workbooks");
}

/** Lists every indexed track's scalar catalog columns (C3 §3.2). */
export async function listTracks(): Promise<TrackSummary[]> {
  return invoke<TrackSummary[]>("list_tracks");
}

/** Reads the full `.idl0t` artifact for one track (C3 §3.2). Never on a hot
 *  path — settle-bound like `getSession`. */
export async function getTrack(trackId: string): Promise<TrackDetail> {
  return invoke<TrackDetail>("get_track", { trackId });
}

/** The nine editable `session.json` fields (C3 §3.2, ruling R59). `""` is
 *  the only "not set" representation — C1 §6 defines no null for these.
 *  Whole-block replace, not a sparse patch: every field is required, so a
 *  concurrent editor cannot half-apply one. */
export interface SessionMetadataPatch {
  rider: string;
  bike: string;
  bike_comment: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  long_comment: string;
  tag: string;
}

/** Replaces `sessionId`'s nine editable `session.json` fields (C3 §3.2,
 *  ruling R59). Every other key (`laps`, `track_visits`, the lap-flag
 *  fields, `bike_profile_snapshot`, `schema_version`) is left untouched.
 *  Re-reads and returns `getSession`'s own `SessionDetail` so the caller
 *  redraws from canonical truth rather than from what it hoped it wrote.
 *  Explicit save action, never on keystroke. */
export async function saveSessionMetadata(sessionId: string, metadata: SessionMetadataPatch): Promise<SessionDetail> {
  return invoke<SessionDetail>("save_session_metadata", { sessionId, metadata });
}

/** Removes `sessionId`'s session directory and catalog rows (C3 §3.2,
 *  ruling R59). `deleteBlob: true` additionally removes the blob at
 *  `blobs/sha256/<2>/<62>` when no other session still references it
 *  (blobs are content-addressed and shared by construction, C4 §3);
 *  `false` keeps it (idl0's "Forget session"). Explicit, destructive user
 *  action — always confirm first. */
export async function deleteSession(sessionId: string, deleteBlob: boolean): Promise<void> {
  return invoke<void>("delete_session", { sessionId, deleteBlob });
}

/** `rescan_tracks`'s return (C3 §3.2, ruling R83/L2b Task 8) — IDL0_SPEC
 *  §17.4's "Rescan Tracks". */
export interface RescanReport {
  session_id: string;
  /** u32 */
  visits_indexed: number;
  /** u32 */
  laps_indexed: number;
  /** Lap-flag fields cleared because their lap number no longer exists
   *  after renumbering: any of "main_lap_number", "reference_lap_number",
   *  "starred_lap_number", "ignored_lap_numbers". `overlay_lap_key` is
   *  never in this list — it names a lap in *another* session. */
  flags_cleared: string[];
  warnings: string[];
  /** u32, wall-clock time the rescan took */
  elapsed_ms: number;
}

/** Re-runs visit and lap detection for one session against the *current*
 *  track library and rewrites `session.json`'s `laps`/`track_visits`/stamp
 *  fields (C3 §3.2, ruling R83/L2b Task 8). Re-indexes that session's
 *  catalog rows too when `catalog.sqlite` already exists; a catalog-
 *  indexing failure is folded into `warnings` rather than failing the
 *  call. Explicit user action ("Rescan tracks"), never a hot path. */
export async function rescanTracks(sessionId: string): Promise<RescanReport> {
  return invoke<RescanReport>("rescan_tracks", { sessionId });
}

/** Creates (`track.track_id === null`) or edits (`track.track_id` a string)
 *  one track (C3 §3.2, ruling R86). Validates before any write —
 *  `invalid_argument` on a failure, never a partial write. Never calls
 *  `rescanTracks` itself: `stale_session_ids` on the return names every
 *  session whose cached track visits may now be wrong, for the caller to
 *  offer a rescan per id. Explicit save action, never on keystroke. */
export async function saveTrack(track: TrackDraft): Promise<SaveTrackResult> {
  return invoke<SaveTrackResult>("save_track", { track });
}

/** Deletes one track (C3 §3.2, ruling R86). Does not rewrite any
 *  `session.json`; `laps.track_id` survives unattributed
 *  (`ON DELETE SET NULL`, C4 §5). `stale_session_ids` on the return names
 *  every session the caller may want to offer a rescan for. Explicit,
 *  destructive user action — always confirm first. */
export async function deleteTrack(trackId: string): Promise<DeleteTrackReport> {
  return invoke<DeleteTrackReport>("delete_track", { trackId });
}
